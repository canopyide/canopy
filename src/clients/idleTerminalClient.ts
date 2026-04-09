import type { IdleTerminalNotifyConfig, IdleTerminalNotifyPayload } from "@shared/types";

export const idleTerminalClient = {
  getConfig: (): Promise<IdleTerminalNotifyConfig> => {
    return window.electron.idleTerminals.getConfig();
  },

  updateConfig: (config: Partial<IdleTerminalNotifyConfig>): Promise<IdleTerminalNotifyConfig> => {
    return window.electron.idleTerminals.updateConfig(config);
  },

  closeProject: (projectId: string): Promise<void> => {
    return window.electron.idleTerminals.closeProject(projectId);
  },

  dismissProject: (projectId: string): Promise<void> => {
    return window.electron.idleTerminals.dismissProject(projectId);
  },

  onNotify: (callback: (payload: IdleTerminalNotifyPayload) => void): (() => void) => {
    return window.electron.idleTerminals.onNotify(callback);
  },
} as const;
