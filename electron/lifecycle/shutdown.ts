import { app, dialog } from "electron";
import type { PtyClient } from "../services/PtyClient.js";
import type { WorkspaceClient } from "../services/WorkspaceClient.js";
import { projectStore } from "../services/ProjectStore.js";
import { getActiveAgentCount, showQuitWarning } from "../utils/quitWarning.js";
import {
  disposeAgentAvailabilityStore,
  getAgentAvailabilityStore,
} from "../services/AgentAvailabilityStore.js";
import { disposePowerSaveBlockerService } from "../services/PowerSaveBlockerService.js";
import { disposePtyClient } from "../services/PtyClient.js";
import { disposeWorkspaceClient } from "../services/WorkspaceClient.js";
import { disposeMainProcessWatchdog } from "../services/MainProcessWatchdogClient.js";
import { getCrashRecoveryService } from "../services/CrashRecoveryService.js";
import { getCrashLoopGuard } from "../services/CrashLoopGuardService.js";
import { getDatabaseMaintenanceService } from "../services/DatabaseMaintenanceService.js";
import { closeSharedDb } from "../services/persistence/db.js";
import { closeTelemetry } from "../services/TelemetryService.js";
import { isSmokeTest } from "../setup/environment.js";
import { isSignalShutdown } from "./signalShutdownState.js";
import { CLEANUP_TIMEOUT_MS } from "./shutdownConfig.js";

export { CLEANUP_TIMEOUT_MS };

export interface ShutdownDeps {
  getPtyClient: () => PtyClient | null;
  setPtyClient: (v: PtyClient | null) => void;
  getWorkspaceClient: () => WorkspaceClient | null;
  getCleanupIpcHandlers: () => (() => void) | null;
  setCleanupIpcHandlers: (v: (() => void) | null) => void;
  getCleanupErrorHandlers: () => (() => void) | null;
  setCleanupErrorHandlers: (v: (() => void) | null) => void;
  getStopEventLoopLagMonitor: () => (() => void) | null;
  setStopEventLoopLagMonitor: (v: (() => void) | null) => void;
  getStopProcessMemoryMonitor: () => (() => void) | null;
  setStopProcessMemoryMonitor: (v: (() => void) | null) => void;
  getStopAppMetricsMonitor: () => (() => void) | null;
  setStopAppMetricsMonitor: (v: (() => void) | null) => void;
  getStopDiskSpaceMonitor: () => (() => void) | null;
  setStopDiskSpaceMonitor: (v: (() => void) | null) => void;
  windowRegistry?: import("../window/WindowRegistry.js").WindowRegistry;
}

let isQuitting = false;
let isConfirmingQuit = false;

export function registerShutdownHandler(deps: ShutdownDeps): void {
  app.on("before-quit", async (event) => {
    if (isQuitting || isSmokeTest) {
      return;
    }

    const canShowDialog =
      process.env.DAINTREE_E2E_MODE !== "1" &&
      !isSignalShutdown() &&
      deps.windowRegistry?.getPrimary()?.browserWindow != null;

    if (isConfirmingQuit) {
      event.preventDefault();
      return;
    }

    if (canShowDialog) {
      event.preventDefault();

      const activeCount = getActiveAgentCount(getAgentAvailabilityStore());
      if (activeCount > 0) {
        isConfirmingQuit = true;
        let confirmed = false;
        try {
          const primaryWindow = deps.windowRegistry?.getPrimary()?.browserWindow ?? null;
          confirmed = await showQuitWarning(activeCount, dialog.showMessageBox, primaryWindow);
        } catch (error) {
          console.error("[MAIN] Error showing quit warning:", error);
        } finally {
          isConfirmingQuit = false;
        }

        if (!confirmed) {
          return;
        }
      }
    } else {
      event.preventDefault();
    }

    isQuitting = true;

    console.log("[MAIN] Starting graceful shutdown...");
    const { drainRateLimitQueues } = await import("../ipc/utils.js");
    drainRateLimitQueues();

    const ptyClient = deps.getPtyClient();
    const workspaceClient = deps.getWorkspaceClient();
    const gracefulShutdownPromise = (async () => {
      if (!ptyClient) return;
      try {
        const allProjects = projectStore.getAllProjects();
        const projectIds = allProjects.map((p) => p.id);
        const allResults = await Promise.race([
          Promise.all(projectIds.map((pid) => ptyClient.gracefulKillByProject(pid))),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("graceful shutdown timeout")), 4000)
          ),
        ]);

        for (let i = 0; i < projectIds.length; i++) {
          const results = allResults[i];
          const captured = results.filter((r) => r.agentSessionId);
          if (captured.length === 0) continue;

          const state = await projectStore.getProjectState(projectIds[i]);
          if (!state?.terminals) continue;

          for (const result of captured) {
            const snapshot = state.terminals.find((t: { id: string }) => t.id === result.id);
            if (snapshot) {
              snapshot.agentSessionId = result.agentSessionId ?? undefined;
            }
          }
          await projectStore.saveProjectState(projectIds[i], state);
        }
      } catch (error) {
        console.warn("[MAIN] Graceful agent shutdown incomplete:", error);
      }
    })();

    let currentPhase = "service-disposal";
    let exitCalled = false;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanupPromise = gracefulShutdownPromise
      .then(() =>
        Promise.all([
          workspaceClient ? workspaceClient.dispose() : Promise.resolve(),
          // McpServerService is dynamically imported only after first-interactive.
          // If the deferred task never ran (early shutdown), the module never loaded
          // and there is nothing to stop — skip silently.
          import("../services/McpServerService.js")
            .then(({ mcpServerService }) => mcpServerService.stop())
            .catch(() => {}),
          // Revoke and remove any in-flight help-session dirs. Same lazy-import
          // guard as MCP — the module only loads if a help session was provisioned.
          import("../services/HelpSessionService.js")
            .then(({ helpSessionService }) => helpSessionService.revokeAll())
            .catch(() => {}),
          new Promise<void>((resolve) => {
            disposePowerSaveBlockerService();
            disposeAgentAvailabilityStore();
            if (ptyClient) {
              ptyClient.dispose();
              deps.setPtyClient(null);
            }
            disposePtyClient();
            disposeWorkspaceClient();
            disposeMainProcessWatchdog();
            resolve();
          }),
        ])
      )
      .then(async () => {
        currentPhase = "ipc-cleanup";
        const cleanupIpc = deps.getCleanupIpcHandlers();
        if (cleanupIpc) {
          cleanupIpc();
          deps.setCleanupIpcHandlers(null);
        }
        const cleanupErr = deps.getCleanupErrorHandlers();
        if (cleanupErr) {
          cleanupErr();
          deps.setCleanupErrorHandlers(null);
        }
        const stopLag = deps.getStopEventLoopLagMonitor();
        if (stopLag) {
          stopLag();
          deps.setStopEventLoopLagMonitor(null);
        }
        const stopMem = deps.getStopProcessMemoryMonitor();
        if (stopMem) {
          stopMem();
          deps.setStopProcessMemoryMonitor(null);
        }
        const stopMetrics = deps.getStopAppMetricsMonitor();
        if (stopMetrics) {
          stopMetrics();
          deps.setStopAppMetricsMonitor(null);
        }
        const stopDisk = deps.getStopDiskSpaceMonitor();
        if (stopDisk) {
          stopDisk();
          deps.setStopDiskSpaceMonitor(null);
        }

        try {
          await getDatabaseMaintenanceService().dispose();
        } catch (error) {
          console.warn("[MAIN] Database maintenance dispose failed:", error);
        }

        try {
          closeSharedDb();
        } catch (error) {
          console.warn("[MAIN] Failed to close SQLite connection:", error);
        }
      });

    const timeoutPromise = new Promise<never>((_, reject) => {
      hardTimer = setTimeout(() => {
        reject(
          new Error(
            `Hard shutdown timeout after ${CLEANUP_TIMEOUT_MS}ms — stuck at phase: ${currentPhase}`
          )
        );
      }, CLEANUP_TIMEOUT_MS);
    });

    Promise.race([cleanupPromise, timeoutPromise])
      .then(async () => {
        if (exitCalled) return;
        exitCalled = true;
        clearTimeout(hardTimer);
        console.log("[MAIN] Graceful shutdown complete");
        // Mark the exit clean BEFORE telemetry — telemetry is best-effort and
        // a closeTelemetry failure must never make the next launch think we crashed.
        // Independent try blocks so a failure in one marker write doesn't skip the other.
        try {
          getCrashRecoveryService().cleanupOnExit();
        } catch (err) {
          console.warn("[MAIN] CrashRecoveryService.cleanupOnExit failed:", err);
        }
        try {
          getCrashLoopGuard().markCleanExit();
        } catch (err) {
          console.warn("[MAIN] CrashLoopGuard.markCleanExit failed:", err);
        }
        try {
          await closeTelemetry();
        } catch (err) {
          console.warn("[MAIN] closeTelemetry failed:", err);
        }
        app.exit(0);
      })
      .catch(async (error) => {
        if (exitCalled) return;
        exitCalled = true;
        clearTimeout(hardTimer);
        console.error("[MAIN] Error during cleanup:", error);
        // Intentionally do NOT clean up the marker on the error/timeout path —
        // leaving running.lock on disk is the dirty-exit signal for next launch.
        try {
          await closeTelemetry();
        } catch (err) {
          console.warn("[MAIN] closeTelemetry failed:", err);
        }
        app.exit(1);
      });
  });
}
