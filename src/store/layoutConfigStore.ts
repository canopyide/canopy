import { create } from "zustand";
import type { TerminalGridConfig } from "@/types";

const DEFAULT_LAYOUT_CONFIG: TerminalGridConfig = {
  strategy: "automatic",
  value: 3,
};

const DEFAULT_PAGE_SIZE = 6;
const MAX_PAGE_SIZE = 16;

interface PaginationState {
  currentPage: number;
  pageSize: number;
}

interface LayoutConfigState {
  layoutConfig: TerminalGridConfig;
  pagination: PaginationState;
  setLayoutConfig: (config: TerminalGridConfig) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

export const useLayoutConfigStore = create<LayoutConfigState>()((set) => ({
  layoutConfig: DEFAULT_LAYOUT_CONFIG,
  pagination: {
    currentPage: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  },
  setLayoutConfig: (config) => set({ layoutConfig: config }),
  setPage: (page) =>
    set((state) => {
      const nextPage = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0;
      return { pagination: { ...state.pagination, currentPage: nextPage } };
    }),
  setPageSize: (size) =>
    set((state) => {
      const normalizedSize = Number.isFinite(size) ? Math.floor(size) : DEFAULT_PAGE_SIZE;
      const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, normalizedSize));
      return { pagination: { ...state.pagination, pageSize, currentPage: 0 } };
    }),
}));
