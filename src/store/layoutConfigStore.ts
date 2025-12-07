import { create } from "zustand";
import type { TerminalGridConfig } from "@/types";

const DEFAULT_LAYOUT_CONFIG: TerminalGridConfig = {
  strategy: "automatic",
  value: 3,
};

interface LayoutConfigState {
  layoutConfig: TerminalGridConfig;
  setLayoutConfig: (config: TerminalGridConfig) => void;
}

export const useLayoutConfigStore = create<LayoutConfigState>()((set) => ({
  layoutConfig: DEFAULT_LAYOUT_CONFIG,
  setLayoutConfig: (config) => set({ layoutConfig: config }),
}));
