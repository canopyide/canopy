import type { AppState, HydrateResult } from "@shared/types";

/**
 * @example
 * const state = await appClient.getState();
 * await appClient.setState({ sidebarWidth: 400 });
 */
export const appClient = {
  getState: (): Promise<AppState> => {
    return window.electron.app.getState();
  },

  setState: (partialState: Partial<AppState>): Promise<void> => {
    return window.electron.app.setState(partialState);
  },

  getVersion: (): Promise<string> => {
    return window.electron.app.getVersion();
  },

  hydrate: (): Promise<HydrateResult> => {
    return window.electron.app.hydrate();
  },
} as const;
