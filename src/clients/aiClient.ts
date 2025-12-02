import type { AIServiceState, ProjectIdentity } from "@shared/types";

/**
 * @example
 * const config = await aiClient.getConfig();
 * const isValid = await aiClient.validateKey(apiKey);
 */
export const aiClient = {
  getConfig: (): Promise<AIServiceState> => {
    return window.electron.ai.getConfig();
  },

  setKey: (apiKey: string): Promise<boolean> => {
    return window.electron.ai.setKey(apiKey);
  },

  clearKey: (): Promise<void> => {
    return window.electron.ai.clearKey();
  },

  setModel: (model: string): Promise<void> => {
    return window.electron.ai.setModel(model);
  },

  setEnabled: (enabled: boolean): Promise<void> => {
    return window.electron.ai.setEnabled(enabled);
  },

  validateKey: (apiKey: string): Promise<boolean> => {
    return window.electron.ai.validateKey(apiKey);
  },

  generateProjectIdentity: (projectPath: string): Promise<ProjectIdentity | null> => {
    return window.electron.ai.generateProjectIdentity(projectPath);
  },
} as const;
