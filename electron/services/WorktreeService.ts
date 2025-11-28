import { BrowserWindow } from 'electron';
import { WorktreeMonitor, type WorktreeState } from './WorktreeMonitor.js';
import type { Worktree, MonitorConfig, AIConfig } from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/config.js';
import { logInfo, logWarn, logDebug } from '../utils/logger.js';
import { events } from './events.js';
import { execSync } from 'child_process';
import { mkdir, writeFile, stat } from 'fs/promises';
import { join as pathJoin, dirname } from 'path';
import { CHANNELS } from '../ipc/channels.js';

// Default polling intervals (used when config is not provided)
const DEFAULT_ACTIVE_WORKTREE_INTERVAL_MS = DEFAULT_CONFIG.monitor?.pollIntervalActive ?? 2000;
const DEFAULT_BACKGROUND_WORKTREE_INTERVAL_MS = DEFAULT_CONFIG.monitor?.pollIntervalBackground ?? 10000;
const DEFAULT_AI_DEBOUNCE_MS = DEFAULT_CONFIG.ai?.summaryDebounceMs ?? 10000;

// Default note path within git directory (matches WorktreeMonitor)
const NOTE_PATH = DEFAULT_CONFIG.note?.filename ?? 'canopy/note';

/**
 * Get the git directory for a worktree.
 * For regular repos: .git directory
 * For worktrees: the actual git directory (e.g., ../.git/worktrees/branch-name)
 */
function getGitDir(worktreePath: string): string | null {
  try {
    const result = execSync('git rev-parse --git-dir', {
      cwd: worktreePath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // If relative path, resolve it relative to worktree path
    if (!result.startsWith('/')) {
      return pathJoin(worktreePath, result);
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Ensure the canopy note file exists for a worktree.
 * Creates .git/canopy/note (or the configured path) if it doesn't exist.
 * This allows AI agents to communicate their status via this file.
 */
async function ensureNoteFile(worktreePath: string): Promise<void> {
  const gitDir = getGitDir(worktreePath);
  if (!gitDir) {
    logDebug('Cannot ensure note file: not a git repository', { path: worktreePath });
    return;
  }

  const notePath = pathJoin(gitDir, NOTE_PATH);

  try {
    // Check if file already exists
    await stat(notePath);
    logDebug('Note file already exists', { path: notePath });
  } catch {
    // File doesn't exist - create it
    try {
      // Ensure the canopy directory exists
      const canopyDir = dirname(notePath);
      await mkdir(canopyDir, { recursive: true });

      // Touch the file (create empty)
      await writeFile(notePath, '', { flag: 'wx' }); // wx = fail if exists (race condition safe)
      logInfo('Created canopy note file', { path: notePath });
    } catch (createError) {
      // Ignore EEXIST (file was created by another process between stat and writeFile)
      const code = (createError as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        logWarn('Failed to create canopy note file', {
          path: notePath,
          error: (createError as Error).message,
        });
      }
    }
  }
}

/**
 * WorktreeService manages all WorktreeMonitor instances.
 *
 * Responsibilities:
 * - Create monitors for new worktrees
 * - Destroy monitors for removed worktrees
 * - Adjust polling intervals based on active/background status
 * - Forward monitor updates to renderer via IPC
 *
 * This service is a singleton and should be accessed via the exported instance.
 */
interface PendingSyncRequest {
  worktrees: Worktree[];
  activeWorktreeId: string | null;
  mainBranch: string;
  watchingEnabled: boolean;
  monitorConfig?: MonitorConfig;
  aiConfig?: AIConfig;
}

export class WorktreeService {
  private monitors = new Map<string, WorktreeMonitor>();
  private mainBranch: string = 'main';
  private watchingEnabled: boolean = true;
  private activeWorktreeId: string | null = null;
  private isSyncing: boolean = false;
  private pendingSync: PendingSyncRequest | null = null;
  private pollIntervalActive: number = DEFAULT_ACTIVE_WORKTREE_INTERVAL_MS;
  private pollIntervalBackground: number = DEFAULT_BACKGROUND_WORKTREE_INTERVAL_MS;
  private aiDebounceMs: number = DEFAULT_AI_DEBOUNCE_MS;

  /**
   * Initialize or update monitors to match the current worktree list.
   *
   * This should be called:
   * - On app startup
   * - When worktrees are added/removed
   * - When the active worktree changes
   *
   * @param worktrees - Current list of worktrees
   * @param activeWorktreeId - ID of the currently active worktree
   * @param mainBranch - Main branch name (default: 'main')
   * @param watchingEnabled - Enable file watching (default: true)
   * @param monitorConfig - Optional polling interval configuration
   * @param aiConfig - Optional AI summary debounce configuration
   */
  public async sync(
    worktrees: Worktree[],
    activeWorktreeId: string | null = null,
    mainBranch: string = 'main',
    watchingEnabled: boolean = true,
    monitorConfig?: MonitorConfig,
    aiConfig?: AIConfig
  ): Promise<void> {
    // If already syncing, queue this request and return
    if (this.isSyncing) {
      logWarn('Sync already in progress, queuing request');
      this.pendingSync = { worktrees, activeWorktreeId, mainBranch, watchingEnabled, monitorConfig, aiConfig };
      return;
    }

    this.isSyncing = true;

    try {
      this.mainBranch = mainBranch;
      this.watchingEnabled = watchingEnabled;
      this.activeWorktreeId = activeWorktreeId;

      // Update polling intervals from config
      if (monitorConfig?.pollIntervalActive !== undefined) {
        this.pollIntervalActive = monitorConfig.pollIntervalActive;
      }
      if (monitorConfig?.pollIntervalBackground !== undefined) {
        this.pollIntervalBackground = monitorConfig.pollIntervalBackground;
      }

      // Update AI debounce from config
      if (aiConfig?.summaryDebounceMs !== undefined) {
        this.aiDebounceMs = aiConfig.summaryDebounceMs;
      }

      const currentIds = new Set(worktrees.map(wt => wt.id));

    // 1. Remove stale monitors (worktrees that no longer exist)
    for (const [id, monitor] of this.monitors) {
      if (!currentIds.has(id)) {
        logInfo('Removing stale WorktreeMonitor', { id });
        // Clean up event bus subscription to prevent memory leak
        const unsubscribe = (monitor as any)._eventBusUnsubscribe;
        if (unsubscribe) {
          unsubscribe();
          delete (monitor as any)._eventBusUnsubscribe;
        }
        await monitor.stop();
        this.monitors.delete(id);
        // Emit removal event via IPC so renderer can clean up cached state
        this.sendToRenderer(CHANNELS.WORKTREE_REMOVE, { worktreeId: id });
      }
    }

    // 2. Create new monitors and update existing ones
    for (const wt of worktrees) {
      const existingMonitor = this.monitors.get(wt.id);
      const isActive = wt.id === activeWorktreeId;

      if (existingMonitor) {
        // Update metadata (branch, name) if changed (e.g., after git checkout)
        existingMonitor.updateMetadata(wt);

        // Update polling interval based on active status
        const interval = isActive
          ? this.pollIntervalActive
          : this.pollIntervalBackground;

        existingMonitor.setPollingInterval(interval);

        // Update AI debounce
        existingMonitor.setAIBufferDelay(this.aiDebounceMs);
      } else {
        // Create new monitor
        logInfo('Creating new WorktreeMonitor', { id: wt.id, path: wt.path });

        // Ensure the canopy note file exists for AI agents to write to
        await ensureNoteFile(wt.path);

        const monitor = new WorktreeMonitor(wt, this.mainBranch);

        // Set initial polling interval
        const interval = isActive
          ? this.pollIntervalActive
          : this.pollIntervalBackground;

        monitor.setPollingInterval(interval);

        // Set AI debounce
        monitor.setAIBufferDelay(this.aiDebounceMs);

        // Subscribe to monitor updates and forward to renderer
        monitor.on('update', (state: WorktreeState) => {
          this.sendToRenderer(CHANNELS.WORKTREE_UPDATE, state);
        });

        // Also listen to events bus for updates (WorktreeMonitor emits to both)
        const unsubscribe = events.on('sys:worktree:update', (state: WorktreeState) => {
          if (state.worktreeId === wt.id) {
            this.sendToRenderer(CHANNELS.WORKTREE_UPDATE, state);
          }
        });

        // Store unsubscribe function for cleanup
        (monitor as any)._eventBusUnsubscribe = unsubscribe;

        // Start monitoring only if watching is enabled
        // When --no-watch is passed, we only do initial status fetch
        if (this.watchingEnabled) {
          await monitor.start();
        } else {
          // Just fetch initial status without starting polling
          await monitor.fetchInitialStatus();
        }

        this.monitors.set(wt.id, monitor);
      }
    }

      logInfo('WorktreeService sync complete', {
        totalMonitors: this.monitors.size,
        activeWorktreeId,
      });
    } finally {
      this.isSyncing = false;

      // Check if there's a pending sync request and execute it
      if (this.pendingSync) {
        const pending = this.pendingSync;
        this.pendingSync = null;
        logInfo('Executing pending sync request');
        // Execute pending sync asynchronously (don't await to avoid blocking)
        void this.sync(
          pending.worktrees,
          pending.activeWorktreeId,
          pending.mainBranch,
          pending.watchingEnabled,
          pending.monitorConfig,
          pending.aiConfig
        );
      }
    }
  }

  /**
   * Get the monitor for a specific worktree.
   *
   * @param worktreeId - Worktree ID
   * @returns WorktreeMonitor instance or undefined
   */
  public getMonitor(worktreeId: string): WorktreeMonitor | undefined {
    return this.monitors.get(worktreeId);
  }

  /**
   * Get all monitor states.
   *
   * @returns Map of worktree ID to WorktreeState
   */
  public getAllStates(): Map<string, WorktreeState> {
    const states = new Map<string, WorktreeState>();
    for (const [id, monitor] of this.monitors) {
      states.set(id, monitor.getState());
    }
    return states;
  }

  /**
   * Set the active worktree.
   * Adjusts polling intervals for active vs background worktrees.
   *
   * @param worktreeId - ID of the worktree to make active
   */
  public setActiveWorktree(worktreeId: string): void {
    const previousActive = this.activeWorktreeId;
    this.activeWorktreeId = worktreeId;

    // Update intervals for all monitors
    for (const [id, monitor] of this.monitors) {
      const isActive = id === worktreeId;
      const interval = isActive
        ? this.pollIntervalActive
        : this.pollIntervalBackground;

      monitor.setPollingInterval(interval);
    }

    logInfo('Active worktree changed', {
      previous: previousActive,
      current: worktreeId,
    });
  }

  /**
   * Refresh a specific worktree or all worktrees.
   *
   * @param worktreeId - Optional worktree ID. If not provided, refreshes all.
   * @param forceAI - Force AI summary regeneration (default: false)
   */
  public async refresh(worktreeId?: string, forceAI: boolean = false): Promise<void> {
    if (worktreeId) {
      const monitor = this.monitors.get(worktreeId);
      if (monitor) {
        await monitor.refresh(forceAI);
      } else {
        logWarn('Attempted to refresh non-existent worktree', { worktreeId });
      }
    } else {
      // Refresh all
      const promises = Array.from(this.monitors.values()).map(monitor =>
        monitor.refresh(forceAI)
      );
      await Promise.all(promises);
    }
  }

  /**
   * Stop all monitors and clean up resources.
   * Should be called on app shutdown.
   */
  public async stopAll(): Promise<void> {
    logInfo('Stopping all WorktreeMonitors', { count: this.monitors.size });

    const promises = Array.from(this.monitors.values()).map(async (monitor) => {
      // Clean up event bus subscription
      const unsubscribe = (monitor as any)._eventBusUnsubscribe;
      if (unsubscribe) {
        unsubscribe();
        delete (monitor as any)._eventBusUnsubscribe;
      }
      await monitor.stop();
    });

    await Promise.all(promises);
    this.monitors.clear();
  }

  /**
   * Get count of active monitors.
   */
  public getMonitorCount(): number {
    return this.monitors.size;
  }

  /**
   * Helper method to send IPC events to all renderer windows.
   *
   * @param channel - IPC channel name
   * @param args - Arguments to send
   */
  private sendToRenderer(channel: string, ...args: unknown[]): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, ...args);
      }
    }
  }
}

export const worktreeService = new WorktreeService();
