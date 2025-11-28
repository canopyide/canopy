import Store from 'electron-store';

export interface StoreSchema {
  windowState: {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized: boolean;
  };
  appState: {
    activeWorktreeId?: string;
    sidebarWidth: number;
    lastDirectory?: string;
    terminals: Array<{
      id: string;
      type: 'shell' | 'claude' | 'gemini' | 'custom';
      title: string;
      cwd: string;
      worktreeId?: string;
    }>;
  };
}

export const store = new Store<StoreSchema>({
  defaults: {
    windowState: {
      width: 1200,
      height: 800,
      isMaximized: false,
    },
    appState: {
      sidebarWidth: 350,
      terminals: [],
    },
  },
});
