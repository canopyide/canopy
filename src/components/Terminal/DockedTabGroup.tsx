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
import { TerminalRefreshTier, type TabGroup } from "@/types";
import { terminalClient } from "@/clients";
import { terminalInstanceService } from "@/services/TerminalInstanceService";
import { POPOVER_MIN_HEIGHT, POPOVER_MAX_HEIGHT_RATIO } from "@/store/dockStore";
import { useDockPanelPortal } from "../Layout/DockPanelOffscreenContainer";

export interface DockedTabGroupProps {
  group: TabGroup;
  panels: TerminalInstance[];
}

export function DockedTabGroup({ group, panels }: DockedTabGroupProps) {
  const activeDockTerminalId = useTerminalStore((s) => s.activeDockTerminalId);
  const openDockTerminal = useTerminalStore((s) => s.openDockTerminal);
  const closeDockTerminal = useTerminalStore((s) => s.closeDockTerminal);
  const backendStatus = useTerminalStore((s) => s.backendStatus);
  const hybridInputEnabled = useTerminalInputStore((s) => s.hybridInputEnabled);
  const hybridInputAutoFocus = useTerminalInputStore((s) => s.hybridInputAutoFocus);

  // Track active tab within this group (local state, defaults to first panel)
  const [activeTabId, setActiveTabId] = useState<string>(group.activeTabId || panels[0]?.id || "");

  // Update active tab if it's no longer in the group
  useEffect(() => {
    if (!panels.find((p) => p.id === activeTabId) && panels.length > 0) {
      setActiveTabId(panels[0].id);
    }
  }, [panels, activeTabId]);

  // Derive isOpen from store state - check if any panel in this group is open
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

  // When popover opens for a specific terminal, set that as active tab
  useEffect(() => {
    if (activeDockTerminalId && panels.find((p) => p.id === activeDockTerminalId)) {
      setActiveTabId(activeDockTerminalId);
    }
  }, [activeDockTerminalId, panels]);

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
        terminalInstanceService.fit(activeTabId);
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
  }, [isResizing, activeTabId, setPopoverHeight]);

  const collisionPadding = useMemo(() => {
    const basePadding = 32;
    return {
      top: basePadding,
      left: basePadding,
      bottom: basePadding,
      right: sidecarOpen ? sidecarWidth + basePadding : basePadding,
    };
  }, [sidecarOpen, sidecarWidth]);

  // Toggle buffering based on popover open state for active tab
  useEffect(() => {
    let cancelled = false;

    const applyBufferingState = async () => {
      try {
        if (isOpen) {
          if (!cancelled) {
            const MAX_RETRIES = 10;
            const RETRY_DELAY_MS = 16;

            let dims: { cols: number; rows: number } | null = null;
            for (let attempt = 0; attempt < MAX_RETRIES && !cancelled; attempt++) {
              await new Promise((resolve) => requestAnimationFrame(resolve));
              if (cancelled) return;

              dims = terminalInstanceService.fit(activeTabId);
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
              await terminalClient.resize(activeTabId, dims.cols, dims.rows);
            } catch (resizeError) {
              console.warn(`Failed to resize PTY for terminal ${activeTabId}:`, resizeError);
              return;
            }

            if (cancelled) return;

            terminalInstanceService.applyRendererPolicy(activeTabId, TerminalRefreshTier.VISIBLE);
          }
        } else {
          // When closed, background all panels in the group
          if (!cancelled) {
            panels.forEach((panel) => {
              terminalInstanceService.applyRendererPolicy(panel.id, TerminalRefreshTier.BACKGROUND);
            });
          }
        }
      } catch (error) {
        console.warn(`Failed to apply dock state for tab group ${group.id}:`, error);
      }
    };

    applyBufferingState();

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTabId, group.id, panels]);

  // Auto-close popover when drag starts for any terminal in this group
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
  // Use stable panel IDs string to avoid thrashing
  const panelIdsKey = useMemo(() => panels.map((p) => p.id).join(","), [panels]);

  useEffect(() => {
    if (isOpen && portalContainerRef.current) {
      portalTarget(activeTabId, portalContainerRef.current);
    } else {
      // Clear all portal targets for this group when closing
      const panelIds = panelIdsKey.split(",");
      panelIds.forEach((id) => {
        if (id) portalTarget(id, null);
      });
    }

    return () => {
      const panelIds = panelIdsKey.split(",");
      panelIds.forEach((id) => {
        if (id) portalTarget(id, null);
      });
    };
  }, [isOpen, activeTabId, panelIdsKey, portalTarget]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openDockTerminal(activeTabId);
      } else {
        if (wasJustOpenedRef.current) {
          return;
        }
        closeDockTerminal();
      }
    },
    [activeTabId, openDockTerminal, closeDockTerminal]
  );

  const handleTabClick = useCallback(
    (tabId: string) => {
      const prevActiveTabId = activeTabId;
      setActiveTabId(tabId);

      // Update global dock terminal state to keep focus tracking in sync
      if (isOpen) {
        openDockTerminal(tabId);
      }

      // Update portal target to the new active tab
      if (isOpen && portalContainerRef.current) {
        // Clear only previous tab's portal target (not all panels)
        if (prevActiveTabId) {
          portalTarget(prevActiveTabId, null);
        }
        // Set new portal target
        portalTarget(tabId, portalContainerRef.current);

        // Background the previous tab, make new tab visible
        if (prevActiveTabId) {
          terminalInstanceService.applyRendererPolicy(prevActiveTabId, TerminalRefreshTier.BACKGROUND);
        }

        // Fit and update the new terminal
        requestAnimationFrame(() => {
          const dims = terminalInstanceService.fit(tabId);
          if (dims) {
            terminalClient.resize(tabId, dims.cols, dims.rows);
          }
          terminalInstanceService.applyRendererPolicy(tabId, TerminalRefreshTier.VISIBLE);
        });
      }
    },
    [isOpen, activeTabId, openDockTerminal, portalTarget]
  );

  // Get the first panel for trigger display
  const firstPanel = panels[0];
  if (!firstPanel) return null;

  const additionalTabCount = panels.length - 1;
  const isWorking = firstPanel.agentState === "working";
  const isRunning = firstPanel.agentState === "running";
  const isWaiting = firstPanel.agentState === "waiting";
  const isActive = isWorking || isRunning || isWaiting;
  const commandText = firstPanel.activityHeadline || firstPanel.lastCommand;
  const brandColor = getBrandColorHex(firstPanel.type);
  const agentState = firstPanel.agentState;
  const displayTitle = getBaseTitle(firstPanel.title);
  const showStateIcon = agentState && agentState !== "idle" && agentState !== "completed";
  const StateIcon = showStateIcon ? STATE_ICONS[agentState] : null;

  const activePanel = panels.find((p) => p.id === activeTabId) || firstPanel;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <TerminalContextMenu terminalId={firstPanel.id} forceLocation="dock">
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
                openDockTerminal(activeTabId);
              }
            }}
            title={`${firstPanel.title} - ${additionalTabCount} more tabs - Click to preview, drag to reorder`}
            aria-label={`${firstPanel.title} with ${additionalTabCount} more tabs - Click to preview, drag to reorder`}
          >
            <div
              className={cn(
                "flex items-center justify-center transition-opacity shrink-0",
                isOpen || isActive ? "opacity-100" : "opacity-70"
              )}
            >
              <TerminalIcon
                type={firstPanel.type}
                kind={firstPanel.kind}
                className="w-3.5 h-3.5"
                brandColor={brandColor}
              />
            </div>
            <span className="truncate min-w-[48px] max-w-[140px] font-sans font-medium">
              {displayTitle}
            </span>

            {/* Tab count badge */}
            {additionalTabCount > 0 && (
              <span
                className={cn(
                  "shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded-full",
                  "bg-canopy-accent/20 text-canopy-accent"
                )}
                title={`${additionalTabCount + 1} tabs in this group`}
              >
                +{additionalTabCount}
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
          const focusTarget = getTerminalFocusTarget({
            isAgentTerminal: activePanel.type !== "terminal",
            isInputDisabled: backendStatus === "disconnected" || backendStatus === "recovering",
            hybridInputEnabled,
            hybridInputAutoFocus,
          });

          if (focusTarget === "hybridInput") {
            return;
          }

          setTimeout(() => terminalInstanceService.focus(activeTabId), 50);
        }}
      >
        {/* Resize handle */}
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

        {/* Tab bar - only show if more than 1 panel */}
        {panels.length > 1 && (
          <div
            className="flex items-center border-b border-divider bg-[var(--color-surface)] pt-2"
            role="tablist"
            aria-label="Tab group tabs"
          >
            {panels.map((panel) => {
              const tabBrandColor = getBrandColorHex(panel.type);
              const tabIsActive = panel.id === activeTabId;
              const tabAgentState = panel.agentState;
              const showTabStateIcon =
                tabAgentState && tabAgentState !== "idle" && tabAgentState !== "completed";
              const TabStateIcon = showTabStateIcon ? STATE_ICONS[tabAgentState] : null;

              return (
                <button
                  key={panel.id}
                  role="tab"
                  aria-selected={tabIsActive}
                  tabIndex={tabIsActive ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTabClick(panel.id);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                    "border-b-2 -mb-px",
                    tabIsActive
                      ? "border-canopy-accent text-canopy-text bg-white/[0.02]"
                      : "border-transparent text-canopy-text/60 hover:text-canopy-text hover:bg-white/[0.02]"
                  )}
                >
                  <TerminalIcon
                    type={panel.type}
                    kind={panel.kind}
                    className="w-3.5 h-3.5 shrink-0"
                    brandColor={tabBrandColor}
                  />
                  <span className="truncate max-w-[100px]">{getBaseTitle(panel.title)}</span>
                  {showTabStateIcon && TabStateIcon && (
                    <TabStateIcon
                      className={cn(
                        "w-3 h-3 shrink-0",
                        STATE_COLORS[tabAgentState],
                        tabAgentState === "working" && "animate-spin",
                        tabAgentState === "waiting" && "animate-breathe",
                        "motion-reduce:animate-none"
                      )}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Portal target - content is rendered in DockPanelOffscreenContainer and portaled here */}
        <div
          ref={portalContainerRef}
          className="w-full flex-1 flex flex-col"
          style={{ height: panels.length > 1 ? "calc(100% - 34px)" : "100%" }}
          data-dock-portal-target={activeTabId}
        />
      </PopoverContent>
    </Popover>
  );
}
