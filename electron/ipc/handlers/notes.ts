import { ipcMain } from "electron";
import { readFile, writeFile, mkdir, realpath, stat } from "fs/promises";
import { join, dirname, basename, resolve } from "path";
import { existsSync } from "fs";
import { CHANNELS } from "../channels.js";
import type { HandlerDependencies } from "../types.js";

const NOTEBOOK_DIR = ".canopy";
const NOTEBOOK_FILENAME = "notebook.md";

async function validateWorktreePath(
  worktreePath: string,
  worktreeService?: HandlerDependencies["worktreeService"]
): Promise<void> {
  const resolvedPath = resolve(worktreePath);

  let realPath: string;
  try {
    realPath = await realpath(resolvedPath);
  } catch {
    throw new Error("Worktree path does not exist or is not accessible");
  }

  const stats = await stat(realPath);
  if (!stats.isDirectory()) {
    throw new Error("Worktree path must be a directory");
  }

  if (worktreeService) {
    const worktrees = await worktreeService.getAllStatesAsync();
    const isValidWorktree = worktrees.some((wt) => wt.path === realPath);
    if (!isValidWorktree) {
      throw new Error("Path is not a registered worktree");
    }
  }
}

export function registerNotesHandlers(deps: HandlerDependencies): () => void {
  const { worktreeService } = deps;
  const handlers: Array<() => void> = [];

  const handleNotesRead = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { worktreePath: string }
  ): Promise<string> => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid payload for notes:read");
    }

    const { worktreePath } = payload;

    if (typeof worktreePath !== "string" || !worktreePath.trim()) {
      throw new Error("Invalid worktreePath: must be a non-empty string");
    }

    await validateWorktreePath(worktreePath, worktreeService);

    const realPath = await realpath(resolve(worktreePath));
    const notesPath = join(realPath, NOTEBOOK_DIR, NOTEBOOK_FILENAME);

    if (!existsSync(notesPath)) {
      return "";
    }

    try {
      const content = await readFile(notesPath, "utf-8");
      return content;
    } catch (error) {
      console.error("Failed to read notes file:", error);
      return "";
    }
  };
  ipcMain.handle(CHANNELS.NOTES_READ, handleNotesRead);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.NOTES_READ));

  const handleNotesWrite = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { worktreePath: string; content: string }
  ): Promise<void> => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid payload for notes:write");
    }

    const { worktreePath, content } = payload;

    if (typeof worktreePath !== "string" || !worktreePath.trim()) {
      throw new Error("Invalid worktreePath: must be a non-empty string");
    }

    if (typeof content !== "string") {
      throw new Error("Invalid content: must be a string");
    }

    await validateWorktreePath(worktreePath, worktreeService);

    const realPath = await realpath(resolve(worktreePath));
    const notebookDir = join(realPath, NOTEBOOK_DIR);
    const notesPath = join(notebookDir, NOTEBOOK_FILENAME);

    try {
      if (!existsSync(notebookDir)) {
        await mkdir(notebookDir, { recursive: true });
      }

      await writeFile(notesPath, content, "utf-8");
    } catch (error) {
      console.error("Failed to write notes file:", error);
      throw new Error(`Failed to write notes file: ${error}`);
    }
  };
  ipcMain.handle(CHANNELS.NOTES_WRITE, handleNotesWrite);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.NOTES_WRITE));

  return () => {
    handlers.forEach((cleanup) => cleanup());
  };
}
