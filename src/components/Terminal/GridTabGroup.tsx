import React, { useCallback, useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { TerminalInstance } from "@/store";
import { useTerminalStore } from "@/store";
import type { TabGroup } from "@/types";
import { GridTabBar } from "./GridTabBar";
import { GridPanel } from "./GridPanel";
import { DragHandleProvider } from "@/components/DragDrop/DragHandleContext";
import type { DragData } from "@/components/DragDrop";

export interface GridTabGroupProps {
  group: TabGroup;
  panels: TerminalInstance[];
  activeTabId: string;
  focusedId: string | null;
  gridPanelCount?: number;
  gridCols?: number;
}

function GridTabGroupComponent({
  group,
  panels,
  activeTabId,
  focusedId,
  gridPanelCount,
  gridCols,
}: GridTabGroupProps) {
  const setActiveTab = useTerminalStore((state) => state.setActiveTab);
  const setFocused = useTerminalStore((state) => state.setFocused);

  // Find the active panel to render
  // Guard against empty panels array to prevent undefined access
  const activePanel = useMemo(() => {
    if (panels.length === 0) return null;
    return panels.find((p) => p.id === activeTabId) ?? panels[0];
  }, [panels, activeTabId]);

  // Use the first panel's ID as the sortable ID for the group
  // This maintains compatibility with the existing drag-and-drop system
  const sortableId = group.id;

  // Build drag data for the entire group
  // If no active panel (empty group), don't provide drag data
  const dragData: DragData | null = useMemo(() => {
    if (!activePanel) return null;
    return {
      terminal: activePanel,
      sourceLocation: "grid",
      sourceIndex: 0, // Will be updated by ContentGrid
      isTabGroup: panels.length > 1, // Only mark as tab group if actually grouped
      tabGroupId: group.id,
      panelIds: group.panelIds,
    };
  }, [activePanel, group.id, group.panelIds, panels.length]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    data: dragData ?? undefined,
    disabled: !activePanel, // Disable dragging if no active panel
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleTabClick = useCallback(
    (panelId: string) => {
      setActiveTab(group.id, panelId);
      setFocused(panelId);
    },
    [group.id, setActiveTab, setFocused]
  );

  // If no active panel (empty group), render nothing
  if (!activePanel) return null;

  const isFocused = activePanel.id === focusedId;

  // Ensure activeTabId matches an actual panel to keep UI in sync
  const resolvedActiveTabId = panels.find((p) => p.id === activeTabId)
    ? activeTabId
    : activePanel.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-tab-group-id={group.id}
      className={cn(
        "flex flex-col h-full min-h-0 terminal-pane",
        isDragging && "opacity-40 ring-2 ring-canopy-accent/50 rounded"
      )}
      {...attributes}
    >
      <DragHandleProvider value={{ listeners }}>
        <GridTabBar
          groupId={group.id}
          panels={panels}
          activeTabId={resolvedActiveTabId}
          onTabClick={handleTabClick}
          isDragging={isDragging}
        />
        <div className="flex-1 min-h-0">
          <GridPanel
            terminal={activePanel}
            isFocused={isFocused}
            gridPanelCount={gridPanelCount}
            gridCols={gridCols}
          />
        </div>
      </DragHandleProvider>
    </div>
  );
}

export const GridTabGroup = React.memo(GridTabGroupComponent);
