/**
 * Error IPC Handlers
 *
 * Handles error-related IPC communication including:
 * - Sending errors to renderer
 * - Processing retry requests
 * - Opening log files
 */

import { ipcMain, BrowserWindow, shell } from "electron";
import { homedir } from "os";
import { join } from "path";
import { CHANNELS } from "./channels.js";
import {
  GitError,
  ProcessError,
  FileSystemError,
  ConfigError,
  getUserMessage,
  getErrorDetails,
  isTransientError,
} from "../utils/errorTypes.js";
import type { DevServerManager } from "../services/DevServerManager.js";
import type { WorktreeService } from "../services/WorktreeService.js";
import type { PtyManager } from "../services/PtyManager.js";

/**
 * Error type mapping from Error classes to type strings
 */
type ErrorType = "git" | "process" | "filesystem" | "network" | "config" | "unknown";

/**
 * Retry action types
 */
type RetryAction = "copytree" | "devserver" | "terminal" | "git" | "worktree" | "injectContext";

/**
 * App error structure sent to renderer
 */
interface AppError {
  id: string;
  timestamp: number;
  type: ErrorType;
  message: string;
  details?: string;
  source?: string;
  context?: {
    worktreeId?: string;
    terminalId?: string;
    filePath?: string;
    command?: string;
  };
  isTransient: boolean;
  dismissed: boolean;
  retryAction?: RetryAction;
  retryArgs?: Record<string, unknown>;
}

/**
 * Retry request payload
 */
interface RetryPayload {
  errorId: string;
  action: RetryAction;
  args?: Record<string, unknown>;
}

/**
 * Convert an error to its type string
 */
function getErrorType(error: unknown): ErrorType {
  if (error instanceof GitError) return "git";
  if (error instanceof ProcessError) return "process";
  if (error instanceof FileSystemError) return "filesystem";
  if (error instanceof ConfigError) return "config";

  // Check for network-related errors
  if (error && typeof error === "object") {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT") {
      return "network";
    }
  }

  return "unknown";
}

/**
 * Generate a unique error ID
 */
function generateErrorId(): string {
  return `error-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create an AppError from an Error object
 */
export function createAppError(
  error: unknown,
  options: {
    source?: string;
    context?: AppError["context"];
    retryAction?: RetryAction;
    retryArgs?: Record<string, unknown>;
  } = {}
): AppError {
  const details = getErrorDetails(error);

  return {
    id: generateErrorId(),
    timestamp: Date.now(),
    type: getErrorType(error),
    message: getUserMessage(error),
    details: details.stack as string | undefined,
    source: options.source,
    context: options.context,
    isTransient: isTransientError(error),
    dismissed: false,
    retryAction: options.retryAction,
    retryArgs: options.retryArgs,
  };
}

/**
 * Error service for sending errors to the renderer
 */
export class ErrorService {
  private mainWindow: BrowserWindow | null = null;
  private devServerManager: DevServerManager | null = null;
  private worktreeService: WorktreeService | null = null;
  private ptyManager: PtyManager | null = null;

  /**
   * Initialize the error service with dependencies
   */
  initialize(
    mainWindow: BrowserWindow,
    devServerManager: DevServerManager | null,
    worktreeService: WorktreeService | null,
    ptyManager: PtyManager | null
  ) {
    this.mainWindow = mainWindow;
    this.devServerManager = devServerManager;
    this.worktreeService = worktreeService;
    this.ptyManager = ptyManager;
  }

  /**
   * Send an error to the renderer process
   */
  sendError(error: AppError) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(CHANNELS.ERROR_NOTIFY, error);
    }
  }

  /**
   * Create and send an error from an Error object
   */
  notifyError(error: unknown, options: Parameters<typeof createAppError>[1] = {}) {
    const appError = createAppError(error, options);
    this.sendError(appError);
    return appError;
  }

  /**
   * Handle retry requests from the renderer
   */
  async handleRetry(payload: RetryPayload): Promise<void> {
    const { action, args } = payload;

    switch (action) {
      case "devserver":
        if (this.devServerManager && args?.worktreeId && args?.worktreePath) {
          await this.devServerManager.start(
            args.worktreeId as string,
            args.worktreePath as string,
            args.command as string | undefined
          );
        }
        break;

      case "terminal":
        if (this.ptyManager && args?.id && args?.cwd) {
          this.ptyManager.spawn(args.id as string, {
            cwd: args.cwd as string,
            cols: (args.cols as number) || 80,
            rows: (args.rows as number) || 30,
          });
        }
        break;

      case "worktree":
        if (this.worktreeService) {
          await this.worktreeService.refresh();
        }
        break;

      case "copytree":
        // CopyTree retries are handled directly by the renderer triggering
        // a new generate/inject call, so nothing to do here
        break;

      case "injectContext":
        // Context injection retries are handled by the renderer (calling inject function)
        // No main-process action needed
        break;

      case "git":
        // Git retries depend on the specific operation, typically handled
        // by the worktree service refresh
        if (this.worktreeService) {
          await this.worktreeService.refresh();
        }
        break;
    }
  }

  /**
   * Open the log file in the default application
   */
  async openLogs(): Promise<void> {
    const logPath = join(homedir(), ".config", "canopy", "worktree-debug.log");
    try {
      await shell.openPath(logPath);
    } catch (error) {
      // If the log file doesn't exist, open the config directory instead
      const configDir = join(homedir(), ".config", "canopy");
      await shell.openPath(configDir);
    }
  }
}

/**
 * Global error service instance
 */
export const errorService = new ErrorService();

/**
 * Register error-related IPC handlers
 */
export function registerErrorHandlers(
  mainWindow: BrowserWindow,
  devServerManager: DevServerManager | null,
  worktreeService: WorktreeService | null,
  ptyManager: PtyManager | null
): () => void {
  const handlers: Array<() => void> = [];

  // Initialize the error service
  errorService.initialize(mainWindow, devServerManager, worktreeService, ptyManager);

  // Handle retry requests
  const handleRetry = async (_event: Electron.IpcMainInvokeEvent, payload: RetryPayload) => {
    try {
      await errorService.handleRetry(payload);
    } catch (error) {
      // If retry fails, send a new error notification
      errorService.notifyError(error, {
        source: `retry-${payload.action}`,
        retryAction: payload.action,
        retryArgs: payload.args,
      });
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.ERROR_RETRY, handleRetry);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.ERROR_RETRY));

  // Handle open logs request
  const handleOpenLogs = async () => {
    await errorService.openLogs();
  };
  ipcMain.handle(CHANNELS.ERROR_OPEN_LOGS, handleOpenLogs);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.ERROR_OPEN_LOGS));

  // Return cleanup function
  return () => {
    handlers.forEach((cleanup) => cleanup());
  };
}
