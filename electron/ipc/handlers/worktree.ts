import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { CHANNELS } from "../channels.js";
import { GitService } from "../../services/GitService.js";
import type { HandlerDependencies } from "../types.js";
import type { WorktreeSetActivePayload } from "../../types/index.js";

export function registerWorktreeHandlers(deps: HandlerDependencies): () => void {
  const { worktreeService } = deps;
  const handlers: Array<() => void> = [];

  const handleWorktreeGetAll = async () => {
    if (!worktreeService) {
      return [];
    }
    const statesMap = worktreeService.getAllStates();
    return Array.from(statesMap.values());
  };
  ipcMain.handle(CHANNELS.WORKTREE_GET_ALL, handleWorktreeGetAll);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_GET_ALL));

  const handleWorktreeRefresh = async () => {
    if (!worktreeService) {
      return;
    }
    await worktreeService.refresh();
  };
  ipcMain.handle(CHANNELS.WORKTREE_REFRESH, handleWorktreeRefresh);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_REFRESH));

  const handleWorktreePRRefresh = async () => {
    if (!worktreeService) {
      return;
    }
    await worktreeService.refreshPullRequests();
  };
  ipcMain.handle(CHANNELS.WORKTREE_PR_REFRESH, handleWorktreePRRefresh);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_PR_REFRESH));

  const handleWorktreeSetActive = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: WorktreeSetActivePayload
  ) => {
    if (!worktreeService) {
      return;
    }
    worktreeService.setActiveWorktree(payload.worktreeId);
  };
  ipcMain.handle(CHANNELS.WORKTREE_SET_ACTIVE, handleWorktreeSetActive);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_SET_ACTIVE));

  const handleWorktreeCreate = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: {
      rootPath: string;
      options: { baseBranch: string; newBranch: string; path: string; fromRemote?: boolean };
    }
  ) => {
    if (!worktreeService) {
      throw new Error("WorktreeService not initialized");
    }
    await worktreeService.createWorktree(payload.rootPath, payload.options);
  };
  ipcMain.handle(CHANNELS.WORKTREE_CREATE, handleWorktreeCreate);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_CREATE));

  const handleWorktreeListBranches = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { rootPath: string }
  ) => {
    if (!worktreeService) {
      throw new Error("WorktreeService not initialized");
    }
    return await worktreeService.listBranches(payload.rootPath);
  };
  ipcMain.handle(CHANNELS.WORKTREE_LIST_BRANCHES, handleWorktreeListBranches);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_LIST_BRANCHES));

  const handleWorktreeGetDefaultPath = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { rootPath: string; branchName: string }
  ): Promise<string> => {
    const { rootPath, branchName } = payload;
    const repoName = path.basename(rootPath);
    const sanitizedBranch = branchName.replace(/[^a-zA-Z0-9-_]/g, "-");
    const worktreesDir = path.join(path.dirname(rootPath), `${repoName}-worktrees`);
    const worktreePath = path.join(worktreesDir, sanitizedBranch);
    return path.normalize(worktreePath);
  };
  ipcMain.handle(CHANNELS.WORKTREE_GET_DEFAULT_PATH, handleWorktreeGetDefaultPath);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_GET_DEFAULT_PATH));

  const handleGitGetFileDiff = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { cwd: string; filePath: string; status: string }
  ): Promise<string> => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid payload");
    }

    const { cwd, filePath, status } = payload;

    if (typeof cwd !== "string" || !cwd) {
      throw new Error("Invalid working directory");
    }
    if (typeof filePath !== "string" || !filePath) {
      throw new Error("Invalid file path");
    }
    if (typeof status !== "string" || !status) {
      throw new Error("Invalid file status");
    }

    if (!fs.existsSync(cwd)) {
      throw new Error("Working directory does not exist");
    }

    const cwdStats = fs.statSync(cwd);
    if (!cwdStats.isDirectory()) {
      throw new Error("Working directory path is not a directory");
    }

    const gitDir = path.join(cwd, ".git");
    if (!fs.existsSync(gitDir)) {
      throw new Error("Working directory is not a git repository");
    }

    try {
      const gitService = new GitService(cwd);
      return await gitService.getFileDiff(filePath, status as any);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[Git] Failed to get file diff:", errorMessage);
      throw new Error(`Failed to get file diff: ${errorMessage}`);
    }
  };
  ipcMain.handle(CHANNELS.GIT_GET_FILE_DIFF, handleGitGetFileDiff);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.GIT_GET_FILE_DIFF));

  return () => handlers.forEach((cleanup) => cleanup());
}
