/**
 * IPC Handlers Registration
 *
 * Registers all IPC handlers in the main process.
 * Provides a single initialization function to wire up all IPC communication.
 */

import { ipcMain, BrowserWindow, shell, dialog, app, clipboard } from "electron";
import crypto from "crypto";
import os from "os";
import path from "path";
import { CHANNELS } from "./channels.js";
import { PtyManager } from "../services/PtyManager.js";
import type { DevServerManager } from "../services/DevServerManager.js";
import type { WorktreeService } from "../services/WorktreeService.js";
import type { CliAvailabilityService } from "../services/CliAvailabilityService.js";
import type {
  TerminalSpawnOptions,
  TerminalResizePayload,
  DevServerStartPayload,
  DevServerStopPayload,
  DevServerTogglePayload,
  CopyTreeGeneratePayload,
  CopyTreeGenerateAndCopyFilePayload,
  CopyTreeInjectPayload,
  CopyTreeGetFileTreePayload,
  CopyTreeResult,
  CopyTreeProgress,
  FileTreeNode,
  SystemOpenExternalPayload,
  SystemOpenPathPayload,
  WorktreeSetActivePayload,
  RecentDirectory,
  DirectoryOpenPayload,
  DirectoryRemoveRecentPayload,
} from "../types/index.js";
import {
  TerminalSpawnOptionsSchema,
  TerminalResizePayloadSchema,
  DevServerStartPayloadSchema,
  DevServerStopPayloadSchema,
  DevServerTogglePayloadSchema,
  CopyTreeGeneratePayloadSchema,
  CopyTreeGenerateAndCopyFilePayloadSchema,
  CopyTreeInjectPayloadSchema,
  CopyTreeGetFileTreePayloadSchema,
} from "../schemas/ipc.js";
import { copyTreeService } from "../services/CopyTreeService.js";
import { store } from "../store.js";
import { logBuffer, type FilterOptions as LogFilterOptions } from "../services/LogBuffer.js";
import { updateRecentDirectories, removeRecentDirectory } from "../utils/recentDirectories.js";
import { join } from "path";
import { homedir } from "os";
import type { EventBuffer, FilterOptions as EventFilterOptions } from "../services/EventBuffer.js";
import { events } from "../services/events.js";
import { projectStore } from "../services/ProjectStore.js";
import type { Project, ProjectSettings } from "../types/index.js";
import { getTranscriptManager } from "../services/TranscriptManager.js";
import { getAIConfig, setAIConfig, clearAIKey, validateAIKey } from "../services/ai/client.js";
import { generateProjectIdentity } from "../services/ai/identity.js";
import { runCommandDetector } from "../services/ai/RunCommandDetector.js";
import { runManager } from "../services/RunManager.js";
import type { EventContext, RunMetadata } from "@shared/types/events.js";
import type {
  HistoryGetSessionsPayload,
  HistoryGetSessionPayload,
  HistoryExportSessionPayload,
  AgentSession,
  IpcInvokeMap,
  IpcEventMap,
} from "../types/index.js";

// ============================================================================
// Type-safe IPC handler helpers
// ============================================================================

/**
 * Type-safe wrapper for ipcMain.handle
 *
 * Provides compile-time type checking for IPC handler arguments and return types.
 * Use this helper to ensure type safety when registering main process handlers.
 *
 * @example
 * // TypeScript will ensure the handler signature matches the contract
 * typedHandle("worktree:get-all", async () => worktreeService.getAllStates());
 * typedHandle("devserver:get-state", async (worktreeId) => devServerManager.getState(worktreeId));
 *
 * @returns Cleanup function to remove the handler
 */
function _typedHandle<K extends keyof IpcInvokeMap>(
  channel: K,
  handler: (
    ...args: IpcInvokeMap[K]["args"]
  ) => Promise<IpcInvokeMap[K]["result"]> | IpcInvokeMap[K]["result"]
): () => void {
  ipcMain.handle(channel, async (_event, ...args) => {
    return handler(...(args as IpcInvokeMap[K]["args"]));
  });
  return () => ipcMain.removeHandler(channel);
}

/**
 * Type-safe wrapper for webContents.send
 *
 * Provides compile-time type checking for event payloads sent to renderer.
 *
 * @example
 * // TypeScript will ensure the payload type matches the contract
 * typedSend(mainWindow, "worktree:update", worktreeState);
 * typedSend(mainWindow, "devserver:error", { worktreeId, error: message });
 */
function _typedSend<K extends keyof IpcEventMap>(
  window: BrowserWindow,
  channel: K,
  payload: IpcEventMap[K]
): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload);
  }
}

// Export the typed helpers for use in future handler implementations
// The underscore prefix indicates these are available but intentionally not used in existing code
export { _typedHandle as typedHandle, _typedSend as typedSend };

/**
 * Initialize all IPC handlers
 *
 * @param mainWindow - The main BrowserWindow instance for sending events to renderer
 * @param ptyManager - The PtyManager instance for terminal management
 * @param devServerManager - Dev server manager instance
 * @param worktreeService - Worktree service instance
 * @param eventBuffer - Event buffer instance for event inspector
 * @returns Cleanup function to remove all handlers
 */
export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  ptyManager: PtyManager,
  devServerManager?: DevServerManager,
  worktreeService?: WorktreeService,
  eventBuffer?: EventBuffer,
  cliAvailabilityService?: CliAvailabilityService
): () => void {
  // Store handler references for cleanup
  const handlers: Array<() => void> = [];

  // Track in-flight context injections per terminal to prevent race conditions
  const injectionsInProgress = new Set<string>();

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

  // Forward artifact detection events to renderer
  const unsubArtifactDetected = events.on("artifact:detected", (payload) => {
    sendToRenderer(mainWindow, CHANNELS.ARTIFACT_DETECTED, payload);
  });
  handlers.push(unsubArtifactDetected);

  // ==========================================
  // Dev Server Event Forwarding
  // ==========================================

  // Forward dev server update events to renderer
  // DevServerManager now emits events instead of direct IPC
  const unsubServerUpdate = events.on("server:update", (payload) => {
    sendToRenderer(mainWindow, CHANNELS.DEVSERVER_UPDATE, payload);
  });
  handlers.push(unsubServerUpdate);

  // Forward dev server error events to renderer
  const unsubServerError = events.on("server:error", (payload) => {
    sendToRenderer(mainWindow, CHANNELS.DEVSERVER_ERROR, payload);
  });
  handlers.push(unsubServerError);

  // ==========================================
  // Worktree Handlers
  // ==========================================

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

  // ==========================================
  // Dev Server Handlers
  // ==========================================

  const handleDevServerStart = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: DevServerStartPayload
  ) => {
    // Validate with Zod schema
    const parseResult = DevServerStartPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      console.error("[IPC] Invalid dev server start payload:", parseResult.error.format());
      throw new Error(`Invalid payload: ${parseResult.error.message}`);
    }

    if (!devServerManager) {
      throw new Error("DevServerManager not initialized");
    }

    const validated = parseResult.data;
    await devServerManager.start(validated.worktreeId, validated.worktreePath, validated.command);
    return devServerManager.getState(validated.worktreeId);
  };
  ipcMain.handle(CHANNELS.DEVSERVER_START, handleDevServerStart);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_START));

  const handleDevServerStop = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: DevServerStopPayload
  ) => {
    // Validate with Zod schema
    const parseResult = DevServerStopPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      console.error("[IPC] Invalid dev server stop payload:", parseResult.error.format());
      throw new Error(`Invalid payload: ${parseResult.error.message}`);
    }

    if (!devServerManager) {
      throw new Error("DevServerManager not initialized");
    }

    const validated = parseResult.data;
    await devServerManager.stop(validated.worktreeId);
    return devServerManager.getState(validated.worktreeId);
  };
  ipcMain.handle(CHANNELS.DEVSERVER_STOP, handleDevServerStop);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_STOP));

  const handleDevServerToggle = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: DevServerTogglePayload
  ) => {
    // Validate with Zod schema
    const parseResult = DevServerTogglePayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      console.error("[IPC] Invalid dev server toggle payload:", parseResult.error.format());
      throw new Error(`Invalid payload: ${parseResult.error.message}`);
    }

    if (!devServerManager) {
      throw new Error("DevServerManager not initialized");
    }

    const validated = parseResult.data;
    await devServerManager.toggle(validated.worktreeId, validated.worktreePath, validated.command);
    return devServerManager.getState(validated.worktreeId);
  };
  ipcMain.handle(CHANNELS.DEVSERVER_TOGGLE, handleDevServerToggle);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_TOGGLE));

  const handleDevServerGetState = async (
    _event: Electron.IpcMainInvokeEvent,
    worktreeId: string
  ) => {
    if (!devServerManager) {
      throw new Error("DevServerManager not initialized");
    }
    return devServerManager.getState(worktreeId);
  };
  ipcMain.handle(CHANNELS.DEVSERVER_GET_STATE, handleDevServerGetState);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_GET_STATE));

  const handleDevServerGetLogs = async (
    _event: Electron.IpcMainInvokeEvent,
    worktreeId: string
  ) => {
    if (!devServerManager) {
      throw new Error("DevServerManager not initialized");
    }
    return devServerManager.getLogs(worktreeId);
  };
  ipcMain.handle(CHANNELS.DEVSERVER_GET_LOGS, handleDevServerGetLogs);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_GET_LOGS));

  const handleDevServerHasDevScript = async (
    _event: Electron.IpcMainInvokeEvent,
    worktreePath: string
  ) => {
    if (!devServerManager) {
      throw new Error("DevServerManager not initialized");
    }
    return devServerManager.hasDevScriptAsync(worktreePath);
  };
  ipcMain.handle(CHANNELS.DEVSERVER_HAS_DEV_SCRIPT, handleDevServerHasDevScript);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DEVSERVER_HAS_DEV_SCRIPT));

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
        // Whitelist allowed commands to prevent command injection
        // Allow any non-empty command for recipe flexibility
        const trimmedCommand = validatedOptions.command.trim();
        if (trimmedCommand.length === 0) {
          console.warn("Empty command provided, ignoring");
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
        await fs.unlink(tmpPatchPath).catch(() => {
          /* ignore cleanup errors */
        });
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

  // ==========================================
  // CopyTree Handlers
  // ==========================================

  const handleCopyTreeGenerate = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: CopyTreeGeneratePayload
  ): Promise<CopyTreeResult> => {
    // Generate trace ID for this operation
    const traceId = crypto.randomUUID();
    console.log(`[${traceId}] CopyTree generate started for worktree ${payload.worktreeId}`);

    // Validate with Zod schema
    const parseResult = CopyTreeGeneratePayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      console.error(`[${traceId}] Invalid CopyTree generate payload:`, parseResult.error.format());
      return {
        content: "",
        fileCount: 0,
        error: `Invalid payload: ${parseResult.error.message}`,
      };
    }

    const validated = parseResult.data;

    if (!worktreeService) {
      return {
        content: "",
        fileCount: 0,
        error: "WorktreeService not initialized",
      };
    }

    // Look up worktree path from worktreeId
    const statesMap = worktreeService.getAllStates();
    const worktree = statesMap.get(validated.worktreeId);

    if (!worktree) {
      return {
        content: "",
        fileCount: 0,
        error: `Worktree not found: ${validated.worktreeId}`,
      };
    }

    // Progress callback to send updates to renderer with traceId
    const onProgress = (progress: CopyTreeProgress) => {
      sendToRenderer(mainWindow, CHANNELS.COPYTREE_PROGRESS, { ...progress, traceId });
    };

    return copyTreeService.generate(worktree.path, validated.options, onProgress, traceId);
  };
  ipcMain.handle(CHANNELS.COPYTREE_GENERATE, handleCopyTreeGenerate);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.COPYTREE_GENERATE));

  const handleCopyTreeGenerateAndCopyFile = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: CopyTreeGenerateAndCopyFilePayload
  ): Promise<CopyTreeResult> => {
    // Generate trace ID for this operation
    const traceId = crypto.randomUUID();
    console.log(
      `[${traceId}] CopyTree generate-and-copy-file started for worktree ${payload.worktreeId}`
    );

    // Validate with Zod schema
    const parseResult = CopyTreeGenerateAndCopyFilePayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      console.error(
        `[${traceId}] Invalid CopyTree generate-and-copy-file payload:`,
        parseResult.error.format()
      );
      return {
        content: "",
        fileCount: 0,
        error: `Invalid payload: ${parseResult.error.message}`,
      };
    }

    const validated = parseResult.data;

    if (!worktreeService) {
      return {
        content: "",
        fileCount: 0,
        error: "WorktreeService not initialized",
      };
    }

    // Look up worktree path from worktreeId
    const statesMap = worktreeService.getAllStates();
    const worktree = statesMap.get(validated.worktreeId);

    if (!worktree) {
      return {
        content: "",
        fileCount: 0,
        error: `Worktree not found: ${validated.worktreeId}`,
      };
    }

    // Progress callback to send updates to renderer with traceId
    const onProgress = (progress: CopyTreeProgress) => {
      sendToRenderer(mainWindow, CHANNELS.COPYTREE_PROGRESS, { ...progress, traceId });
    };

    const result = await copyTreeService.generate(
      worktree.path,
      validated.options,
      onProgress,
      traceId
    );

    if (result.error) {
      return result;
    }

    try {
      const fs = await import("fs/promises");
      const os = await import("os");
      const path = await import("path");

      // Ensure temp directory exists
      const tempDir = path.join(os.tmpdir(), "canopy-context");
      await fs.mkdir(tempDir, { recursive: true });

      // Create filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `context-${worktree.branch || "head"}-${timestamp}.xml`;
      const filePath = path.join(tempDir, filename);

      // Write content to file
      await fs.writeFile(filePath, result.content, "utf-8");

      // Copy to clipboard based on platform
      if (process.platform === "darwin") {
        const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
    <string>${filePath}</string>
</array>
</plist>`;
        clipboard.writeBuffer("NSFilenamesPboardType", Buffer.from(plist, "utf8"));
      } else if (process.platform === "win32") {
        // Not implemented for Windows yet
        clipboard.writeText(filePath);
      } else {
        // Linux
        clipboard.writeBuffer("text/uri-list", Buffer.from(`file://${filePath}`, "utf8"));
      }

      console.log(`[${traceId}] Copied context file to clipboard: ${filePath}`);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${traceId}] Failed to save/copy context file:`, errorMessage);
      return {
        ...result,
        error: `Failed to copy file to clipboard: ${errorMessage}`,
      };
    }
  };
  ipcMain.handle(CHANNELS.COPYTREE_GENERATE_AND_COPY_FILE, handleCopyTreeGenerateAndCopyFile);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.COPYTREE_GENERATE_AND_COPY_FILE));

  const handleCopyTreeInject = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: CopyTreeInjectPayload
  ): Promise<CopyTreeResult> => {
    // Generate trace ID for this injection operation
    const traceId = crypto.randomUUID();
    console.log(
      `[${traceId}] CopyTree inject started for terminal ${payload.terminalId}, worktree ${payload.worktreeId}`
    );

    // Validate with Zod schema
    const parseResult = CopyTreeInjectPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      console.error(`[${traceId}] Invalid CopyTree inject payload:`, parseResult.error.format());
      return {
        content: "",
        fileCount: 0,
        error: `Invalid payload: ${parseResult.error.message}`,
      };
    }

    const validated = parseResult.data;

    // Prevent concurrent injections to the same terminal
    if (injectionsInProgress.has(validated.terminalId)) {
      return {
        content: "",
        fileCount: 0,
        error: "Context injection already in progress for this terminal",
      };
    }

    if (!worktreeService) {
      return {
        content: "",
        fileCount: 0,
        error: "WorktreeService not initialized",
      };
    }

    // Mark injection as in progress
    injectionsInProgress.add(validated.terminalId);

    try {
      // Look up worktree path from worktreeId
      const statesMap = worktreeService.getAllStates();
      const worktree = statesMap.get(validated.worktreeId);

      if (!worktree) {
        return {
          content: "",
          fileCount: 0,
          error: `Worktree not found: ${validated.worktreeId}`,
        };
      }

      // Check if terminal exists before generating (saves work if terminal is gone)
      if (!ptyManager.hasTerminal(validated.terminalId)) {
        return {
          content: "",
          fileCount: 0,
          error: "Terminal no longer exists",
        };
      }

      // Progress callback to send updates to renderer with traceId
      const onProgress = (progress: CopyTreeProgress) => {
        sendToRenderer(mainWindow, CHANNELS.COPYTREE_PROGRESS, { ...progress, traceId });
      };

      // Generate context with options (format can be specified) and progress reporting
      const result = await copyTreeService.generate(
        worktree.path,
        validated.options || {},
        onProgress,
        traceId
      );

      if (result.error) {
        return result;
      }

      // Inject content into terminal using chunked writing
      // Large contexts can overwhelm the terminal, so we write in chunks
      const CHUNK_SIZE = 4096;
      const content = result.content;

      for (let i = 0; i < content.length; i += CHUNK_SIZE) {
        // Check terminal still exists before each write
        if (!ptyManager.hasTerminal(validated.terminalId)) {
          return {
            content: "",
            fileCount: 0,
            error: "Terminal closed during injection",
          };
        }

        const chunk = content.slice(i, i + CHUNK_SIZE);
        ptyManager.write(validated.terminalId, chunk, traceId);
        // Small delay to prevent buffer overflow (1ms per chunk)
        if (i + CHUNK_SIZE < content.length) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      }

      console.log(`[${traceId}] CopyTree inject completed successfully`);
      return result;
    } finally {
      // Always remove from in-progress set
      injectionsInProgress.delete(validated.terminalId);
    }
  };
  ipcMain.handle(CHANNELS.COPYTREE_INJECT, handleCopyTreeInject);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.COPYTREE_INJECT));

  const handleCopyTreeAvailable = async (): Promise<boolean> => {
    return copyTreeService.isAvailable();
  };
  ipcMain.handle(CHANNELS.COPYTREE_AVAILABLE, handleCopyTreeAvailable);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.COPYTREE_AVAILABLE));

  const handleCopyTreeCancel = async (): Promise<void> => {
    copyTreeService.cancelAll();
  };
  ipcMain.handle(CHANNELS.COPYTREE_CANCEL, handleCopyTreeCancel);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.COPYTREE_CANCEL));

  const handleCopyTreeGetFileTree = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: CopyTreeGetFileTreePayload
  ): Promise<FileTreeNode[]> => {
    // Use safeParse for better error handling
    const parseResult = CopyTreeGetFileTreePayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      throw new Error(`Invalid file tree request: ${parseResult.error.message}`);
    }

    const validated = parseResult.data;

    // Validate dirPath is relative (no absolute paths or excessive ..)
    if (validated.dirPath) {
      if (path.isAbsolute(validated.dirPath)) {
        throw new Error("dirPath must be a relative path");
      }
      // Normalize and check for path traversal attempts
      const normalized = path.normalize(validated.dirPath);
      if (normalized.startsWith("..")) {
        throw new Error("dirPath cannot traverse outside worktree root");
      }
    }

    if (!worktreeService) {
      throw new Error("Worktree service not available");
    }
    const monitor = worktreeService.getMonitor(validated.worktreeId);
    if (!monitor) {
      throw new Error(`Worktree not found: ${validated.worktreeId}`);
    }

    const { getFileTree } = await import("../utils/fileTree.js");
    return getFileTree(monitor.path, validated.dirPath);
  };
  ipcMain.handle(CHANNELS.COPYTREE_GET_FILE_TREE, handleCopyTreeGetFileTree);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.COPYTREE_GET_FILE_TREE));

  // ==========================================
  // System Handlers
  // ==========================================

  const handleSystemOpenExternal = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: SystemOpenExternalPayload
  ) => {
    // Validate URL before opening to prevent arbitrary protocol execution
    try {
      const url = new URL(payload.url);
      const allowedProtocols = ["http:", "https:", "mailto:"];
      if (!allowedProtocols.includes(url.protocol)) {
        throw new Error(`Protocol ${url.protocol} is not allowed`);
      }
      await shell.openExternal(payload.url);
    } catch (error) {
      console.error("Failed to open external URL:", error);
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.SYSTEM_OPEN_EXTERNAL, handleSystemOpenExternal);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_OPEN_EXTERNAL));

  const handleSystemOpenPath = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: SystemOpenPathPayload
  ) => {
    // Validate path is absolute and exists before opening
    // This prevents path traversal and arbitrary file access
    const fs = await import("fs");
    const path = await import("path");

    try {
      if (!path.isAbsolute(payload.path)) {
        throw new Error("Only absolute paths are allowed");
      }
      // Check if path exists
      await fs.promises.access(payload.path);
      await shell.openPath(payload.path);
    } catch (error) {
      console.error("Failed to open path:", error);
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.SYSTEM_OPEN_PATH, handleSystemOpenPath);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_OPEN_PATH));

  const handleSystemCheckCommand = async (
    _event: Electron.IpcMainInvokeEvent,
    command: string
  ): Promise<boolean> => {
    if (typeof command !== "string" || !command.trim()) {
      return false;
    }

    // Validate command contains only safe characters to prevent shell injection
    // Allow alphanumeric, dash, underscore, and dot (for extensions)
    if (!/^[a-zA-Z0-9._-]+$/.test(command)) {
      console.warn(`Command "${command}" contains invalid characters, rejecting`);
      return false;
    }

    try {
      const { execFileSync } = await import("child_process");
      // Use 'which' on Unix-like systems, 'where' on Windows
      const checkCmd = process.platform === "win32" ? "where" : "which";
      // Use execFileSync instead of execSync to avoid shell interpretation
      execFileSync(checkCmd, [command], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  ipcMain.handle(CHANNELS.SYSTEM_CHECK_COMMAND, handleSystemCheckCommand);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_CHECK_COMMAND));

  const handleSystemGetHomeDir = async () => {
    return os.homedir();
  };
  ipcMain.handle(CHANNELS.SYSTEM_GET_HOME_DIR, handleSystemGetHomeDir);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_GET_HOME_DIR));

  const handleSystemGetCliAvailability = async () => {
    if (!cliAvailabilityService) {
      console.warn("[IPC] CliAvailabilityService not available");
      return { claude: false, gemini: false, codex: false };
    }

    // Return cached result if available, otherwise check now
    const cached = cliAvailabilityService.getAvailability();
    if (cached) {
      return cached;
    }

    // First time check - run availability check and cache
    return await cliAvailabilityService.checkAvailability();
  };
  ipcMain.handle(CHANNELS.SYSTEM_GET_CLI_AVAILABILITY, handleSystemGetCliAvailability);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_GET_CLI_AVAILABILITY));

  const handleSystemRefreshCliAvailability = async () => {
    if (!cliAvailabilityService) {
      console.warn("[IPC] CliAvailabilityService not available");
      return { claude: false, gemini: false, codex: false };
    }

    // Force re-check of CLI availability
    return await cliAvailabilityService.refresh();
  };
  ipcMain.handle(CHANNELS.SYSTEM_REFRESH_CLI_AVAILABILITY, handleSystemRefreshCliAvailability);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_REFRESH_CLI_AVAILABILITY));

  // ==========================================
  // App State Handlers
  // ==========================================

  const handleAppGetState = async () => {
    return store.get("appState");
  };
  ipcMain.handle(CHANNELS.APP_GET_STATE, handleAppGetState);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.APP_GET_STATE));

  const handleAppSetState = async (
    _event: Electron.IpcMainInvokeEvent,
    partialState: Partial<typeof store.store.appState>
  ) => {
    try {
      // Validate payload is an object
      if (!partialState || typeof partialState !== "object" || Array.isArray(partialState)) {
        console.error("Invalid app state payload:", partialState);
        return;
      }

      const currentState = store.get("appState");

      // Validate and sanitize fields
      const updates: Partial<typeof store.store.appState> = {};

      if ("sidebarWidth" in partialState) {
        const width = Number(partialState.sidebarWidth);
        if (!isNaN(width) && width >= 200 && width <= 600) {
          updates.sidebarWidth = width;
        }
      }

      if ("activeWorktreeId" in partialState) {
        updates.activeWorktreeId = partialState.activeWorktreeId;
      }

      if ("terminals" in partialState && Array.isArray(partialState.terminals)) {
        updates.terminals = partialState.terminals;
      }

      if ("recipes" in partialState && Array.isArray(partialState.recipes)) {
        // Validate recipe structure
        const validRecipes = partialState.recipes.filter((recipe) => {
          return (
            recipe &&
            typeof recipe === "object" &&
            typeof recipe.id === "string" &&
            typeof recipe.name === "string" &&
            Array.isArray(recipe.terminals) &&
            recipe.terminals.length > 0 &&
            recipe.terminals.length <= 10 &&
            typeof recipe.createdAt === "number"
          );
        });
        updates.recipes = validRecipes;
      }

      if ("focusMode" in partialState) {
        updates.focusMode = Boolean(partialState.focusMode);
      }

      if ("focusPanelState" in partialState) {
        const panelState = partialState.focusPanelState;
        if (
          panelState &&
          typeof panelState === "object" &&
          typeof panelState.sidebarWidth === "number" &&
          typeof panelState.logsOpen === "boolean" &&
          typeof panelState.eventInspectorOpen === "boolean"
        ) {
          updates.focusPanelState = panelState;
        }
      }

      store.set("appState", { ...currentState, ...updates });
    } catch (error) {
      console.error("Failed to set app state:", error);
    }
  };
  ipcMain.handle(CHANNELS.APP_SET_STATE, handleAppSetState);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.APP_SET_STATE));

  const handleAppGetVersion = async () => {
    return app.getVersion();
  };
  ipcMain.handle(CHANNELS.APP_GET_VERSION, handleAppGetVersion);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.APP_GET_VERSION));

  // ==========================================
  // Logs Handlers
  // ==========================================

  const handleLogsGetAll = async (
    _event: Electron.IpcMainInvokeEvent,
    filters?: LogFilterOptions
  ) => {
    if (filters) {
      return logBuffer.getFiltered(filters);
    }
    return logBuffer.getAll();
  };
  ipcMain.handle(CHANNELS.LOGS_GET_ALL, handleLogsGetAll);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_GET_ALL));

  const handleLogsGetSources = async () => {
    return logBuffer.getSources();
  };
  ipcMain.handle(CHANNELS.LOGS_GET_SOURCES, handleLogsGetSources);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_GET_SOURCES));

  const handleLogsClear = async () => {
    logBuffer.clear();
  };
  ipcMain.handle(CHANNELS.LOGS_CLEAR, handleLogsClear);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_CLEAR));

  const handleLogsOpenFile = async () => {
    const logFilePath = join(homedir(), ".config", "canopy", "worktree-debug.log");
    try {
      const fs = await import("fs");
      // Check if file exists
      await fs.promises.access(logFilePath);
      await shell.openPath(logFilePath);
    } catch (_error) {
      // File doesn't exist - create it first
      const fs = await import("fs");
      const dir = join(homedir(), ".config", "canopy");
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(logFilePath, "# Canopy Debug Log\n", "utf8");
      await shell.openPath(logFilePath);
    }
  };
  ipcMain.handle(CHANNELS.LOGS_OPEN_FILE, handleLogsOpenFile);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.LOGS_OPEN_FILE));

  // ==========================================
  // Directory Handlers
  // ==========================================

  const handleDirectoryGetRecents = async (): Promise<RecentDirectory[]> => {
    const recents = store.get("appState.recentDirectories", []);

    // Validate and clean up stale entries
    const { validateRecentDirectories } = await import("../utils/recentDirectories.js");
    const validRecents = await validateRecentDirectories(recents);

    // Update store if any entries were removed
    if (validRecents.length !== recents.length) {
      store.set("appState.recentDirectories", validRecents);
    }

    return validRecents;
  };
  ipcMain.handle(CHANNELS.DIRECTORY_GET_RECENTS, handleDirectoryGetRecents);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DIRECTORY_GET_RECENTS));

  const handleDirectoryOpen = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: DirectoryOpenPayload
  ) => {
    try {
      // Validate payload structure
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload");
      }

      const { path } = payload;

      // Validate path
      if (!path || typeof path !== "string" || path.trim() === "") {
        throw new Error("Invalid directory path");
      }

      // Check if directory exists and is accessible
      const fs = await import("fs");
      const stats = await fs.promises.stat(path);
      if (!stats.isDirectory()) {
        throw new Error("Path is not a directory");
      }

      // Update recent directories
      const currentRecents = store.get("appState.recentDirectories", []);
      const updatedRecents = await updateRecentDirectories(currentRecents, path);
      store.set("appState.recentDirectories", updatedRecents);

      // Refresh worktree service if available
      if (worktreeService) {
        await worktreeService.refresh();
      }
    } catch (error) {
      console.error("Failed to open directory:", error);
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.DIRECTORY_OPEN, handleDirectoryOpen);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DIRECTORY_OPEN));

  const handleDirectoryOpenDialog = async (): Promise<string | null> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
        title: "Open Directory",
      });

      if (result.canceled || !result.filePaths[0]) {
        return null;
      }

      const selectedPath = result.filePaths[0];

      // Update recent directories
      const currentRecents = store.get("appState.recentDirectories", []);
      const updatedRecents = await updateRecentDirectories(currentRecents, selectedPath);
      store.set("appState.recentDirectories", updatedRecents);

      // Refresh worktree service if available
      if (worktreeService) {
        await worktreeService.refresh();
      }

      return selectedPath;
    } catch (error) {
      console.error("Failed to open directory dialog:", error);
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.DIRECTORY_OPEN_DIALOG, handleDirectoryOpenDialog);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DIRECTORY_OPEN_DIALOG));

  const handleDirectoryRemoveRecent = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: DirectoryRemoveRecentPayload
  ) => {
    try {
      // Validate payload structure
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload");
      }

      const { path } = payload;

      // Validate path
      if (!path || typeof path !== "string" || path.trim() === "") {
        throw new Error("Invalid directory path");
      }

      const currentRecents = store.get("appState.recentDirectories", []);
      const updatedRecents = removeRecentDirectory(currentRecents, path);
      store.set("appState.recentDirectories", updatedRecents);
    } catch (error) {
      console.error("Failed to remove recent directory:", error);
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.DIRECTORY_REMOVE_RECENT, handleDirectoryRemoveRecent);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DIRECTORY_REMOVE_RECENT));

  // ==========================================
  // Event Inspector Handlers
  // ==========================================

  const handleEventInspectorGetEvents = async () => {
    if (!eventBuffer) {
      return [];
    }
    return eventBuffer.getAll();
  };
  ipcMain.handle(CHANNELS.EVENT_INSPECTOR_GET_EVENTS, handleEventInspectorGetEvents);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.EVENT_INSPECTOR_GET_EVENTS));

  const handleEventInspectorGetFiltered = async (
    _event: Electron.IpcMainInvokeEvent,
    filters: EventFilterOptions
  ) => {
    if (!eventBuffer) {
      return [];
    }
    return eventBuffer.getFiltered(filters);
  };
  ipcMain.handle(CHANNELS.EVENT_INSPECTOR_GET_FILTERED, handleEventInspectorGetFiltered);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.EVENT_INSPECTOR_GET_FILTERED));

  const handleEventInspectorClear = async () => {
    if (!eventBuffer) {
      return;
    }
    eventBuffer.clear();
  };
  ipcMain.handle(CHANNELS.EVENT_INSPECTOR_CLEAR, handleEventInspectorClear);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.EVENT_INSPECTOR_CLEAR));

  // ==========================================
  // Project Handlers
  // ==========================================

  const handleProjectGetAll = async () => {
    return projectStore.getAllProjects();
  };
  ipcMain.handle(CHANNELS.PROJECT_GET_ALL, handleProjectGetAll);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_GET_ALL));

  const handleProjectGetCurrent = async () => {
    const currentProject = projectStore.getCurrentProject();

    // Load worktrees for the current project if available
    if (currentProject && worktreeService) {
      try {
        await worktreeService.loadProject(currentProject.path);
      } catch (err) {
        console.error("Failed to load worktrees for current project:", err);
      }
    }

    return currentProject;
  };
  ipcMain.handle(CHANNELS.PROJECT_GET_CURRENT, handleProjectGetCurrent);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_GET_CURRENT));

  const handleProjectAdd = async (_event: Electron.IpcMainInvokeEvent, projectPath: string) => {
    // Validate input
    if (typeof projectPath !== "string" || !projectPath) {
      throw new Error("Invalid project path");
    }
    if (!path.isAbsolute(projectPath)) {
      throw new Error("Project path must be absolute");
    }
    return await projectStore.addProject(projectPath);
  };
  ipcMain.handle(CHANNELS.PROJECT_ADD, handleProjectAdd);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_ADD));

  const handleProjectRemove = async (_event: Electron.IpcMainInvokeEvent, projectId: string) => {
    // Validate input
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project ID");
    }
    await projectStore.removeProject(projectId);
  };
  ipcMain.handle(CHANNELS.PROJECT_REMOVE, handleProjectRemove);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_REMOVE));

  const handleProjectUpdate = async (
    _event: Electron.IpcMainInvokeEvent,
    projectId: string,
    updates: Partial<Project>
  ) => {
    // Validate inputs
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project ID");
    }
    if (typeof updates !== "object" || updates === null) {
      throw new Error("Invalid updates object");
    }
    return projectStore.updateProject(projectId, updates);
  };
  ipcMain.handle(CHANNELS.PROJECT_UPDATE, handleProjectUpdate);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_UPDATE));

  const handleProjectRegenerateIdentity = async (
    _event: Electron.IpcMainInvokeEvent,
    projectId: string
  ) => {
    // Validate input
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project ID");
    }

    const project = projectStore.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Generate new identity using AI with error handling
    let identity;
    try {
      identity = await generateProjectIdentity(project.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`AI identity generation failed: ${message}`);
    }

    if (!identity) {
      throw new Error(
        "AI identity generation unavailable. Please check that your OpenAI API key is configured in Settings."
      );
    }

    // Update project with new AI-generated identity
    const updates: Partial<Project> = {
      aiGeneratedName: identity.title,
      aiGeneratedEmoji: identity.emoji,
      color: identity.gradientStart,
      // Also update display name/emoji with AI suggestions
      name: identity.title,
      emoji: identity.emoji,
      isFallbackIdentity: false,
    };

    return projectStore.updateProject(projectId, updates);
  };
  ipcMain.handle(CHANNELS.PROJECT_REGENERATE_IDENTITY, handleProjectRegenerateIdentity);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_REGENERATE_IDENTITY));

  const handleProjectSwitch = async (_event: Electron.IpcMainInvokeEvent, projectId: string) => {
    // Validate input
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project ID");
    }

    const project = projectStore.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Set as current project (updates lastOpened)
    await projectStore.setCurrentProject(projectId);

    // Get updated project with new lastOpened timestamp
    const updatedProject = projectStore.getProjectById(projectId);
    if (!updatedProject) {
      throw new Error(`Project not found after update: ${projectId}`);
    }

    // Load worktrees for this project
    if (worktreeService) {
      try {
        await worktreeService.loadProject(project.path);
      } catch (err) {
        console.error("Failed to load worktrees for project:", err);
      }
    }

    // Notify renderer with updated project
    sendToRenderer(mainWindow, CHANNELS.PROJECT_ON_SWITCH, updatedProject);

    return updatedProject;
  };
  ipcMain.handle(CHANNELS.PROJECT_SWITCH, handleProjectSwitch);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_SWITCH));

  const handleProjectOpenDialog = async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Open Git Repository",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  };
  ipcMain.handle(CHANNELS.PROJECT_OPEN_DIALOG, handleProjectOpenDialog);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_OPEN_DIALOG));

  const handleProjectGetSettings = async (
    _event: Electron.IpcMainInvokeEvent,
    projectId: string
  ): Promise<ProjectSettings> => {
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project ID");
    }
    return projectStore.getProjectSettings(projectId);
  };
  ipcMain.handle(CHANNELS.PROJECT_GET_SETTINGS, handleProjectGetSettings);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_GET_SETTINGS));

  const handleProjectSaveSettings = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { projectId: string; settings: ProjectSettings }
  ): Promise<void> => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid payload");
    }
    const { projectId, settings } = payload;
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project ID");
    }
    if (!settings || typeof settings !== "object") {
      throw new Error("Invalid settings object");
    }
    return projectStore.saveProjectSettings(projectId, settings);
  };
  ipcMain.handle(CHANNELS.PROJECT_SAVE_SETTINGS, handleProjectSaveSettings);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_SAVE_SETTINGS));

  const handleProjectDetectRunners = async (
    _event: Electron.IpcMainInvokeEvent,
    projectId: string
  ) => {
    if (typeof projectId !== "string" || !projectId) {
      console.warn("[IPC] Invalid project ID for detect runners:", projectId);
      return [];
    }

    const project = projectStore.getProjectById(projectId);
    if (!project) {
      console.warn(`[IPC] Project not found for detect runners: ${projectId}`);
      return [];
    }

    return await runCommandDetector.detect(project.path);
  };
  ipcMain.handle(CHANNELS.PROJECT_DETECT_RUNNERS, handleProjectDetectRunners);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_DETECT_RUNNERS));

  // ==========================================
  // History Handlers (Agent Transcripts)
  // ==========================================

  /**
   * Get agent sessions with optional filters
   */
  const handleHistoryGetSessions = async (
    _event: Electron.IpcMainInvokeEvent,
    payload?: HistoryGetSessionsPayload
  ): Promise<AgentSession[]> => {
    const transcriptManager = getTranscriptManager();
    return await transcriptManager.getSessions(payload);
  };
  ipcMain.handle(CHANNELS.HISTORY_GET_SESSIONS, handleHistoryGetSessions);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.HISTORY_GET_SESSIONS));

  /**
   * Get a single agent session by ID
   */
  const handleHistoryGetSession = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: HistoryGetSessionPayload
  ): Promise<AgentSession | null> => {
    if (!payload || typeof payload.sessionId !== "string" || !payload.sessionId) {
      throw new Error("Invalid payload: sessionId is required");
    }
    const transcriptManager = getTranscriptManager();
    return await transcriptManager.getSession(payload.sessionId);
  };
  ipcMain.handle(CHANNELS.HISTORY_GET_SESSION, handleHistoryGetSession);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.HISTORY_GET_SESSION));

  /**
   * Export a session to JSON or Markdown
   */
  const handleHistoryExportSession = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: HistoryExportSessionPayload
  ): Promise<string | null> => {
    if (!payload || typeof payload.sessionId !== "string" || !payload.sessionId) {
      throw new Error("Invalid payload: sessionId is required");
    }
    if (!payload.format || (payload.format !== "json" && payload.format !== "markdown")) {
      throw new Error("Invalid payload: format must be 'json' or 'markdown'");
    }
    const transcriptManager = getTranscriptManager();
    return await transcriptManager.exportSession(payload.sessionId, payload.format);
  };
  ipcMain.handle(CHANNELS.HISTORY_EXPORT_SESSION, handleHistoryExportSession);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.HISTORY_EXPORT_SESSION));

  /**
   * Delete a session
   */
  const handleHistoryDeleteSession = async (
    _event: Electron.IpcMainInvokeEvent,
    sessionId: string
  ): Promise<void> => {
    if (typeof sessionId !== "string" || !sessionId) {
      throw new Error("Invalid sessionId: must be a non-empty string");
    }
    const transcriptManager = getTranscriptManager();
    await transcriptManager.deleteSession(sessionId);
  };
  ipcMain.handle(CHANNELS.HISTORY_DELETE_SESSION, handleHistoryDeleteSession);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.HISTORY_DELETE_SESSION));

  // ==========================================
  // AI Configuration Handlers
  // ==========================================

  /**
   * Get AI configuration status
   */
  const handleAIGetConfig = async () => {
    return getAIConfig();
  };
  ipcMain.handle(CHANNELS.AI_GET_CONFIG, handleAIGetConfig);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_GET_CONFIG));

  /**
   * Set the OpenAI API key (validates before saving)
   */
  const handleAISetKey = async (
    _event: Electron.IpcMainInvokeEvent,
    apiKey: string
  ): Promise<boolean> => {
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      return false;
    }

    const isValid = await validateAIKey(apiKey.trim());
    if (isValid) {
      setAIConfig({ apiKey: apiKey.trim() });
      return true;
    }
    return false;
  };
  ipcMain.handle(CHANNELS.AI_SET_KEY, handleAISetKey);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_SET_KEY));

  /**
   * Clear the API key
   */
  const handleAIClearKey = async () => {
    clearAIKey();
  };
  ipcMain.handle(CHANNELS.AI_CLEAR_KEY, handleAIClearKey);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_CLEAR_KEY));

  /**
   * Set the AI model
   */
  const handleAISetModel = async (_event: Electron.IpcMainInvokeEvent, model: string) => {
    if (typeof model !== "string" || !model.trim()) {
      throw new Error("Invalid model: must be a non-empty string");
    }
    setAIConfig({ model: model.trim() });
  };
  ipcMain.handle(CHANNELS.AI_SET_MODEL, handleAISetModel);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_SET_MODEL));

  /**
   * Enable/disable AI features
   */
  const handleAISetEnabled = async (_event: Electron.IpcMainInvokeEvent, enabled: boolean) => {
    setAIConfig({ enabled });
  };
  ipcMain.handle(CHANNELS.AI_SET_ENABLED, handleAISetEnabled);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_SET_ENABLED));

  /**
   * Validate an API key without saving
   */
  const handleAIValidateKey = async (
    _event: Electron.IpcMainInvokeEvent,
    apiKey: string
  ): Promise<boolean> => {
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      return false;
    }
    return await validateAIKey(apiKey.trim());
  };
  ipcMain.handle(CHANNELS.AI_VALIDATE_KEY, handleAIValidateKey);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_VALIDATE_KEY));

  /**
   * Generate project identity (emoji, name, colors) using AI
   */
  const handleAIGenerateProjectIdentity = async (
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string
  ) => {
    if (typeof projectPath !== "string" || !projectPath.trim()) {
      throw new Error("Invalid projectPath: must be a non-empty string");
    }
    return await generateProjectIdentity(projectPath.trim());
  };
  ipcMain.handle(CHANNELS.AI_GENERATE_PROJECT_IDENTITY, handleAIGenerateProjectIdentity);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.AI_GENERATE_PROJECT_IDENTITY));

  // ==========================================
  // Run Orchestration Handlers
  // ==========================================

  /**
   * Start a new run (multi-step workflow)
   */
  const handleRunStart = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { name: string; context?: EventContext; description?: string }
  ): Promise<string> => {
    if (!payload || typeof payload.name !== "string" || !payload.name.trim()) {
      throw new Error("Invalid payload: name is required");
    }
    return runManager.startRun(payload.name.trim(), payload.context || {}, payload.description);
  };
  ipcMain.handle(CHANNELS.RUN_START, handleRunStart);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.RUN_START));

  /**
   * Update run progress
   */
  const handleRunUpdateProgress = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { runId: string; progress: number; message?: string }
  ): Promise<void> => {
    if (!payload || typeof payload.runId !== "string" || !payload.runId) {
      throw new Error("Invalid payload: runId is required");
    }
    if (typeof payload.progress !== "number" || !Number.isFinite(payload.progress)) {
      throw new Error("Invalid payload: progress must be a finite number");
    }
    runManager.updateProgress(payload.runId, payload.progress, payload.message);
  };
  ipcMain.handle(CHANNELS.RUN_UPDATE_PROGRESS, handleRunUpdateProgress);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.RUN_UPDATE_PROGRESS));

  /**
   * Pause a run
   */
  const handleRunPause = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { runId: string; reason?: string }
  ): Promise<void> => {
    if (!payload || typeof payload.runId !== "string" || !payload.runId) {
      throw new Error("Invalid payload: runId is required");
    }
    runManager.pauseRun(payload.runId, payload.reason);
  };
  ipcMain.handle(CHANNELS.RUN_PAUSE, handleRunPause);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.RUN_PAUSE));

  /**
   * Resume a paused run
   */
  const handleRunResume = async (
    _event: Electron.IpcMainInvokeEvent,
    runId: string
  ): Promise<void> => {
    if (typeof runId !== "string" || !runId) {
      throw new Error("Invalid runId: must be a non-empty string");
    }
    runManager.resumeRun(runId);
  };
  ipcMain.handle(CHANNELS.RUN_RESUME, handleRunResume);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.RUN_RESUME));

  /**
   * Complete a run successfully
   */
  const handleRunComplete = async (
    _event: Electron.IpcMainInvokeEvent,
    runId: string
  ): Promise<void> => {
    if (typeof runId !== "string" || !runId) {
      throw new Error("Invalid runId: must be a non-empty string");
    }
    runManager.completeRun(runId);
  };
  ipcMain.handle(CHANNELS.RUN_COMPLETE, handleRunComplete);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.RUN_COMPLETE));

  /**
   * Mark a run as failed
   */
  const handleRunFail = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { runId: string; error: string }
  ): Promise<void> => {
    if (!payload || typeof payload.runId !== "string" || !payload.runId) {
      throw new Error("Invalid payload: runId is required");
    }
    if (typeof payload.error !== "string") {
      throw new Error("Invalid payload: error must be a string");
    }
    runManager.failRun(payload.runId, payload.error);
  };
  ipcMain.handle(CHANNELS.RUN_FAIL, handleRunFail);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.RUN_FAIL));

  /**
   * Cancel a run
   */
  const handleRunCancel = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { runId: string; reason?: string }
  ): Promise<void> => {
    if (!payload || typeof payload.runId !== "string" || !payload.runId) {
      throw new Error("Invalid payload: runId is required");
    }
    runManager.cancelRun(payload.runId, payload.reason);
  };
  ipcMain.handle(CHANNELS.RUN_CANCEL, handleRunCancel);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.RUN_CANCEL));

  /**
   * Get a single run by ID
   */
  const handleRunGet = async (
    _event: Electron.IpcMainInvokeEvent,
    runId: string
  ): Promise<RunMetadata | undefined> => {
    if (typeof runId !== "string" || !runId) {
      throw new Error("Invalid runId: must be a non-empty string");
    }
    return runManager.getRun(runId);
  };
  ipcMain.handle(CHANNELS.RUN_GET, handleRunGet);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.RUN_GET));

  /**
   * Get all runs
   */
  const handleRunGetAll = async (): Promise<RunMetadata[]> => {
    return runManager.getAllRuns();
  };
  ipcMain.handle(CHANNELS.RUN_GET_ALL, handleRunGetAll);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.RUN_GET_ALL));

  /**
   * Get active runs (running or paused)
   */
  const handleRunGetActive = async (): Promise<RunMetadata[]> => {
    return runManager.getActiveRuns();
  };
  ipcMain.handle(CHANNELS.RUN_GET_ACTIVE, handleRunGetActive);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.RUN_GET_ACTIVE));

  /**
   * Clear finished runs (completed, failed, cancelled)
   */
  const handleRunClearFinished = async (
    _event: Electron.IpcMainInvokeEvent,
    olderThan?: number
  ): Promise<number> => {
    return runManager.clearFinishedRuns(olderThan);
  };
  ipcMain.handle(CHANNELS.RUN_CLEAR_FINISHED, handleRunClearFinished);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.RUN_CLEAR_FINISHED));

  // Forward run events to renderer
  const runEventTypes = [
    "run:started",
    "run:progress",
    "run:completed",
    "run:failed",
    "run:cancelled",
    "run:paused",
    "run:resumed",
  ] as const;

  for (const eventType of runEventTypes) {
    const unsub = events.on(eventType as (typeof runEventTypes)[number], (payload: unknown) => {
      sendToRenderer(mainWindow, CHANNELS.RUN_EVENT, { type: eventType, payload });
    });
    handlers.push(unsub);
  }

  // Return cleanup function
  return () => {
    handlers.forEach((cleanup) => cleanup());
  };
}

/**
 * Helper to send events from main to renderer
 *
 * @param mainWindow - The main BrowserWindow instance
 * @param channel - The channel name
 * @param args - The arguments to send (spread as separate parameters)
 */
export function sendToRenderer(
  mainWindow: BrowserWindow,
  channel: string,
  ...args: unknown[]
): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}
