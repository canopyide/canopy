import { useCallback, useMemo, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTerminalStore, type TerminalInstance } from "@/store";
import { GridPanel } from "./GridPanel";
import type { TabGroup } from "@/types";
import type { TabInfo } from "@/components/Panel/PanelHeader";

export interface GridTabGroupProps {
  group: TabGroup;
  panels: TerminalInstance[];
  focusedId: string | null;
  gridPanelCount?: number;
  gridCols?: number;
  /** Whether this group item is disabled for drag-drop (e.g., when in trash) */
  disabled?: boolean;
}

export function GridTabGroup({
  group,
  panels,
  focusedId,
  gridPanelCount,
  gridCols,
  disabled = false,
}: GridTabGroupProps) {
  const setFocused = useTerminalStore((state) => state.setFocused);
  const setActiveTab = useTerminalStore((state) => state.setActiveTab);
  const trashTerminal = useTerminalStore((state) => state.trashTerminal);
  const addTerminal = useTerminalStore((state) => state.addTerminal);
  const setTabGroupInfo = useTerminalStore((state) => state.setTabGroupInfo);

  // CRITICAL: Subscribe to activeTabByGroup to get reactive updates
  const storedActiveTabId = useTerminalStore(
    (state) => state.activeTabByGroup.get(group.id) ?? null
  );

  // Reconcile active tab - ensure it's valid and in this group
  const activeTabId = useMemo(() => {
    // If stored ID is valid and in this group, use it
    if (storedActiveTabId && panels.some((p) => p.id === storedActiveTabId)) {
      return storedActiveTabId;
    }
    // If focused panel is in this group, prefer it
    if (focusedId && panels.some((p) => p.id === focusedId)) {
      return focusedId;
    }
    // Default to first panel
    return panels[0]?.id ?? "";
  }, [storedActiveTabId, focusedId, panels]);

  // Sync active tab when it changes or when focused panel in this group changes
  useEffect(() => {
    if (activeTabId && activeTabId !== storedActiveTabId) {
      setActiveTab(group.id, activeTabId);
    }
  }, [activeTabId, storedActiveTabId, group.id, setActiveTab]);

  // Find the active panel to render
  const activePanel = useMemo(() => {
    return panels.find((p) => p.id === activeTabId) ?? panels[0];
  }, [panels, activeTabId]);

  // Build tabs array for PanelHeader
  const tabs: TabInfo[] = useMemo(() => {
    return panels.map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      agentId: p.agentId,
      kind: p.kind ?? "terminal",
      agentState: p.agentState,
      isActive: p.id === activeTabId,
    }));
  }, [panels, activeTabId]);

  // Handle tab click - switch to that tab and focus it
  const handleTabClick = useCallback(
    (tabId: string) => {
      setActiveTab(group.id, tabId);
      setFocused(tabId);
    },
    [group.id, setActiveTab, setFocused]
  );

  // Handle tab close - move to trash (not destructive delete)
  const handleTabClose = useCallback(
    (tabId: string) => {
      // If closing the active tab, switch to another tab first
      if (tabId === activeTabId) {
        const currentIndex = panels.findIndex((p) => p.id === tabId);
        // Try to switch to the next tab, or previous if last
        const nextPanel = panels[currentIndex + 1] ?? panels[currentIndex - 1];
        if (nextPanel) {
          setActiveTab(group.id, nextPanel.id);
          setFocused(nextPanel.id);
        }
      }
      // Move to trash (allows restore/undo)
      trashTerminal(tabId);
    },
    [activeTabId, panels, group.id, setActiveTab, setFocused, trashTerminal]
  );

  // Handle add tab - duplicate the current panel as a new tab
  const handleAddTab = useCallback(async () => {
    if (!activePanel) return;

    const kind = activePanel.kind ?? "terminal";
    const effectiveGroupId = activePanel.tabGroupId ?? activePanel.id;
    const isSinglePanel = !activePanel.tabGroupId;

    try {
      // If this is a single panel (no tabGroupId), assign it to a new group first
      if (isSinglePanel) {
        setTabGroupInfo(activePanel.id, effectiveGroupId, 0);
      }

      // Use timestamp to ensure unique orderInGroup even with concurrent additions
      const newOrderInGroup = Date.now();

      // Build options based on panel kind to copy all relevant properties
      const baseOptions = {
        kind,
        type: activePanel.type,
        agentId: activePanel.agentId,
        cwd: activePanel.cwd || "",
        worktreeId: activePanel.worktreeId,
        location: activePanel.location ?? "grid",
        tabGroupId: effectiveGroupId,
        orderInGroup: newOrderInGroup,
        exitBehavior: activePanel.exitBehavior,
        isInputLocked: activePanel.isInputLocked,
      };

      // Add kind-specific properties
      let kindSpecificOptions = {};
      if (kind === "browser") {
        kindSpecificOptions = { browserUrl: activePanel.browserUrl };
      } else if (kind === "notes") {
        kindSpecificOptions = {
          notePath: (activePanel as any).notePath,
          noteId: (activePanel as any).noteId,
          scope: (activePanel as any).scope,
          createdAt: Date.now(),
        };
      } else if (kind === "dev-preview") {
        kindSpecificOptions = {
          devCommand: (activePanel as any).devCommand,
          browserUrl: activePanel.browserUrl,
        };
      }

      // Create the new panel with all inherited properties
      const newPanelId = await addTerminal({
        ...baseOptions,
        ...kindSpecificOptions,
      });

      // Focus and activate the new tab
      setActiveTab(effectiveGroupId, newPanelId);
      setFocused(newPanelId);
    } catch (error) {
      console.error("Failed to add tab:", error);
      // Rollback tabGroupId if we modified a single panel but failed to create the duplicate
      if (isSinglePanel) {
        setTabGroupInfo(activePanel.id, undefined, undefined);
      }
    }
  }, [activePanel, addTerminal, setTabGroupInfo, setActiveTab, setFocused]);

  // Set up sortable for dragging the entire group as a unit
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
    disabled,
    data: {
      type: "tab-group",
      groupId: group.id,
      container: "grid",
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // If there's no active panel (shouldn't happen), return null
  if (!activePanel) {
    return null;
  }

  // Check if this group's active panel is focused
  const isFocused = activePanel.id === focusedId;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="h-full"
      data-tab-group-id={group.id}
    >
      <GridPanel
        terminal={activePanel}
        isFocused={isFocused}
        gridPanelCount={gridPanelCount}
        gridCols={gridCols}
        tabs={tabs}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onAddTab={handleAddTab}
      />
    </div>
  );
}
