import { create } from "zustand";
import type { AgentFlavor } from "@shared/config/agentRegistry";

interface CcrFlavorsState {
  ccrFlavorsByAgent: Record<string, AgentFlavor[]>;
  setCcrFlavors: (agentId: string, flavors: AgentFlavor[]) => void;
}

export const useCcrFlavorsStore = create<CcrFlavorsState>((set) => ({
  ccrFlavorsByAgent: {},
  setCcrFlavors: (agentId, flavors) =>
    set((state) => ({
      ccrFlavorsByAgent: { ...state.ccrFlavorsByAgent, [agentId]: flavors },
    })),
}));
