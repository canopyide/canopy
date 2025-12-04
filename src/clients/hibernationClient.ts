import type { HibernationConfig } from "@shared/types";

export const hibernationClient = {
  getConfig: (): Promise<HibernationConfig> => {
    return window.electron.hibernation.getConfig();
  },

  updateConfig: (config: Partial<HibernationConfig>): Promise<HibernationConfig> => {
    return window.electron.hibernation.updateConfig(config);
  },
} as const;
