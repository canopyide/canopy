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

  setFontSize: (fontSize: number): Promise<void> => {
    return window.electron.terminalConfig.setFontSize(fontSize);
  },

  setFontFamily: (fontFamily: string): Promise<void> => {
    return window.electron.terminalConfig.setFontFamily(fontFamily);
  },

  setHybridInputEnabled: (enabled: boolean): Promise<void> => {
    return window.electron.terminalConfig.setHybridInputEnabled(enabled);
  },

  setHybridInputAutoFocus: (enabled: boolean): Promise<void> => {
    return window.electron.terminalConfig.setHybridInputAutoFocus(enabled);
  },
} as const;
