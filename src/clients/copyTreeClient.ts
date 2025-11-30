/**
 * CopyTree IPC Client
 *
 * Provides a typed interface for CopyTree-related IPC operations.
 * Wraps window.electron.copyTree.* calls for testability and maintainability.
 */

import type {
  CopyTreeOptions,
  CopyTreeResult,
  CopyTreeProgress,
  FileTreeNode,
} from "@shared/types";

/**
 * Client for CopyTree IPC operations.
 *
 * @example
 * ```typescript
 * import { copyTreeClient } from "@/clients/copyTreeClient";
 *
 * const result = await copyTreeClient.generate(worktreeId, { format: "xml" });
 * const cleanup = copyTreeClient.onProgress((progress) => console.log(progress));
 * ```
 */
export const copyTreeClient = {
  /** Generate CopyTree context for a worktree */
  generate: (worktreeId: string, options?: CopyTreeOptions): Promise<CopyTreeResult> => {
    return window.electron.copyTree.generate(worktreeId, options);
  },

  /** Generate CopyTree context and copy to clipboard */
  generateAndCopyFile: (worktreeId: string, options?: CopyTreeOptions): Promise<CopyTreeResult> => {
    return window.electron.copyTree.generateAndCopyFile(worktreeId, options);
  },

  /** Inject CopyTree context into a terminal */
  injectToTerminal: (
    terminalId: string,
    worktreeId: string,
    options?: CopyTreeOptions
  ): Promise<CopyTreeResult> => {
    return window.electron.copyTree.injectToTerminal(terminalId, worktreeId, options);
  },

  /** Check if CopyTree is available */
  isAvailable: (): Promise<boolean> => {
    return window.electron.copyTree.isAvailable();
  },

  /** Cancel the current CopyTree operation */
  cancel: (): Promise<void> => {
    return window.electron.copyTree.cancel();
  },

  /** Get file tree for file picker */
  getFileTree: (worktreeId: string, dirPath?: string): Promise<FileTreeNode[]> => {
    return window.electron.copyTree.getFileTree(worktreeId, dirPath);
  },

  /** Subscribe to CopyTree progress events. Returns cleanup function. */
  onProgress: (callback: (progress: CopyTreeProgress) => void): (() => void) => {
    return window.electron.copyTree.onProgress(callback);
  },
} as const;
