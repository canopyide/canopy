import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDndMonitor } from "@dnd-kit/core";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, getBaseTitle } from "@/lib/utils";
import { getBrandColorHex } from "@/lib/colorUtils";
import {
  useTerminalInputStore,
  useTerminalStore,
  useSidecarStore,
  useDockStore,
  type TerminalInstance,
} from "@/store";
import { TerminalContextMenu } from "@/components/Terminal/TerminalContextMenu";
import { TerminalIcon } from "@/components/Terminal/TerminalIcon";
import { getTerminalFocusTarget } from "@/components/Terminal/terminalFocus";
import { STATE_ICONS, STATE_COLORS } from "@/components/Worktree/terminalStateConfig";
import { TerminalRefreshTier } from "@/types";
import { terminalClient } from "@/clients";
import { terminalInstanceService } from "@/services/TerminalInstanceService";
import { POPOVER_MIN_HEIGHT, POPOVER_MAX_HEIGHT_RATIO } from "@/store/dockStore";
import { useDockPanelPortal } from "@/components/Layout/DockPanelOffscreenContainer";
import { DockedTabBar } from "./DockedTabBar";
import type { TabGroup } from "@/types";

interface DockedTabGroupProps {
  group: TabGroup;
  panels: TerminalInstance[];
}

export function DockedTabGroup({ group, panels }: DockedTabGroupProps) {
  const activeDockTerminalId = useTerminalStore((s) => s.activeDockTerminalId);
  const openDockTerminal = useTerminalStore((s) => s.openDockTerminal);
  const closeDockTerminal = useTerminalStore((s) => s.closeDockTerminal);
  const backendStatus = useTerminalStore((s) => s.backendStatus);
  const setActiveTab = useTerminalStore((s) => s.setActiveTab);
  const setFocused = useTerminalStore((s) => s.setFocused);
  const hybridInputEnabled = useTerminalInputStore((s) => s.hybridInputEnabled);
  const hybridInputAutoFocus = useTerminalInputStore((s) => s.hybridInputAutoFocus);

  // Get the active tab for this group (subscribed so it re-renders on changes)
  const storedActiveTabId = useTerminalStore((s) => s.getActiveTabId(group.id));

  // Reconcile active tab with activeDockTerminalId and validate membership
  const activeTabId = useMemo(() => {
    // If a dock terminal is open and it's in this group, treat it as active
    if (activeDockTerminalId && panels.some((p) => p.id === activeDockTerminalId)) {
      return activeDockTerminalId;
    }
    // Validate stored active tab is still in the group
    if (storedActiveTabId && panels.some((p) => p.id === storedActiveTabId)) {
      return storedActiveTabId;
    }
    // Fallback to first panel
    return panels[0]?.id ?? "";
  }, [activeDockTerminalId, storedActiveTabId, panels]);

  const activePanel = panels.find((p) => p.id === activeTabId) ?? panels[0];

  // Sync store if reconciled activeTabId differs from stored
  useEffect(() => {
    if (activeTabId && activeTabId !== storedActiveTabId) {
      setActiveTab(group.id, activeTabId);
    }
  }, [activeTabId, storedActiveTabId, group.id, setActiveTab]);

  // Check if this group's popover should be open
  // A group is open if any of its panels is the activeDockTerminalId
  const isOpen = panels.some((p) => p.id === activeDockTerminalId);

  // Track when popover was just programmatically opened to ignore immediate close events
  const wasJustOpenedRef = useRef(false);
  const prevIsOpenRef = useRef(isOpen);

  useEffect(() => {
    prevIsOpenRef.current = isOpen;

    if (!isOpen) return;

    wasJustOpenedRef.current = true;
    const timer = setTimeout(() => {
      wasJustOpenedRef.current = false;
    }, 100);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const { isOpen: sidecarOpen, width: sidecarWidth } = useSidecarStore(
    useShallow((s) => ({ isOpen: s.isOpen, width: s.width }))
  );

  const popoverHeight = useDockStore((s) => s.popoverHeight);
  const setPopoverHeight = useDockStore((s) => s.setPopoverHeight);

  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  const RESIZE_STEP = 10;

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStartY.current = e.clientY;
      resizeStartHeight.current = popoverHeight;
    },
    [popoverHeight]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const maxHeight = window.innerHeight * POPOVER_MAX_HEIGHT_RATIO;
        const newHeight = Math.min(popoverHeight + RESIZE_STEP, maxHeight);
        setPopoverHeight(newHeight);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const newHeight = Math.max(popoverHeight - RESIZE_STEP, POPOVER_MIN_HEIGHT);
        setPopoverHeight(newHeight);
      }
    },
    [popoverHeight, setPopoverHeight]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = resizeStartY.current - e.clientY;
      const newHeight = resizeStartHeight.current + deltaY;
      setPopoverHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      requestAnimationFrame(() => {
        if (activePanel) {
          terminalInstanceService.fit(activePanel.id);
        }
      });
    };

    const handleBlur = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [isResizing, activePanel, setPopoverHeight]);

  const collisionPadding = useMemo(() => {
    const basePadding = 32;
    return {
      top: basePadding,
      left: basePadding,
      bottom: basePadding,
      right: sidecarOpen ? sidecarWidth + basePadding : basePadding,
    };
  }, [sidecarOpen, sidecarWidth]);

  // Track previous active panel to downgrade its refresh tier
  const prevActivePanelRef = useRef<string | null>(null);

  // Toggle buffering based on popover open state
  useEffect(() => {
    let cancelled = false;

    const applyBufferingState = async () => {
      try {
        // Downgrade previous active panel if it changed while open
        if (
          isOpen &&
          prevActivePanelRef.current &&
          prevActivePanelRef.current !== activePanel?.id
        ) {
          terminalInstanceService.applyRendererPolicy(
            prevActivePanelRef.current,
            TerminalRefreshTier.BACKGROUND
          );
        }

        if (isOpen && activePanel) {
          prevActivePanelRef.current = activePanel.id;

          if (!cancelled) {
            const MAX_RETRIES = 10;
            const RETRY_DELAY_MS = 16;

            let dims: { cols: number; rows: number } | null = null;
            for (let attempt = 0; attempt < MAX_RETRIES && !cancelled; attempt++) {
              await new Promise((resolve) => requestAnimationFrame(resolve));
              if (cancelled) return;

              dims = terminalInstanceService.fit(activePanel.id);
              if (dims) break;

              if (attempt < MAX_RETRIES - 1) {
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
              }
            }

            if (cancelled) return;

            if (!dims) {
              return;
            }

            try {
              await terminalClient.resize(activePanel.id, dims.cols, dims.rows);
            } catch (resizeError) {
              console.warn(`Failed to resize PTY for terminal ${activePanel.id}:`, resizeError);
              return;
            }

            if (cancelled) return;

            terminalInstanceService.applyRendererPolicy(
              activePanel.id,
              TerminalRefreshTier.VISIBLE
            );
          }
        } else if (activePanel) {
          prevActivePanelRef.current = null;
          if (!cancelled) {
            terminalInstanceService.applyRendererPolicy(
              activePanel.id,
              TerminalRefreshTier.BACKGROUND
            );
          }
        }
      } catch (error) {
        console.warn(`Failed to apply dock state for terminal ${activePanel?.id}:`, error);
      }
    };

    applyBufferingState();

    return () => {
      cancelled = true;
    };
  }, [isOpen, activePanel]);

  // Auto-close popover when drag starts for any panel in this group
  useDndMonitor({
    onDragStart: ({ active }) => {
      if (panels.some((p) => p.id === active.id) && isOpen) {
        closeDockTerminal();
      }
    },
  });

  const portalTarget = useDockPanelPortal();
  const portalContainerRef = useRef<HTMLDivElement>(null);

  // Register/unregister portal target when popover opens/closes
  useEffect(() => {
    if (isOpen && portalContainerRef.current && activePanel) {
      portalTarget(activePanel.id, portalContainerRef.current);
    } else if (activePanel) {
      portalTarget(activePanel.id, null);
    }

    return () => {
      if (activePanel) {
        portalTarget(activePanel.id, null);
      }
    };
  }, [isOpen, activePanel, portalTarget]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openDockTerminal(activePanel?.id ?? panels[0]?.id);
      } else {
        if (wasJustOpenedRef.current) {
          return;
        }
        closeDockTerminal();
      }
    },
    [activePanel, panels, openDockTerminal, closeDockTerminal]
  );

  const handleTabClick = useCallback(
    (panelId: string) => {
      setActiveTab(group.id, panelId);
      setFocused(panelId);
      // Update activeDockTerminalId to the clicked tab
      openDockTerminal(panelId);

      // Focus the terminal after tab switch (respecting hybrid input settings)
      const panel = panels.find((p) => p.id === panelId);
      if (panel) {
        const focusTarget = getTerminalFocusTarget({
          isAgentTerminal: panel.type !== "terminal",
          isInputDisabled: backendStatus === "disconnected" || backendStatus === "recovering",
          hybridInputEnabled,
          hybridInputAutoFocus,
        });

        if (focusTarget === "xterm") {
          setTimeout(() => terminalInstanceService.focus(panelId), 50);
        }
      }
    },
    [
      group.id,
      setActiveTab,
      setFocused,
      openDockTerminal,
      panels,
      backendStatus,
      hybridInputEnabled,
      hybridInputAutoFocus,
    ]
  );

  // For trigger display, use the first panel's info
  const triggerPanel = panels[0];
  if (!triggerPanel) return null;

  const isWorking = triggerPanel.agentState === "working";
  const isRunning = triggerPanel.agentState === "running";
  const isWaiting = triggerPanel.agentState === "waiting";
  const isActive = isWorking || isRunning || isWaiting;
  const commandText = triggerPanel.activityHeadline || triggerPanel.lastCommand;
  const brandColor = getBrandColorHex(triggerPanel.type);
  const agentState = triggerPanel.agentState;
  const displayTitle = getBaseTitle(triggerPanel.title);
  const showStateIcon = agentState && agentState !== "idle" && agentState !== "completed";
  const StateIcon = showStateIcon ? STATE_ICONS[agentState] : null;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <TerminalContextMenu terminalId={triggerPanel.id} forceLocation="dock">
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-1.5 px-3 h-[var(--dock-item-height)] rounded-[var(--radius-md)] text-xs border transition-all duration-150 max-w-[280px]",
              "bg-white/[0.02] border-divider text-canopy-text/70",
              "hover:text-canopy-text hover:bg-white/[0.04]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent focus-visible:outline-offset-2",
              "cursor-grab active:cursor-grabbing",
              isOpen &&
                "bg-white/[0.08] text-canopy-text border-canopy-accent/40 ring-1 ring-inset ring-canopy-accent/30"
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isOpen) {
                closeDockTerminal();
              } else {
                openDockTerminal(activePanel?.id ?? triggerPanel.id);
              }
            }}
            title={`${triggerPanel.title} (+${panels.length - 1} more) - Click to preview, drag to reorder`}
            aria-label={`${triggerPanel.title} (+${panels.length - 1} more) - Click to preview, drag to reorder`}
          >
            <div
              className={cn(
                "flex items-center justify-center transition-opacity shrink-0",
                isOpen || isActive ? "opacity-100" : "opacity-70"
              )}
            >
              <TerminalIcon
                type={triggerPanel.type}
                kind={triggerPanel.kind}
                className="w-3.5 h-3.5"
                brandColor={brandColor}
              />
            </div>
            <span className="truncate min-w-[48px] max-w-[140px] font-sans font-medium">
              {displayTitle}
            </span>

            {/* Tab count badge (only show for multiple panels) */}
            {panels.length > 1 && (
              <span className="px-1 py-0.5 text-[10px] bg-white/10 rounded text-canopy-text/60 shrink-0">
                {panels.length}
              </span>
            )}

            {isActive && commandText && (
              <>
                <div className="h-3 w-px bg-white/10 shrink-0" aria-hidden="true" />
                <span
                  className="truncate flex-1 min-w-0 text-[11px] text-canopy-text/50 font-mono"
                  title={commandText}
                >
                  {commandText}
                </span>
              </>
            )}

            {showStateIcon && StateIcon && (
              <div
                className={cn("flex items-center shrink-0", STATE_COLORS[agentState])}
                title={`Agent ${agentState}`}
              >
                <StateIcon
                  className={cn(
                    "w-3.5 h-3.5",
                    agentState === "working" && "animate-spin",
                    agentState === "waiting" && "animate-breathe",
                    "motion-reduce:animate-none"
                  )}
                  aria-hidden="true"
                />
              </div>
            )}
          </button>
        </PopoverTrigger>
      </TerminalContextMenu>

      <PopoverContent
        className={cn(
          "w-[700px] max-w-[90vw] p-0 bg-canopy-bg/95 backdrop-blur-sm border border-[var(--border-overlay)] shadow-[var(--shadow-dock-popover)] rounded-[var(--radius-lg)] overflow-hidden",
          isResizing && "select-none"
        )}
        style={{ height: popoverHeight }}
        side="top"
        align="start"
        sideOffset={10}
        collisionPadding={collisionPadding}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (!activePanel) return;

          const focusTarget = getTerminalFocusTarget({
            isAgentTerminal: activePanel.type !== "terminal",
            isInputDisabled: backendStatus === "disconnected" || backendStatus === "recovering",
            hybridInputEnabled,
            hybridInputAutoFocus,
          });

          if (focusTarget === "hybridInput") {
            return;
          }

          setTimeout(() => terminalInstanceService.focus(activePanel.id), 50);
        }}
      >
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-10 group flex items-center justify-center transition-colors",
            "hover:bg-white/[0.03] focus-visible:outline-none focus-visible:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-canopy-accent/50",
            isResizing && "bg-canopy-accent/20"
          )}
          onMouseDown={handleResizeStart}
          onKeyDown={handleKeyDown}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize docked terminal popover"
          aria-valuenow={Math.round(popoverHeight)}
          aria-valuemin={POPOVER_MIN_HEIGHT}
          aria-valuemax={Math.round(window.innerHeight * POPOVER_MAX_HEIGHT_RATIO)}
          tabIndex={0}
        >
          <div
            className={cn(
              "w-10 h-0.5 rounded-full transition-colors",
              "bg-canopy-text/15",
              "group-hover:bg-canopy-text/30 group-focus-visible:bg-canopy-accent",
              isResizing && "bg-canopy-accent"
            )}
          />
        </div>

        {/* Tab bar for multi-panel groups */}
        <div className="pt-2">
          <DockedTabBar panels={panels} activeTabId={activeTabId} onTabClick={handleTabClick} />
        </div>

        {/* Portal target - content is rendered in DockPanelOffscreenContainer and portaled here */}
        <div
          ref={portalContainerRef}
          className="w-full flex-1 flex flex-col min-h-0"
          data-dock-portal-target={activePanel?.id}
        />
      </PopoverContent>
    </Popover>
  );
}
