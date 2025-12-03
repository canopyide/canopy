import type { TerminalConfig } from "@shared/types";

export const terminalConfigClient = {
  get: (): Promise<TerminalConfig> => {
    return window.electron.terminalConfig.get();
  },

  setScrollback: (scrollbackLines: number): Promise<void> => {
    return window.electron.terminalConfig.setScrollback(scrollbackLines);
  },

  setPerformanceMode: (performanceMode: boolean): Promise<void> => {
    return window.electron.terminalConfig.setPerformanceMode(performanceMode);
  },
} as const;
