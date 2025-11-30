/**
 * AI IPC Client
 *
 * Provides a typed interface for AI service IPC operations.
 * Wraps window.electron.ai.* calls for testability and maintainability.
 */

import type { AIServiceState, ProjectIdentity } from "@shared/types";

/**
 * Client for AI service IPC operations.
 *
 * @example
 * ```typescript
 * import { aiClient } from "@/clients/aiClient";
 *
 * const config = await aiClient.getConfig();
 * const isValid = await aiClient.validateKey(apiKey);
 * ```
 */
export const aiClient = {
  /** Get AI service configuration */
  getConfig: (): Promise<AIServiceState> => {
    return window.electron.ai.getConfig();
  },

  /** Set the OpenAI API key */
  setKey: (apiKey: string): Promise<boolean> => {
    return window.electron.ai.setKey(apiKey);
  },

  /** Clear the OpenAI API key */
  clearKey: (): Promise<void> => {
    return window.electron.ai.clearKey();
  },

  /** Set the AI model */
  setModel: (model: string): Promise<void> => {
    return window.electron.ai.setModel(model);
  },

  /** Enable or disable AI features */
  setEnabled: (enabled: boolean): Promise<void> => {
    return window.electron.ai.setEnabled(enabled);
  },

  /** Validate an API key */
  validateKey: (apiKey: string): Promise<boolean> => {
    return window.electron.ai.validateKey(apiKey);
  },

  /** Generate project identity using AI */
  generateProjectIdentity: (projectPath: string): Promise<ProjectIdentity | null> => {
    return window.electron.ai.generateProjectIdentity(projectPath);
  },
} as const;
