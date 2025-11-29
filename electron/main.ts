import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import { registerIpcHandlers, sendToRenderer } from "./ipc/handlers.js";
import { registerErrorHandlers } from "./ipc/errorHandlers.js";
import { PtyManager } from "./services/PtyManager.js";
import { DevServerManager } from "./services/DevServerManager.js";
import { worktreeService } from "./services/WorktreeService.js";
import { createWindowWithState } from "./windowState.js";
import { store } from "./store.js";
import { setLoggerWindow } from "./utils/logger.js";
import { EventBuffer } from "./services/EventBuffer.js";
import { events, ALL_EVENT_TYPES } from "./services/events.js";
import { CHANNELS } from "./ipc/channels.js";
import { createApplicationMenu } from "./menu.js";
import { projectStore } from "./services/ProjectStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global error handlers to prevent silent crashes
process.on("uncaughtException", (error) => {
  console.error("[FATAL] Uncaught Exception:", error);
  // Don't exit immediately - let Electron handle cleanup
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled Promise Rejection at:", promise, "reason:", reason);
});

let mainWindow: BrowserWindow | null = null;
let ptyManager: PtyManager | null = null;
let devServerManager: DevServerManager | null = null;
let cleanupIpcHandlers: (() => void) | null = null;
let cleanupErrorHandlers: (() => void) | null = null;
let eventBuffer: EventBuffer | null = null;
let eventBufferUnsubscribe: (() => void) | null = null;

// Terminal ID for the default terminal (for backwards compatibility with renderer)
const DEFAULT_TERMINAL_ID = "default";

async function createWindow(): Promise<void> {
  console.log("[MAIN] Creating window...");
  mainWindow = createWindowWithState({
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#1a1a1a",
  });

  console.log("[MAIN] Window created, loading content...");

  // Set up logger window reference for IPC log streaming
  setLoggerWindow(mainWindow);

  // Create application menu
  console.log("[MAIN] Creating application menu...");
  createApplicationMenu(mainWindow);

  // --- PTY MANAGER SETUP ---
  // Create PtyManager instance to manage all terminal processes
  console.log("[MAIN] Initializing PtyManager...");
  try {
    ptyManager = new PtyManager();
    console.log("[MAIN] PtyManager initialized successfully");
  } catch (error) {
    console.error("[MAIN] Failed to initialize PtyManager:", error);
    throw error;
  }

  // --- DEV SERVER MANAGER SETUP ---
  // Create and initialize DevServerManager
  console.log("[MAIN] Initializing DevServerManager...");
  devServerManager = new DevServerManager();
  devServerManager.initialize(mainWindow, (channel: string, ...args: unknown[]) => {
    if (mainWindow) {
      sendToRenderer(mainWindow, channel, ...args);
    }
  });
  console.log("[MAIN] DevServerManager initialized successfully");

  // --- PROJECT STORE SETUP ---
  // Initialize ProjectStore
  console.log("[MAIN] Initializing ProjectStore...");
  await projectStore.initialize();
  await projectStore.migrateFromRecentDirectories();
  console.log("[MAIN] ProjectStore initialized successfully");

  // --- EVENT BUFFER SETUP ---
  // Create and start EventBuffer to capture all events
  console.log("[MAIN] Initializing EventBuffer...");
  eventBuffer = new EventBuffer(1000);
  eventBuffer.start();

  // Register IPC handlers with PtyManager, DevServerManager, WorktreeService, and EventBuffer
  // IMPORTANT: Register handlers BEFORE loading renderer to avoid race conditions
  console.log("[MAIN] Registering IPC handlers...");
  cleanupIpcHandlers = registerIpcHandlers(
    mainWindow,
    ptyManager,
    devServerManager,
    worktreeService,
    eventBuffer
  );
  console.log("[MAIN] IPC handlers registered successfully");

  // Register error handlers
  console.log("[MAIN] Registering error handlers...");
  cleanupErrorHandlers = registerErrorHandlers(
    mainWindow,
    devServerManager,
    worktreeService,
    ptyManager
  );
  console.log("[MAIN] Error handlers registered successfully");

  // Track if the event inspector is subscribed to prevent unnecessary IPC traffic
  let eventInspectorActive = false;
  const unsubscribers: Array<() => void> = [];

  // Listen for subscription status from renderer
  ipcMain.on(CHANNELS.EVENT_INSPECTOR_SUBSCRIBE, () => {
    eventInspectorActive = true;
    console.log("[MAIN] Event inspector subscribed");
  });
  ipcMain.on(CHANNELS.EVENT_INSPECTOR_UNSUBSCRIBE, () => {
    eventInspectorActive = false;
    console.log("[MAIN] Event inspector unsubscribed");
  });

  // Subscribe to all event types and forward to renderer (only when inspector is active)
  for (const eventType of ALL_EVENT_TYPES) {
    const unsub = events.on(
      eventType as any,
      ((payload: any) => {
        // Only forward if inspector is actively listening
        if (!eventInspectorActive) return;

        // Get sanitized payload from the event buffer's record
        const sanitizedPayload =
          eventBuffer!.getAll().find((e) => e.type === eventType)?.payload ?? payload;

        // Forward to renderer
        sendToRenderer(mainWindow!, CHANNELS.EVENT_INSPECTOR_EVENT, {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          type: eventType,
          payload: sanitizedPayload,
          source: "main",
        });
      }) as any
    );
    unsubscribers.push(unsub);
  }

  eventBufferUnsubscribe = () => {
    unsubscribers.forEach((unsub) => unsub());
    ipcMain.removeAllListeners(CHANNELS.EVENT_INSPECTOR_SUBSCRIBE);
    ipcMain.removeAllListeners(CHANNELS.EVENT_INSPECTOR_UNSUBSCRIBE);
  };
  console.log("[MAIN] EventBuffer initialized and events forwarding to renderer (when subscribed)");

  // All IPC handlers and services are now ready - load renderer
  console.log("[MAIN] All services initialized, loading renderer...");
  if (process.env.NODE_ENV === "development") {
    console.log("[MAIN] Loading Vite dev server at http://localhost:5173");
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    console.log("[MAIN] Loading production build");
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Spawn the default terminal for backwards compatibility with the renderer
  console.log("[MAIN] Spawning default terminal...");
  try {
    ptyManager.spawn(DEFAULT_TERMINAL_ID, {
      cwd: process.env.HOME || os.homedir(),
      cols: 80,
      rows: 30,
    });
    console.log("[MAIN] Default terminal spawned successfully");
  } catch (error) {
    console.error("[MAIN] Failed to spawn default terminal:", error);
    // Don't throw - let the app continue without the default terminal
  }

  mainWindow.on("closed", async () => {
    // Save terminal state before cleanup (to avoid race with before-quit)
    if (ptyManager) {
      const terminals = ptyManager.getAll().map((t) => ({
        id: t.id,
        type: t.type || "shell",
        title: t.title || "Terminal",
        cwd: t.cwd,
        worktreeId: t.worktreeId,
      }));
      store.set("appState.terminals", terminals);
    }

    // Cleanup event buffer subscriptions
    if (eventBufferUnsubscribe) {
      eventBufferUnsubscribe();
      eventBufferUnsubscribe = null;
    }
    if (eventBuffer) {
      eventBuffer.stop();
      eventBuffer = null;
    }

    // Cleanup IPC handlers first to prevent any late IPC traffic
    if (cleanupIpcHandlers) {
      cleanupIpcHandlers();
      cleanupIpcHandlers = null;
    }
    if (cleanupErrorHandlers) {
      cleanupErrorHandlers();
      cleanupErrorHandlers = null;
    }
    // Stop all worktree monitors
    await worktreeService.stopAll();
    // Stop all dev servers
    if (devServerManager) {
      await devServerManager.stopAll();
      devServerManager = null;
    }
    // Then cleanup PTY manager (kills all terminals)
    if (ptyManager) {
      ptyManager.dispose();
      ptyManager = null;
    }
    // Clear logger window reference
    setLoggerWindow(null);
    mainWindow = null;
  });
}

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

// Cleanup on quit - prevent default to ensure graceful shutdown completes
app.on("before-quit", (event) => {
  // Prevent quit until cleanup is done
  event.preventDefault();

  // Save terminal state before cleanup
  if (ptyManager) {
    const terminals = ptyManager.getAll().map((t) => ({
      id: t.id,
      type: t.type || "shell",
      title: t.title || "Terminal",
      cwd: t.cwd,
      worktreeId: t.worktreeId,
    }));
    store.set("appState.terminals", terminals);
  }

  // Perform cleanup
  Promise.all([
    worktreeService.stopAll(),
    devServerManager ? devServerManager.stopAll() : Promise.resolve(),
    new Promise<void>((resolve) => {
      if (ptyManager) {
        ptyManager.dispose();
        ptyManager = null;
      }
      resolve();
    }),
  ])
    .then(() => {
      // Cleanup IPC handlers
      if (cleanupIpcHandlers) {
        cleanupIpcHandlers();
        cleanupIpcHandlers = null;
      }
      if (cleanupErrorHandlers) {
        cleanupErrorHandlers();
        cleanupErrorHandlers = null;
      }
      // Now actually quit
      app.exit(0);
    })
    .catch((error) => {
      console.error("Error during cleanup:", error);
      app.exit(1);
    });
});
