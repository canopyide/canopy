import { createContext, useContext } from "react";
import type { DraggableSyntheticListeners } from "@dnd-kit/core";

export interface DragHandleContextValue {
  listeners: DraggableSyntheticListeners | undefined;
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
