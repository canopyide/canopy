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
      />
    </div>
  );
}
