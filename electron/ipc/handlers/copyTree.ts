import { ipcMain, clipboard } from "electron";
import crypto from "crypto";
import path from "path";
import { CHANNELS } from "../channels.js";
import { sendToRenderer } from "../utils.js";
import { copyTreeService } from "../../services/CopyTreeService.js";
import type { HandlerDependencies } from "../types.js";
import type {
  CopyTreeGeneratePayload,
  CopyTreeGenerateAndCopyFilePayload,
  CopyTreeInjectPayload,
  CopyTreeGetFileTreePayload,
  CopyTreeResult,
  CopyTreeProgress,
  FileTreeNode,
} from "../../types/index.js";
import {
  CopyTreeGeneratePayloadSchema,
  CopyTreeGenerateAndCopyFilePayloadSchema,
  CopyTreeInjectPayloadSchema,
  CopyTreeGetFileTreePayloadSchema,
} from "../../schemas/ipc.js";

export function registerCopyTreeHandlers(deps: HandlerDependencies): () => void {
  const { mainWindow, worktreeService, ptyManager } = deps;
  const handlers: Array<() => void> = [];
  
  // Track in-flight context injections per terminal to prevent race conditions
  const injectionsInProgress = new Set<string>();

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

    const { getFileTree } = await import("../../utils/fileTree.js");
    return getFileTree(monitor.path, validated.dirPath);
  };
  ipcMain.handle(CHANNELS.COPYTREE_GET_FILE_TREE, handleCopyTreeGetFileTree);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.COPYTREE_GET_FILE_TREE));

  return () => handlers.forEach((cleanup) => cleanup());
}
