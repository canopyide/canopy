import { app, BrowserWindow, ipcMain, dialog, powerMonitor, MessageChannelMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import fixPath from "fix-path";

fixPath();

import { registerIpcHandlers, sendToRenderer } from "./ipc/handlers.js";
import { registerErrorHandlers } from "./ipc/errorHandlers.js";
import { PtyClient, disposePtyClient } from "./services/PtyClient.js";
import { DevServerManager } from "./services/DevServerManager.js";
import { WorkspaceClient, disposeWorkspaceClient } from "./services/WorkspaceClient.js";
import { CliAvailabilityService } from "./services/CliAvailabilityService.js";
import { SidecarManager } from "./services/SidecarManager.js";
import { createWindowWithState } from "./windowState.js";
import { setLoggerWindow, initializeLogger } from "./utils/logger.js";
import { openExternalUrl } from "./utils/openExternal.js";
import { EventBuffer } from "./services/EventBuffer.js";
import { CHANNELS } from "./ipc/channels.js";
import { createApplicationMenu } from "./menu.js";

// Initialize logger early with userData path
initializeLogger(app.getPath("userData"));

import { projectStore } from "./services/ProjectStore.js";
import { store } from "./store.js";
import { MigrationRunner } from "./services/StoreMigrations.js";
import { migrations } from "./services/migrations/index.js";
import { initializeHibernationService } from "./services/HibernationService.js";
import {
  initializeSystemSleepService,
  getSystemSleepService,
} from "./services/SystemSleepService.js";
import { getTranscriptService, disposeTranscriptService } from "./services/TranscriptService.js";

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
let workspaceClient: WorkspaceClient | null = null;
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
      workspaceClient ? workspaceClient.dispose() : Promise.resolve(),
      devServerManager ? devServerManager.stopAll() : Promise.resolve(),
      new Promise<void>((resolve) => {
        if (ptyClient) {
          ptyClient.dispose();
          ptyClient = null;
        }
        disposePtyClient();
        disposeWorkspaceClient();
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

async function initializeDeferredServices(
  window: BrowserWindow,
  devServer: DevServerManager,
  cliService: CliAvailabilityService,
  eventBuf: EventBuffer
): Promise<void> {
  console.log("[MAIN] Initializing deferred services in background...");
  const startTime = Date.now();

  // Initialize DevServerManager
  devServer.initialize(window, (channel: string, ...args: unknown[]) => {
    if (window && !window.isDestroyed()) {
      sendToRenderer(window, channel, ...args);
    }
  });
  console.log("[MAIN] DevServerManager initialized");

  // Parallelize independent async services
  const results = await Promise.allSettled([
    cliService.checkAvailability().then((availability) => {
      console.log("[MAIN] CLI availability checked:", availability);
      return availability;
    }),
    getTranscriptService()
      .initialize()
      .then(() => {
        console.log("[MAIN] TranscriptService initialized");
      }),
  ]);

  // Log any failures
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const serviceName = ["CliAvailabilityService", "TranscriptService"][index];
      console.error(`[MAIN] ${serviceName} initialization failed:`, result.reason);
    }
  });

  // Synchronous services
  initializeHibernationService();
  console.log("[MAIN] HibernationService initialized");

  initializeSystemSleepService();
  console.log("[MAIN] SystemSleepService initialized");

  eventBuf.start();
  console.log("[MAIN] EventBuffer started");

  const elapsed = Date.now() - startTime;
  console.log(`[MAIN] All deferred services initialized in ${elapsed}ms`);
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
    trafficLightPosition: { x: 12, y: 16 },
    backgroundColor: "#18181b",
  });

  console.log("[MAIN] Window created, loading content...");

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("[MAIN] setWindowOpenHandler triggered with URL:", url);
    if (
      url &&
      (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:"))
    ) {
      void openExternalUrl(url).catch((error) => {
        console.error("[MAIN] Failed to open external URL:", error);
      });
    } else {
      console.warn(`[MAIN] Blocked window.open for unsupported/empty URL: ${url}`);
    }
    return { action: "deny" };
  });

  // Intercept Cmd+W (macOS) / Ctrl+W (Windows/Linux) to prevent window close.
  // The renderer handles this shortcut via KeybindingService to close the focused tab.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const isMac = process.platform === "darwin";
    const isCloseShortcut =
      input.key.toLowerCase() === "w" &&
      ((isMac && input.meta && !input.control) || (!isMac && input.control && !input.meta)) &&
      !input.alt;

    if (isCloseShortcut) {
      event.preventDefault();
    }
  });

  setLoggerWindow(mainWindow);

  // Notify renderer of fullscreen state changes (traffic lights are hidden in fullscreen)
  mainWindow.on("enter-full-screen", () => {
    sendToRenderer(mainWindow!, CHANNELS.WINDOW_FULLSCREEN_CHANGE, true);
  });
  mainWindow.on("leave-full-screen", () => {
    sendToRenderer(mainWindow!, CHANNELS.WINDOW_FULLSCREEN_CHANGE, false);
  });

  console.log("[MAIN] Creating application menu...");
  createApplicationMenu(mainWindow);

  // CRITICAL SERVICES: Must complete before renderer loads
  // PtyClient, ProjectStore - terminals and workspace context required immediately
  console.log("[MAIN] Initializing critical services...");

  console.log("[MAIN] Initializing PtyClient (Pty Host pattern)...");
  try {
    ptyClient = new PtyClient({
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 30000,
      showCrashDialog: true,
    });

    ptyClient.on("host-crash", (code) => {
      console.error(`[MAIN] Pty Host crashed with code ${code}`);
    });

    await ptyClient.waitForReady();
    console.log("[MAIN] PtyClient initialized successfully (Pty Host ready)");
  } catch (error) {
    console.error("[MAIN] Failed to initialize PtyClient:", error);
    throw error;
  }

  // Create MessagePort channel for direct Renderer ↔ Pty Host terminal I/O
  console.log("[MAIN] Creating MessagePort channel for direct terminal I/O...");

  function createAndDistributePorts(): void {
    const { port1, port2 } = new MessageChannelMain();

    if (ptyClient) {
      ptyClient.connectMessagePort(port2);
      console.log("[MAIN] MessagePort sent to Pty Host");
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.postMessage("terminal-port", null, [port1]);
      console.log("[MAIN] MessagePort sent to renderer");
    }
  }

  // Create initial ports
  createAndDistributePorts();

  // Set up callback to refresh ports on host restart
  if (ptyClient) {
    ptyClient.setPortRefreshCallback(() => {
      console.log("[MAIN] Pty Host restarted, creating fresh MessagePorts...");
      createAndDistributePorts();
    });
  }

  // Initialize WorkspaceClient (replaces WorktreeService)
  // The WorkspaceClient spawns a UtilityProcess (workspace-host) that handles all git operations
  // and worktree monitoring, keeping the Main process responsive.
  console.log("[MAIN] Initializing WorkspaceClient (Workspace Host pattern)...");
  try {
    workspaceClient = new WorkspaceClient({
      maxRestartAttempts: 3,
      healthCheckIntervalMs: 60000,
      showCrashDialog: true,
    });

    workspaceClient.on("host-crash", (code) => {
      console.error(`[MAIN] Workspace Host crashed with code ${code}`);
    });

    await workspaceClient.waitForReady();
    console.log("[MAIN] WorkspaceClient initialized successfully (Workspace Host ready)");
  } catch (error) {
    console.error("[MAIN] Failed to initialize WorkspaceClient:", error);
    throw error;
  }
  console.log("[MAIN] Initializing ProjectStore...");
  await projectStore.initialize();
  console.log("[MAIN] ProjectStore initialized successfully");

  // Create placeholder instances for IPC registration
  // These will be properly initialized in deferred services
  devServerManager = new DevServerManager();
  cliAvailabilityService = new CliAvailabilityService();
  eventBuffer = new EventBuffer(1000);
  sidecarManager = new SidecarManager(mainWindow);

  // IMPORTANT: Register handlers BEFORE loading renderer to avoid race conditions
  console.log("[MAIN] Registering IPC handlers...");
  cleanupIpcHandlers = registerIpcHandlers(
    mainWindow,
    ptyClient,
    devServerManager,
    workspaceClient,
    eventBuffer,
    cliAvailabilityService,
    sidecarManager
  );
  console.log("[MAIN] IPC handlers registered successfully");

  console.log("[MAIN] Registering error handlers...");
  cleanupErrorHandlers = registerErrorHandlers(
    mainWindow,
    devServerManager,
    workspaceClient,
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
  console.log("[MAIN] EventBuffer subscriptions ready (will start with deferred services)");

  // Power management: pause services during sleep to prevent time-drift crashes
  console.log("[MAIN] Registering power monitor handlers...");
  let suspendTime: number | null = null;

  powerMonitor.on("suspend", () => {
    console.log("[MAIN] System suspending. Pausing health checks and monitors.");

    // Clear any pending resume timeout from rapid suspend/resume cycles
    if (resumeTimeout) {
      clearTimeout(resumeTimeout);
      resumeTimeout = null;
    }

    if (ptyClient) {
      ptyClient.pauseHealthCheck();
      // Proactively pause all PTY processes to prevent buffer overflow during sleep
      ptyClient.pauseAll();
    }
    if (workspaceClient) {
      workspaceClient.pauseHealthCheck();
      workspaceClient.setPollingEnabled(false);
    }

    // Record suspend time to calculate sleep duration on wake
    suspendTime = Date.now();
  });

  powerMonitor.on("resume", () => {
    console.log("[MAIN] System resuming. Restoring services after stabilization delay.");

    // Clear any existing timeout to prevent stale resume operations
    if (resumeTimeout) {
      clearTimeout(resumeTimeout);
    }

    // 2-second delay allows OS network/disk subsystems to stabilize
    resumeTimeout = setTimeout(async () => {
      resumeTimeout = null;
      try {
        if (ptyClient) {
          // Resume PTY processes incrementally before resuming health checks
          ptyClient.resumeAll();
          ptyClient.resumeHealthCheck();
        }
        if (workspaceClient) {
          // Wait for workspace host to be ready after sleep
          await workspaceClient.waitForReady();
          workspaceClient.setPollingEnabled(true);
          workspaceClient.resumeHealthCheck();
          await workspaceClient.refresh();
        }

        // Check and recover dev servers that died during sleep
        if (devServerManager) {
          await devServerManager.onSystemResume();
        }

        // Notify renderer that system has woken
        const sleepDuration = suspendTime ? Date.now() - suspendTime : 0;
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send(CHANNELS.SYSTEM_WAKE, {
            sleepDuration,
            timestamp: Date.now(),
          });
        });
        suspendTime = null;
      } catch (error) {
        console.error("[MAIN] Error during resume:", error);
      }
    }, 2000);
  });
  console.log("[MAIN] Power monitor handlers registered");

  // LOAD RENDERER: Don't wait for deferred services
  console.log("[MAIN] Critical services ready, loading renderer...");
  if (process.env.NODE_ENV === "development") {
    console.log("[MAIN] Loading Vite dev server at http://localhost:5173");
    mainWindow.loadURL("http://localhost:5173");
  } else {
    console.log("[MAIN] Loading production build");
    mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  // Send MessagePort on every renderer load (handles HMR and reloads)
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("[MAIN] Renderer loaded, sending MessagePort for direct terminal I/O...");
    createAndDistributePorts();
  });

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

  // DEFERRED SERVICES: Initialize in background after renderer loads
  initializeDeferredServices(
    mainWindow,
    devServerManager!,
    cliAvailabilityService!,
    eventBuffer!
  ).catch((error) => {
    console.error("[MAIN] Deferred services initialization failed:", error);
  });

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
    if (workspaceClient) {
      workspaceClient.dispose();
      workspaceClient = null;
    }
    disposeWorkspaceClient();
    if (devServerManager) {
      await devServerManager.stopAll();
      devServerManager = null;
    }
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

    // Dispose TranscriptService
    disposeTranscriptService();

    setLoggerWindow(null);
    mainWindow = null;
  });
}
