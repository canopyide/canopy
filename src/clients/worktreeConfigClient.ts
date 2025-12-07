import type { WorktreeConfig } from "@shared/types";

export const worktreeConfigClient = {
  get: (): Promise<WorktreeConfig> => {
    return window.electron.worktreeConfig.get();
  },

  setPattern: (pattern: string): Promise<WorktreeConfig> => {
    return window.electron.worktreeConfig.setPattern(pattern);
  },
} as const;
