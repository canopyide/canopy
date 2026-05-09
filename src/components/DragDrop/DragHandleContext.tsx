import { createContext, useContext } from "react";
import type { DraggableSyntheticListeners } from "@dnd-kit/core";

export interface DragHandleContextValue {
  listeners: DraggableSyntheticListeners | undefined;
  // Forward dnd-kit's activator-node ref so the consumer (e.g. PanelHeader)
  // can register the focusable drag surface KeyboardSensor watches for
  // Space/Enter activation. Without this, falling back to setNodeRef points
  // at the sortable container — which strips role/tabIndex to satisfy axe's
  // nested-interactive rule — so keyboard drag silently fails.
  setActivatorNodeRef?: (node: HTMLElement | null) => void;
}

const DragHandleContext = createContext<DragHandleContextValue | null>(null);

export function DragHandleProvider({
  value,
  children,
}: {
  value: DragHandleContextValue;
  children: React.ReactNode;
}) {
  return <DragHandleContext.Provider value={value}>{children}</DragHandleContext.Provider>;
}

export function useDragHandle() {
  return useContext(DragHandleContext);
}
