import { app, BrowserWindow, ipcMain, dialog, powerMonitor } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import fixPath from "fix-path";

fixPath();
import { registerIpcHandlers, sendToRenderer } from "./ipc/handlers.js";
import { registerErrorHandlers } from "./ipc/errorHandlers.js";
import { PtyClient, disposePtyClient } from "./services/PtyClient.js";
import { DevServerManager } from "./services/DevServerManager.js";
import { worktreeService } from "./services/WorktreeService.js";
import { CliAvailabilityService } from "./services/CliAvailabilityService.js";
import { SidecarManager } from "./services/SidecarManager.js";
import { createWindowWithState } from "./windowState.js";
import { setLoggerWindow } from "./utils/logger.js";
import { EventBuffer } from "./services/EventBuffer.js";
import { CHANNELS } from "./ipc/channels.js";
import { createApplicationMenu } from "./menu.js";
import { projectStore } from "./services/ProjectStore.js";
import { getTranscriptManager, disposeTranscriptManager } from "./services/TranscriptManager.js";
import { store } from "./store.js";
import { MigrationRunner } from "./services/StoreMigrations.js";
import { migrations } from "./services/migrations/index.js";
import { initializeHibernationService } from "./services/HibernationService.js";
import { initializeSystemSleepService, getSystemSleepService } from "./services/SystemSleepService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on("uncaughtException", (error) => {
  console.error("[FATAL] Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled Promise Rejection at:", promise, "reason:", reason);
});

let mainWindow: BrowserWindow | null = null;
let ptyClient: PtyClient | null = null;
let devServerManager: DevServerManager | null = null;
let cliAvailabilityService: CliAvailabilityService | null = null;
let sidecarManager: SidecarManager | null = null;
let cleanupIpcHandlers: (() => void) | null = null;
let cleanupErrorHandlers: (() => void) | null = null;
let eventBuffer: EventBuffer | null = null;
let eventBufferUnsubscribe: (() => void) | null = null;

const DEFAULT_TERMINAL_ID = "default";

let isQuitting = false;
let resumeTimeout: NodeJS.Timeout | null = null;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log("[MAIN] Another instance is already running. Quitting...");
  app.quit();
} else {
  app.on("second-instance", (_event, _commandLine, _workingDirectory) => {
    console.log("[MAIN] Second instance detected, focusing main window");
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on("before-quit", (event) => {
    if (isQuitting || !mainWindow) {
      return;
    }

    event.preventDefault();
    isQuitting = true;

    console.log("[MAIN] Starting graceful shutdown...");

    // NOTE: Terminal state is persisted by the renderer via appClient.setState()
    // in terminalRegistrySlice.ts. We don't overwrite it here because:
    // 1. Renderer state includes command/location fields needed for restoration
    // 2. PtyManager only has runtime state (id/type/title/cwd), missing persistence fields
    // 3. Overwriting would strip command field, breaking agent terminal restoration

    Promise.all([
      worktreeService.stopAll(),
      devServerManager ? devServerManager.stopAll() : Promise.resolve(),
      disposeTranscriptManager(),
      new Promise<void>((resolve) => {
        if (ptyClient) {
          ptyClient.dispose();
          ptyClient = null;
        }
        disposePtyClient();
        resolve();
      }),
    ])
      .then(() => {
        if (cleanupIpcHandlers) {
          cleanupIpcHandlers();
          cleanupIpcHandlers = null;
        }
        if (cleanupErrorHandlers) {
          cleanupErrorHandlers();
          cleanupErrorHandlers = null;
        }
        console.log("[MAIN] Graceful shutdown complete");
        app.exit(0);
      })
      .catch((error) => {
        console.error("[MAIN] Error during cleanup:", error);
        app.exit(1);
      });
  });
}

async function createWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log("[MAIN] Main window already exists, focusing");
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }

  console.log("[MAIN] Running store migrations...");
  try {
    const migrationRunner = new MigrationRunner(store);
    migrationRunner.runMigrations(migrations);
    console.log("[MAIN] Store migrations completed");
  } catch (error) {
    console.error("[MAIN] Store migration failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox(
      "Migration Failed",
      `Failed to migrate application data:\n\n${message}\n\nThe application will now exit. Please check the logs for details.`
    );
    app.exit(1);
    return;
  }

  console.log("[MAIN] Creating window...");
  mainWindow = createWindowWithState({
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#18181b",
  });

  console.log("[MAIN] Window created, loading content...");

  setLoggerWindow(mainWindow);

  console.log("[MAIN] Creating application menu...");
  createApplicationMenu(mainWindow);

  // Initialize PtyClient (replaces PtyManager + TerminalObserver + PtyPool)
  // The PtyClient spawns a UtilityProcess (pty-host) that handles all terminal I/O
  // and state analysis, keeping the Main process responsive.
  console.log("[MAIN] Initializing PtyClient (Pty Host pattern)...");
  try {
    ptyClient = new PtyClient({
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
      showCrashDialog: true,
    });

    // Listen for host crashes
    ptyClient.on("host-crash", (code) => {
      console.error(`[MAIN] Pty Host crashed with code ${code}`);
      // The PtyClient handles restart attempts internally
    });

    // Wait for host to be ready before proceeding
    await ptyClient.waitForReady();
    console.log("[MAIN] PtyClient initialized successfully (Pty Host ready)");
  } catch (error) {
    console.error("[MAIN] Failed to initialize PtyClient:", error);
    throw error;
  }

  console.log("[MAIN] Initializing DevServerManager...");
  devServerManager = new DevServerManager();
  devServerManager.initialize(mainWindow, (channel: string, ...args: unknown[]) => {
    if (mainWindow) {
      sendToRenderer(mainWindow, channel, ...args);
    }
  });
  console.log("[MAIN] DevServerManager initialized successfully");

  console.log("[MAIN] Initializing CliAvailabilityService...");
  cliAvailabilityService = new CliAvailabilityService();
  cliAvailabilityService.checkAvailability().then((availability) => {
    console.log("[MAIN] CLI availability checked:", availability);
  });
  console.log("[MAIN] CliAvailabilityService initialized successfully");

  console.log("[MAIN] Initializing ProjectStore...");
  await projectStore.initialize();
  console.log("[MAIN] ProjectStore initialized successfully");

  console.log("[MAIN] Initializing HibernationService...");
  initializeHibernationService();
  console.log("[MAIN] HibernationService initialized successfully");

  console.log("[MAIN] Initializing SystemSleepService...");
  initializeSystemSleepService();
  console.log("[MAIN] SystemSleepService initialized successfully");

  console.log("[MAIN] Initializing TranscriptManager...");
  const transcriptManager = getTranscriptManager();
  await transcriptManager.initialize();
  console.log("[MAIN] TranscriptManager initialized successfully");

  console.log("[MAIN] Initializing EventBuffer...");
  eventBuffer = new EventBuffer(1000);
  eventBuffer.start();

  console.log("[MAIN] Initializing SidecarManager...");
  sidecarManager = new SidecarManager(mainWindow);
  console.log("[MAIN] SidecarManager initialized successfully");

  // IMPORTANT: Register handlers BEFORE loading renderer to avoid race conditions
  console.log("[MAIN] Registering IPC handlers...");
  cleanupIpcHandlers = registerIpcHandlers(
    mainWindow,
    ptyClient,
    devServerManager,
    worktreeService,
    eventBuffer,
    cliAvailabilityService,
    sidecarManager
  );
  console.log("[MAIN] IPC handlers registered successfully");

  console.log("[MAIN] Registering error handlers...");
  cleanupErrorHandlers = registerErrorHandlers(
    mainWindow,
    devServerManager,
    worktreeService,
    ptyClient
  );
  console.log("[MAIN] Error handlers registered successfully");

  let eventInspectorActive = false;

  ipcMain.on(CHANNELS.EVENT_INSPECTOR_SUBSCRIBE, () => {
    eventInspectorActive = true;
    console.log("[MAIN] Event inspector subscribed");
  });
  ipcMain.on(CHANNELS.EVENT_INSPECTOR_UNSUBSCRIBE, () => {
    eventInspectorActive = false;
    console.log("[MAIN] Event inspector unsubscribed");
  });

  const unsubscribeFromEventBuffer = eventBuffer.onRecord((record) => {
    if (!eventInspectorActive) return;

    sendToRenderer(mainWindow!, CHANNELS.EVENT_INSPECTOR_EVENT, record);
  });

  eventBufferUnsubscribe = () => {
    unsubscribeFromEventBuffer();
    ipcMain.removeAllListeners(CHANNELS.EVENT_INSPECTOR_SUBSCRIBE);
    ipcMain.removeAllListeners(CHANNELS.EVENT_INSPECTOR_UNSUBSCRIBE);
  };
  console.log("[MAIN] EventBuffer initialized and events forwarding to renderer (when subscribed)");

  // Power management: pause services during sleep to prevent time-drift crashes
  console.log("[MAIN] Registering power monitor handlers...");
  powerMonitor.on("suspend", () => {
    console.log("[MAIN] System suspending. Pausing health checks and monitors.");

    // Clear any pending resume timeout from rapid suspend/resume cycles
    if (resumeTimeout) {
      clearTimeout(resumeTimeout);
      resumeTimeout = null;
    }

    if (ptyClient) {
      ptyClient.pauseHealthCheck();
    }
    worktreeService.setPollingEnabled(false);
  });

  powerMonitor.on("resume", () => {
    console.log("[MAIN] System resuming. Restoring services after stabilization delay.");

    // Clear any existing timeout to prevent stale resume operations
    if (resumeTimeout) {
      clearTimeout(resumeTimeout);
    }

    // 2-second delay allows OS network/disk subsystems to stabilize
    resumeTimeout = setTimeout(() => {
      resumeTimeout = null;
      try {
        if (ptyClient) {
          ptyClient.resumeHealthCheck();
        }
        worktreeService.setPollingEnabled(true);
        void worktreeService.refresh();
      } catch (error) {
        console.error("[MAIN] Error during resume:", error);
      }
    }, 2000);
  });
  console.log("[MAIN] Power monitor handlers registered");

  console.log("[MAIN] All services initialized, loading renderer...");
  if (process.env.NODE_ENV === "development") {
    console.log("[MAIN] Loading Vite dev server at http://localhost:5173");
    mainWindow.loadURL("http://localhost:5173");
  } else {
    console.log("[MAIN] Loading production build");
    mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  console.log("[MAIN] Spawning default terminal...");
  try {
    ptyClient.spawn(DEFAULT_TERMINAL_ID, {
      cwd: process.env.HOME || os.homedir(),
      cols: 80,
      rows: 30,
    });
    console.log("[MAIN] Default terminal spawned successfully");
  } catch (error) {
    console.error("[MAIN] Failed to spawn default terminal:", error);
  }

  mainWindow.on("closed", async () => {
    // NOTE: Terminal state is persisted by the renderer via appClient.setState()
    // in terminalRegistrySlice.ts. We don't save terminals here because:
    // 1. Renderer state includes command/location fields needed for restoration
    // 2. PtyClient doesn't have synchronous access to terminal metadata
    // 3. Terminal state is already saved by renderer on state changes

    if (eventBufferUnsubscribe) {
      eventBufferUnsubscribe();
      eventBufferUnsubscribe = null;
    }
    if (eventBuffer) {
      eventBuffer.stop();
      eventBuffer = null;
    }

    if (cleanupIpcHandlers) {
      cleanupIpcHandlers();
      cleanupIpcHandlers = null;
    }
    if (cleanupErrorHandlers) {
      cleanupErrorHandlers();
      cleanupErrorHandlers = null;
    }
    await worktreeService.stopAll();
    if (devServerManager) {
      await devServerManager.stopAll();
      devServerManager = null;
    }
    await disposeTranscriptManager();
    if (sidecarManager) {
      sidecarManager.destroy();
      sidecarManager = null;
    }
    if (ptyClient) {
      ptyClient.dispose();
      ptyClient = null;
    }
    disposePtyClient();

    // Dispose SystemSleepService
    const sleepService = getSystemSleepService();
    sleepService.dispose();

    setLoggerWindow(null);
    mainWindow = null;
  });
}
