import { ipcMain, dialog } from "electron";
import crypto from "crypto";
import os from "os";
import path from "path";
import { CHANNELS } from "../channels";
import { sendToRenderer } from "../utils";
import { projectStore } from "../../services/ProjectStore";
import { events } from "../../services/events";
import type { HandlerDependencies } from "../types";
import type { TerminalSpawnOptions, TerminalResizePayload } from "../../types/index";
import { TerminalSpawnOptionsSchema, TerminalResizePayloadSchema } from "../../schemas/ipc";

export function registerTerminalHandlers(deps: HandlerDependencies): () => void {
  const { mainWindow, ptyManager, worktreeService } = deps;
  const handlers: Array<() => void> = [];

  // ==========================================
  // PtyManager Event Forwarding
  // ==========================================

  // Forward PTY data to renderer
  const handlePtyData = (id: string, data: string) => {
    sendToRenderer(mainWindow, CHANNELS.TERMINAL_DATA, id, data);
  };
  ptyManager.on("data", handlePtyData);
  handlers.push(() => ptyManager.off("data", handlePtyData));

  // Forward PTY exit to renderer
  const handlePtyExit = (id: string, exitCode: number) => {
    sendToRenderer(mainWindow, CHANNELS.TERMINAL_EXIT, id, exitCode);
  };
  ptyManager.on("exit", handlePtyExit);
  handlers.push(() => ptyManager.off("exit", handlePtyExit));

  // Forward PTY errors to renderer
  const handlePtyError = (id: string, error: string) => {
    sendToRenderer(mainWindow, CHANNELS.TERMINAL_ERROR, id, error);
  };
  ptyManager.on("error", handlePtyError);
  handlers.push(() => ptyManager.off("error", handlePtyError));

  // ==========================================
  // Agent State Event Forwarding
  // ==========================================

  // Forward agent state changes to renderer
  const unsubAgentState = events.on("agent:state-changed", (payload) => {
    sendToRenderer(mainWindow, CHANNELS.AGENT_STATE_CHANGED, payload);
  });
  handlers.push(unsubAgentState);

  // Forward agent detection events to renderer
  const unsubAgentDetected = events.on("agent:detected", (payload) => {
    sendToRenderer(mainWindow, CHANNELS.AGENT_DETECTED, payload);
  });
  handlers.push(unsubAgentDetected);

  const unsubAgentExited = events.on("agent:exited", (payload) => {
    sendToRenderer(mainWindow, CHANNELS.AGENT_EXITED, payload);
  });
  handlers.push(unsubAgentExited);

  // Forward artifact detection events to renderer
  const unsubArtifactDetected = events.on("artifact:detected", (payload) => {
    sendToRenderer(mainWindow, CHANNELS.ARTIFACT_DETECTED, payload);
  });
  handlers.push(unsubArtifactDetected);

  // ==========================================
  // Terminal Handlers
  // ==========================================

  const handleTerminalSpawn = async (
    _event: Electron.IpcMainInvokeEvent,
    options: TerminalSpawnOptions
  ): Promise<string> => {
    // Validate input with Zod schema
    const parseResult = TerminalSpawnOptionsSchema.safeParse(options);
    if (!parseResult.success) {
      console.error("[IPC] Invalid terminal spawn options:", parseResult.error.format());
      throw new Error(`Invalid spawn options: ${parseResult.error.message}`);
    }

    const validatedOptions = parseResult.data;

    // Validate and clamp dimensions (schema already validates range)
    const cols = Math.max(1, Math.min(500, Math.floor(validatedOptions.cols) || 80));
    const rows = Math.max(1, Math.min(500, Math.floor(validatedOptions.rows) || 30));

    // Use validated type or default to shell
    const type = validatedOptions.type || "shell";

    // Use validated title and worktreeId
    const title = validatedOptions.title;
    const worktreeId = validatedOptions.worktreeId;

    // Generate ID if not provided
    const id = validatedOptions.id || crypto.randomUUID();

    // Cache project path to avoid multiple lookups and ensure consistency
    const projectPath = projectStore.getCurrentProject()?.path;

    // Use provided cwd, project root, or fall back to home directory
    let cwd = validatedOptions.cwd || projectPath || process.env.HOME || os.homedir();

    // Validate cwd exists and is absolute
    const fs = await import("fs");
    const path = await import("path");

    // Helper to get validated fallback (absolute path that exists)
    const getValidatedFallback = async (): Promise<string> => {
      // Try project path first if available
      if (projectPath && path.isAbsolute(projectPath)) {
        try {
          await fs.promises.access(projectPath);
          return projectPath;
        } catch {
          // Project path invalid, fall through to home
        }
      }
      // Fall back to home directory
      return os.homedir();
    };

    try {
      if (!path.isAbsolute(cwd)) {
        console.warn(`Relative cwd provided: ${cwd}, falling back to project root or home`);
        cwd = await getValidatedFallback();
      }

      // Check if directory exists
      await fs.promises.access(cwd);
    } catch (_error) {
      console.warn(`Invalid cwd: ${cwd}, falling back to project root or home`);
      cwd = await getValidatedFallback();
    }

    try {
      ptyManager.spawn(id, {
        cwd,
        shell: validatedOptions.shell, // Shell validation happens in PtyManager
        cols,
        rows,
        env: validatedOptions.env, // Pass environment variables through
        type,
        title,
        worktreeId,
      });

      // If a command is specified (e.g., 'claude' or 'gemini'), execute it after shell initializes
      if (validatedOptions.command) {
        const trimmedCommand = validatedOptions.command.trim();

        // Security: Validate command to prevent injection attacks
        if (trimmedCommand.length === 0) {
          console.warn("Empty command provided, ignoring");
        } else if (trimmedCommand.includes("\n") || trimmedCommand.includes("\r")) {
          console.error("Multi-line commands not allowed for security, ignoring");
        } else if (
          trimmedCommand.includes(";") ||
          trimmedCommand.includes("&&") ||
          trimmedCommand.includes("||")
        ) {
          console.error("Command chaining not allowed for security, ignoring");
        } else {
          // Small delay to allow shell to initialize before sending command
          setTimeout(() => {
            // Double-check terminal still exists before writing
            if (ptyManager.hasTerminal(id)) {
              ptyManager.write(id, `${trimmedCommand}\r`);
            }
          }, 100);
        }
      }

      return id;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to spawn terminal: ${errorMessage}`);
    }
  };
  ipcMain.handle(CHANNELS.TERMINAL_SPAWN, handleTerminalSpawn);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.TERMINAL_SPAWN));

  const handleTerminalInput = (_event: Electron.IpcMainEvent, id: string, data: string) => {
    try {
      if (typeof id !== "string" || typeof data !== "string") {
        console.error("Invalid terminal input parameters");
        return;
      }
      ptyManager.write(id, data);
    } catch (error) {
      console.error("Error writing to terminal:", error);
    }
  };
  ipcMain.on(CHANNELS.TERMINAL_INPUT, handleTerminalInput);
  handlers.push(() => ipcMain.removeListener(CHANNELS.TERMINAL_INPUT, handleTerminalInput));

  const handleTerminalResize = (_event: Electron.IpcMainEvent, payload: TerminalResizePayload) => {
    try {
      // Validate with Zod schema
      const parseResult = TerminalResizePayloadSchema.safeParse(payload);
      if (!parseResult.success) {
        console.error("[IPC] Invalid terminal resize payload:", parseResult.error.format());
        return;
      }

      const { id, cols, rows } = parseResult.data;
      const clampedCols = Math.max(1, Math.min(500, Math.floor(cols)));
      const clampedRows = Math.max(1, Math.min(500, Math.floor(rows)));

      ptyManager.resize(id, clampedCols, clampedRows);
    } catch (error) {
      console.error("Error resizing terminal:", error);
    }
  };
  ipcMain.on(CHANNELS.TERMINAL_RESIZE, handleTerminalResize);
  handlers.push(() => ipcMain.removeListener(CHANNELS.TERMINAL_RESIZE, handleTerminalResize));

  const handleTerminalKill = async (_event: Electron.IpcMainInvokeEvent, id: string) => {
    try {
      if (typeof id !== "string") {
        throw new Error("Invalid terminal ID: must be a string");
      }
      ptyManager.kill(id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to kill terminal: ${errorMessage}`);
    }
  };
  ipcMain.handle(CHANNELS.TERMINAL_KILL, handleTerminalKill);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.TERMINAL_KILL));

  const handleTerminalTrash = async (_event: Electron.IpcMainInvokeEvent, id: string) => {
    try {
      if (typeof id !== "string") {
        throw new Error("Invalid terminal ID: must be a string");
      }
      ptyManager.trash(id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to trash terminal: ${errorMessage}`);
    }
  };
  ipcMain.handle(CHANNELS.TERMINAL_TRASH, handleTerminalTrash);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.TERMINAL_TRASH));

  const handleTerminalRestore = async (
    _event: Electron.IpcMainInvokeEvent,
    id: string
  ): Promise<boolean> => {
    try {
      if (typeof id !== "string") {
        throw new Error("Invalid terminal ID: must be a string");
      }
      return ptyManager.restore(id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to restore terminal: ${errorMessage}`);
    }
  };
  ipcMain.handle(CHANNELS.TERMINAL_RESTORE, handleTerminalRestore);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.TERMINAL_RESTORE));

  // Forward terminal trashed/restored events to renderer
  const unsubTerminalTrashed = events.on(
    "terminal:trashed",
    (payload: { id: string; expiresAt: number }) => {
      sendToRenderer(mainWindow, CHANNELS.TERMINAL_TRASHED, payload);
    }
  );
  handlers.push(unsubTerminalTrashed);

  const unsubTerminalRestored = events.on("terminal:restored", (payload: { id: string }) => {
    sendToRenderer(mainWindow, CHANNELS.TERMINAL_RESTORED, payload);
  });
  handlers.push(unsubTerminalRestored);

  const handleTerminalSetBuffering = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { id: string; enabled: boolean }
  ): Promise<void> => {
    try {
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload");
      }
      if (typeof payload.id !== "string" || !payload.id) {
        throw new Error("Invalid terminal ID: must be a non-empty string");
      }
      if (typeof payload.enabled !== "boolean") {
        throw new Error("Invalid enabled flag: must be a boolean");
      }
      ptyManager.setBuffering(payload.id, payload.enabled);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to set terminal buffering: ${errorMessage}`);
    }
  };
  ipcMain.handle(CHANNELS.TERMINAL_SET_BUFFERING, handleTerminalSetBuffering);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.TERMINAL_SET_BUFFERING));

  const handleTerminalFlush = async (
    _event: Electron.IpcMainInvokeEvent,
    id: string
  ): Promise<void> => {
    try {
      if (typeof id !== "string" || !id) {
        throw new Error("Invalid terminal ID: must be a non-empty string");
      }
      ptyManager.flushBuffer(id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to flush terminal buffer: ${errorMessage}`);
    }
  };
  ipcMain.handle(CHANNELS.TERMINAL_FLUSH, handleTerminalFlush);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.TERMINAL_FLUSH));

  // ==========================================
  // Artifact Handlers
  // ==========================================

  const handleArtifactSaveToFile = async (
    _event: Electron.IpcMainInvokeEvent,
    options: unknown
  ): Promise<{ filePath: string; success: boolean } | null> => {
    try {
      // Validate payload
      if (
        typeof options !== "object" ||
        options === null ||
        !("content" in options) ||
        typeof (options as Record<string, unknown>).content !== "string"
      ) {
        throw new Error("Invalid saveToFile payload: missing or invalid content");
      }

      const { content, suggestedFilename, cwd } = options as {
        content: string;
        suggestedFilename?: string;
        cwd?: string;
      };

      // Validate content size (max 10MB)
      if (content.length > 10 * 1024 * 1024) {
        throw new Error("Artifact content exceeds maximum size (10MB)");
      }

      // Validate and sanitize cwd if provided
      let safeCwd = os.homedir();
      if (cwd && typeof cwd === "string") {
        const fs = await import("fs/promises");
        try {
          // Resolve to absolute path and check if it exists
          const resolvedCwd = path.resolve(cwd);
          const stat = await fs.stat(resolvedCwd);
          if (stat.isDirectory()) {
            safeCwd = resolvedCwd;
          }
        } catch {
          // If cwd is invalid, fall back to homedir
          safeCwd = os.homedir();
        }
      }

      // Show save dialog
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Save Artifact",
        defaultPath: suggestedFilename
          ? path.join(safeCwd, path.basename(suggestedFilename)) // Only use basename to prevent traversal
          : path.join(safeCwd, "artifact.txt"),
        properties: ["createDirectory", "showOverwriteConfirmation"],
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      // Write content to file
      const fs = await import("fs/promises");
      await fs.writeFile(result.filePath, content, "utf-8");

      return {
        filePath: result.filePath,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[Artifact] Failed to save to file:", errorMessage);
      throw new Error(`Failed to save artifact: ${errorMessage}`);
    }
  };
  ipcMain.handle(CHANNELS.ARTIFACT_SAVE_TO_FILE, handleArtifactSaveToFile);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.ARTIFACT_SAVE_TO_FILE));

  const handleArtifactApplyPatch = async (
    _event: Electron.IpcMainInvokeEvent,
    options: unknown
  ): Promise<{ success: boolean; error?: string; modifiedFiles?: string[] }> => {
    try {
      // Validate payload
      if (
        typeof options !== "object" ||
        options === null ||
        !("patchContent" in options) ||
        !("cwd" in options) ||
        typeof (options as Record<string, unknown>).patchContent !== "string" ||
        typeof (options as Record<string, unknown>).cwd !== "string"
      ) {
        throw new Error("Invalid applyPatch payload: missing or invalid patchContent/cwd");
      }

      const { patchContent, cwd } = options as { patchContent: string; cwd: string };

      // Validate patch content size (max 5MB)
      if (patchContent.length > 5 * 1024 * 1024) {
        throw new Error("Patch content exceeds maximum size (5MB)");
      }

      // Validate and sanitize cwd
      const fs = await import("fs/promises");
      let resolvedCwd: string;
      try {
        // Resolve to absolute path
        resolvedCwd = path.resolve(cwd);

        // Check if directory exists
        const stat = await fs.stat(resolvedCwd);
        if (!stat.isDirectory()) {
          return {
            success: false,
            error: "Provided cwd is not a directory",
          };
        }

        // Check if it's a git repository
        const gitPath = path.join(resolvedCwd, ".git");
        try {
          await fs.stat(gitPath);
        } catch {
          return {
            success: false,
            error: "Provided cwd is not a git repository",
          };
        }

        // Optional: Verify cwd is within allowed worktrees
        if (worktreeService) {
          const worktrees = worktreeService.getAllStates();
          const isValidWorktree = Array.from(worktrees.values()).some(
            (wt) => path.resolve(wt.path) === resolvedCwd
          );
          if (!isValidWorktree) {
            return {
              success: false,
              error: "Directory is not a known worktree",
            };
          }
        }
      } catch (error) {
        return {
          success: false,
          error: `Invalid cwd: ${error instanceof Error ? error.message : String(error)}`,
        };
      }

      // Write patch to temporary file
      const tmpPatchPath = path.join(os.tmpdir(), `canopy-patch-${Date.now()}.patch`);
      await fs.writeFile(tmpPatchPath, patchContent, "utf-8");

      try {
        // Apply patch using git apply
        const { execa } = await import("execa");
        await execa("git", ["apply", tmpPatchPath], { cwd: resolvedCwd });

        // Get modified files by parsing the patch
        const modifiedFiles: string[] = [];
        const lines = patchContent.split("\n");
        for (const line of lines) {
          if (line.startsWith("+++")) {
            const match = line.match(/\+\+\+ b\/(.+)/);
            if (match) {
              modifiedFiles.push(match[1]);
            }
          }
        }

        return {
          success: true,
          modifiedFiles,
        };
      } finally {
        // Clean up temp patch file
        await fs.unlink(tmpPatchPath).catch(() => { /* ignore cleanup errors */ });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[Artifact] Failed to apply patch:", errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  };
  ipcMain.handle(CHANNELS.ARTIFACT_APPLY_PATCH, handleArtifactApplyPatch);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.ARTIFACT_APPLY_PATCH));

  return () => handlers.forEach((cleanup) => cleanup());
}
