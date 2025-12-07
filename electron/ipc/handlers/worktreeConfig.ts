import { ipcMain } from "electron";
import { CHANNELS } from "../channels.js";
import { store } from "../../store.js";
import type { HandlerDependencies } from "../types.js";
import type { WorktreeConfig } from "../../../shared/types/index.js";
import {
  validatePathPattern,
  DEFAULT_WORKTREE_PATH_PATTERN,
} from "../../../shared/utils/pathPattern.js";

function getWorktreeConfig(): WorktreeConfig {
  const raw = store.get("worktreeConfig");
  if (!raw || typeof raw !== "object") {
    return { pathPattern: DEFAULT_WORKTREE_PATH_PATTERN };
  }
  return {
    pathPattern:
      typeof raw.pathPattern === "string" && raw.pathPattern.trim()
        ? raw.pathPattern
        : DEFAULT_WORKTREE_PATH_PATTERN,
  };
}

export function registerWorktreeConfigHandlers(_deps: HandlerDependencies): () => void {
  const handlers: Array<() => void> = [];

  const handleGetConfig = async (): Promise<WorktreeConfig> => {
    return getWorktreeConfig();
  };
  ipcMain.handle(CHANNELS.WORKTREE_CONFIG_GET, handleGetConfig);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_CONFIG_GET));

  const handleSetPattern = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { pattern: string }
  ): Promise<WorktreeConfig> => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid worktree config payload");
    }

    const { pattern } = payload;

    if (typeof pattern !== "string") {
      throw new Error("Invalid pattern: must be a string");
    }

    const trimmedPattern = pattern.trim();
    const validation = validatePathPattern(trimmedPattern);

    if (!validation.valid) {
      throw new Error(validation.error);
    }

    store.set("worktreeConfig.pathPattern", trimmedPattern);
    return getWorktreeConfig();
  };
  ipcMain.handle(CHANNELS.WORKTREE_CONFIG_SET_PATTERN, handleSetPattern);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.WORKTREE_CONFIG_SET_PATTERN));

  return () => handlers.forEach((cleanup) => cleanup());
}
