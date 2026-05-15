import os from "os";
import PQueue from "p-queue";
import { existsSync } from "fs";
import { stat, readFile, access, mkdir } from "fs/promises";
import { resolve as pathResolve, isAbsolute, dirname } from "path";
import { validateBranchName } from "../../shared/utils/pathPattern.js";
import { generateProjectId, settingsFilePath } from "../services/projectStorePaths.js";
import { SimpleGit, BranchSummary } from "simple-git";
import { createHardenedGit, createAuthenticatedGit } from "../utils/hardenedGit.js";
import { classifyGitError, getGitRecoveryAction } from "../../shared/utils/gitOperationErrors.js";
import type { Worktree } from "../../shared/types/worktree.js";
import type {
  WorkspaceHostEvent,
  WorktreeSnapshot,
  MonitorConfig,
  CreateWorktreeOptions,
  BranchInfo,
} from "../../shared/types/workspace-host.js";
import { invalidateGitStatusCache } from "../utils/git.js";
import { detectWslPath, getDefaultWslDistro } from "../utils/wsl.js";
import {
  getGitDir,
  getGitCommonDir,
  clearGitDirCache,
  clearGitCommonDirCache,
} from "../utils/gitUtils.js";
import { extractIssueNumberSync, extractIssueNumber } from "../services/issueExtractor.js";
import { pullRequestService } from "../services/PullRequestService.js";
import { events } from "../services/events.js";
import { WorktreeLifecycleService, type WorkspaceHostContext } from "./WorktreeLifecycleService.js";
import { WorktreeMonitor } from "./WorktreeMonitor.js";
import { WorktreeListService } from "./WorktreeListService.js";
import { PRIntegrationService } from "./PRIntegrationService.js";
import { RepoFetchCoordinator } from "./RepoFetchCoordinator.js";
import { waitForPathExists } from "../utils/fs.js";
import { formatErrorMessage } from "../../shared/utils/errorMessage.js";
import {
  probeGitLfsAvailable,
  isGitHubRemoteUrl,
  parseCheckedOutBranches,
  nextAvailableBranchName,
  ensureNoteFile,
} from "./worktreeUtils.js";
import { applyResourceConfigToMonitor } from "./resourceConfigHelpers.js";
import { ResourceActionExecutor } from "./ResourceActionExecutor.js";
import parcelWatcher from "@parcel/watcher";
import { MutableDisposable } from "../utils/lifecycle.js";

// Re-export so existing test imports (`probeGitLfsAvailable` from
// `../WorkspaceService.js`) continue to work without modification.
export { probeGitLfsAvailable } from "./worktreeUtils.js";

// Configuration
const DEFAULT_ACTIVE_WORKTREE_INTERVAL_MS = 2000;
const DEFAULT_BACKGROUND_WORKTREE_INTERVAL_MS = 10000;
const WORKTREE_REMOVE_LOCK_RETRY_DELAYS_MS = [250, 500, 1000, 2000, 3000, 5000, 8000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientWorktreeRemoveLockError(error: unknown): boolean {
  const err = error as NodeJS.ErrnoException;
  const code = err.code;
  if (code === "EPERM" || code === "EACCES" || code === "EBUSY") return true;

  const message = err.message ?? "";
  return /permission denied|eperm|eacces|ebusy|being used by another process|resource busy/i.test(
    message
  );
}

export class WorkspaceService {
  private monitors = new Map<string, WorktreeMonitor>();
  private pollQueue = new PQueue({ concurrency: 3 });
  private mainBranch: string = "main";
  private activeWorktreeId: string | null = null;
  private pollIntervalActive: number = DEFAULT_ACTIVE_WORKTREE_INTERVAL_MS;
  private pollIntervalBackground: number = DEFAULT_BACKGROUND_WORKTREE_INTERVAL_MS;
  private adaptiveBackoff: boolean = true;
  private pollIntervalMax: number = 30000;
  private circuitBreakerThreshold: number = 3;
  private gitWatchEnabled: boolean = true;
  private gitWatchDebounceMs: number = 300;
  private git: SimpleGit | null = null;
  private pollingEnabled: boolean = true;
  private projectRootPath: string | null = null;
  private projectEnvVars: Record<string, string> = {};
  private lifecycleService = new WorktreeLifecycleService();
  private listService = new WorktreeListService();
  private prService: PRIntegrationService;
  private fetchCoordinator: RepoFetchCoordinator;
  private _shutdownController = new AbortController();
  readonly resourceActionExecutor: ResourceActionExecutor;
  /** Session-scoped guard so we notify the user about Linux inotify limits
   *  only once, even if many worktrees hit ENOSPC concurrently. */
  private inotifyLimitNotified = false;
  /** Session-scoped guard so we notify the user about the macOS FSEvents file
   *  descriptor ceiling only once, even if many worktrees hit EMFILE concurrently. */
  private emfileLimitNotified = false;

  /** Per-worktree WSL git opt-in state forwarded from main on load and toggle. */
  private wslGitByWorktree: Record<string, { enabled: boolean; dismissed: boolean }> = {};
  /** Cached default WSL distro (populated lazily on first WSL-path detection). */
  private wslDefaultDistroPromise: Promise<string | null> | null = null;

  // Topology watcher — watches `.git/worktrees/` for external worktree
  // create/delete and triggers serialized reconciliation.
  private topologyWatcherSubscription = new MutableDisposable();
  private topologyReconcileQueue = new PQueue({ concurrency: 1 });
  private topologyReconcilePending = false;
  private topologyWatchSuppressUntil = 0;
  private topologyWatchCooldownUntil = 0;
  private topologyWatchCooldownDirty = false;
  private topologyDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private topologyWatcherEnabled = true;
  private topologyWatcherGeneration = 0;

  constructor(private readonly sendEvent: (event: WorkspaceHostEvent) => void) {
    this.fetchCoordinator = new RepoFetchCoordinator({
      onFetchSuccess: (worktreeId) => {
        const monitor = this.monitors.get(worktreeId);
        if (!monitor || !monitor.isRunning) return;
        // A successful fetch updated remote refs, so the next `rev-list` for
        // ahead/behind will return fresh counts. Trigger a status refresh
        // immediately rather than waiting for the next poll tick — but
        // fire-and-forget; fetch success must never block.
        monitor.triggerRefreshIfUpdating();
      },
    });
    this.prService = new PRIntegrationService(pullRequestService, events, {
      onPRDetected: (worktreeId, data) => {
        const monitor = this.monitors.get(worktreeId);
        if (!monitor) return;

        monitor.setPRInfo({
          prNumber: data.prNumber,
          prUrl: data.prUrl,
          prState: data.prState,
          prCiStatus: data.prCiStatus,
          prTitle: data.prTitle,
          issueTitle: data.issueTitle,
          prLastUpdatedAt: data.prLastUpdatedAt,
          issueLastUpdatedAt: data.issueLastUpdatedAt,
        });
        if (monitor.hasInitialStatus) {
          this.emitUpdate(monitor);
        }

        this.sendEvent({
          type: "pr-detected",
          worktreeId,
          prNumber: data.prNumber,
          prUrl: data.prUrl,
          prState: data.prState,
          prCiStatus: data.prCiStatus,
          prTitle: data.prTitle,
          issueNumber: data.issueNumber,
          issueTitle: data.issueTitle,
          prLastUpdatedAt: data.prLastUpdatedAt,
          issueLastUpdatedAt: data.issueLastUpdatedAt,
        });
      },
      onPRCleared: (worktreeId) => {
        const monitor = this.monitors.get(worktreeId);
        if (!monitor) return;

        monitor.clearPRInfo();
        if (monitor.hasInitialStatus) {
          this.emitUpdate(monitor);
        }

        this.sendEvent({
          type: "pr-cleared",
          worktreeId,
        });
      },
      onIssueDetected: (worktreeId, data) => {
        const monitor = this.monitors.get(worktreeId);
        if (!monitor) return;

        monitor.setIssueTitle(data.issueTitle);
        if (data.issueLastUpdatedAt !== undefined) {
          monitor.setIssueLastUpdatedAt(data.issueLastUpdatedAt);
        }
        if (monitor.hasInitialStatus) {
          this.emitUpdate(monitor);
        }

        this.sendEvent({
          type: "issue-detected",
          worktreeId,
          issueNumber: data.issueNumber,
          issueTitle: data.issueTitle,
          issueLastUpdatedAt: data.issueLastUpdatedAt,
        });
      },
      onIssueNotFound: (worktreeId, issueNumber) => {
        const monitor = this.monitors.get(worktreeId);
        if (!monitor) return;
        if (monitor.issueNumber !== issueNumber) return;

        monitor.setIssueNumber(undefined);
        monitor.setIssueTitle(undefined);
        if (monitor.hasInitialStatus) {
          this.emitUpdate(monitor);
        }

        this.sendEvent({
          type: "issue-not-found",
          worktreeId,
          issueNumber,
        });
      },
    });

    this.resourceActionExecutor = new ResourceActionExecutor({
      getProjectRootPath: () => this.projectRootPath,
      getMonitor: (id) => this.monitors.get(id),
      getProjectEnvVars: () => this.projectEnvVars,
      emitUpdate: (monitor) => this.emitUpdate(monitor),
      sendEvent: (event) => this.sendEvent(event),
      lifecycleService: this.lifecycleService,
    });
  }

  async loadProject(
    requestId: string,
    projectRootPath: string,
    globalEnvVars?: Record<string, string>,
    wslGitByWorktree?: Record<string, { enabled: boolean; dismissed: boolean }>
  ): Promise<void> {
    try {
      this.projectRootPath = projectRootPath;
      if (wslGitByWorktree && typeof wslGitByWorktree === "object") {
        // Merge instead of replacing: a `set-wsl-opt-in` message arriving
        // during this load-project's async work would otherwise be silently
        // overwritten. The most recent in-memory value wins on conflict.
        this.wslGitByWorktree = { ...wslGitByWorktree, ...this.wslGitByWorktree };
      }
      // Merge: global (lowest priority) < project-level < DAINTREE_* (set in buildEnv)
      const projectEnvVars = await this.loadProjectEnvVars(projectRootPath);
      this.projectEnvVars = { ...(globalEnvVars ?? {}), ...projectEnvVars };
      this.git = createHardenedGit(projectRootPath, this._shutdownController.signal);
      this.listService.setGit(this.git, projectRootPath);

      // #6669: prune at startup so externally-deleted worktrees (kept in
      // `worktree list --porcelain` as `prunable` since Git 2.31+) don't
      // re-appear in the sidebar after restart. Best-effort — a prune
      // failure must not block project load.
      try {
        await this.git.raw(["worktree", "prune"]);
      } catch (pruneError) {
        console.warn(
          `[WorkspaceHost] worktree prune at load failed for ${projectRootPath}: ${(pruneError as Error).message}`
        );
      }

      const rawWorktrees = await this.listService.list();
      const worktrees = this.listService.mapToWorktrees(rawWorktrees);

      // Run the LFS probe concurrently with monitor sync so we don't add its
      // 3s worst case on top of sync latency. The probe is a read-only CLI
      // check (no PATH side-effects); its result travels on the load-project
      // event so the renderer can warn proactively when a repo uses LFS.
      const [, lfsAvailable] = await Promise.all([
        this.syncMonitors(worktrees, this.activeWorktreeId, this.mainBranch, undefined, true),
        probeGitLfsAvailable(),
      ]);

      this.startTopologyWatcher();

      this.sendEvent({ type: "load-project-result", requestId, success: true, lfsAvailable });

      void Promise.allSettled([this.initializePRService(), this.refreshAll()]).then((results) => {
        const [prResult, refreshResult] = results;
        if (prResult?.status === "rejected") {
          console.warn("[WorkspaceHost] PR service initialization failed:", prResult.reason);
        }
        if (refreshResult?.status === "rejected") {
          console.warn("[WorkspaceHost] Initial worktree refresh failed:", refreshResult.reason);
        }
      });
    } catch (error) {
      this.sendEvent({
        type: "load-project-result",
        requestId,
        success: false,
        error: (error as Error).message,
      });
    }
  }

  async syncMonitors(
    worktrees: Worktree[],
    activeWorktreeId: string | null,
    mainBranch: string,
    monitorConfig?: MonitorConfig,
    skipInitialGitStatus: boolean = false
  ): Promise<void> {
    this.mainBranch = mainBranch;
    this.activeWorktreeId = activeWorktreeId;

    if (monitorConfig?.pollIntervalActive !== undefined) {
      this.pollIntervalActive = monitorConfig.pollIntervalActive;
    }
    if (monitorConfig?.pollIntervalBackground !== undefined) {
      this.pollIntervalBackground = monitorConfig.pollIntervalBackground;
    }
    if (monitorConfig?.adaptiveBackoff !== undefined) {
      this.adaptiveBackoff = monitorConfig.adaptiveBackoff;
    }
    if (monitorConfig?.pollIntervalMax !== undefined) {
      this.pollIntervalMax = monitorConfig.pollIntervalMax;
    }
    if (monitorConfig?.circuitBreakerThreshold !== undefined) {
      this.circuitBreakerThreshold = monitorConfig.circuitBreakerThreshold;
    }
    if (monitorConfig?.gitWatchEnabled !== undefined) {
      this.gitWatchEnabled = monitorConfig.gitWatchEnabled;
    }
    if (monitorConfig?.gitWatchDebounceMs !== undefined) {
      this.gitWatchDebounceMs = monitorConfig.gitWatchDebounceMs;
    }

    const currentIds = new Set(worktrees.map((wt) => wt.id));

    // Remove stale monitors
    for (const [id, monitor] of this.monitors) {
      if (!currentIds.has(id)) {
        if (monitor.isMainWorktree) {
          console.warn("[WorkspaceHost] Blocked removal of main worktree monitor");
          continue;
        }

        if (this.activeWorktreeId === id) {
          this.activeWorktreeId = null;
        }

        this.resourceActionExecutor.cleanupResourceActionState(id);
        monitor.stop();
        this.monitors.delete(id);
        clearGitDirCache(monitor.path);
        invalidateGitStatusCache(monitor.path);
        this.sendEvent({
          type: "worktree-removed",
          worktreeId: id,
        });
        events.emit("sys:worktree:remove", { worktreeId: id, timestamp: Date.now() });
      }
    }

    // Create or update monitors
    for (const wt of worktrees) {
      const existingMonitor = this.monitors.get(wt.id);
      const isActive = wt.id === activeWorktreeId;

      if (existingMonitor) {
        const branchChanged = existingMonitor.branch !== wt.branch;
        const isCurrentChanged = existingMonitor.isCurrent !== isActive;
        existingMonitor.branch = wt.branch;
        existingMonitor.name = wt.name;
        existingMonitor.isCurrent = isActive;
        existingMonitor.isMainWorktree = wt.isMainWorktree ?? false;

        const interval = isActive ? this.pollIntervalActive : this.pollIntervalBackground;
        existingMonitor.updateConfig({
          basePollingInterval: interval,
          adaptiveBackoff: this.adaptiveBackoff,
          pollIntervalMax: this.pollIntervalMax,
          circuitBreakerThreshold: this.circuitBreakerThreshold,
          gitWatchEnabled: this.gitWatchEnabled,
          gitWatchDebounceMs: this.gitWatchDebounceMs,
        });

        existingMonitor.ensureWatcherState();

        if (branchChanged && existingMonitor.hasWatcher) {
          existingMonitor.restartWatcherIfRunning();
        }

        if (isCurrentChanged && existingMonitor.hasInitialStatus) {
          this.emitUpdate(existingMonitor);
        }

        if (branchChanged && wt.branch) {
          const syncIssueNumber = extractIssueNumberSync(wt.branch, wt.name);
          if (syncIssueNumber) {
            existingMonitor.setIssueNumber(syncIssueNumber);
          } else {
            existingMonitor.setIssueNumber(undefined);
            void this.extractIssueNumberAsync(existingMonitor, wt.branch, wt.name);
          }
          existingMonitor.setIssueTitle(undefined);
          if (existingMonitor.hasInitialStatus) {
            this.emitUpdate(existingMonitor);
          }
        } else if (branchChanged && !wt.branch) {
          existingMonitor.setIssueNumber(undefined);
          existingMonitor.setIssueTitle(undefined);
          if (existingMonitor.hasInitialStatus) {
            this.emitUpdate(existingMonitor);
          }
        }
      } else {
        await this.addNewWorktreeMonitor(wt, isActive, skipInitialGitStatus);
      }
    }
  }

  /**
   * Create, configure, and register a monitor for a single worktree.
   *
   * Used by syncMonitors' new-monitor branch AND by createWorktree to install
   * a monitor for a freshly created worktree. Unlike syncMonitors, this does
   * NOT touch any other monitor — which matters for createWorktree, where
   * syncMonitors' remove-stale loop would drop every other non-main monitor
   * because the one-element array is interpreted as the authoritative set.
   *
   * If a monitor already exists for `wt.id`, this is a no-op (race safety for
   * overlapping create/delete on the same path).
   */
  /**
   * Detect whether a worktree is mounted via WSL and, if so, attach the
   * detection metadata + persisted opt-in state. No-op on non-Windows. Bind
   * time only — the result is folded into the `Worktree` passed to
   * `WorktreeMonitor`.
   */
  private async enrichWorktreeWithWsl(wt: Worktree): Promise<Worktree> {
    if (process.platform !== "win32") return wt;
    const detected = detectWslPath(wt.path);
    if (!detected) return wt;

    if (!this.wslDefaultDistroPromise) {
      this.wslDefaultDistroPromise = getDefaultWslDistro().catch(() => null);
    }
    const defaultDistro = await this.wslDefaultDistroPromise;
    // UNC paths are case-insensitive on Windows; `wsl --list --verbose` returns
    // the canonical case (e.g. "Ubuntu"). Normalize before comparing so a
    // worktree opened via `\\wsl$\ubuntu\...` still matches the default.
    const eligible =
      defaultDistro !== null && defaultDistro.toLowerCase() === detected.distro.toLowerCase();
    const persisted = this.wslGitByWorktree[wt.id];

    return {
      ...wt,
      isWslPath: true,
      wslDistro: detected.distro,
      wslGitEligible: eligible,
      wslGitOptIn: Boolean(persisted?.enabled),
      wslGitDismissed: Boolean(persisted?.dismissed),
    };
  }

  /**
   * Update WSL git routing state for a single worktree. Persists the new
   * preference into the in-memory map and forwards to the matching monitor
   * (which re-emits its snapshot). Called by the workspace-host message
   * handler in response to renderer-driven IPC.
   */
  setWslOptIn(worktreeId: string, enabled: boolean, dismissed: boolean): void {
    this.wslGitByWorktree[worktreeId] = { enabled, dismissed };
    const monitor = this.monitors.get(worktreeId);
    if (monitor) {
      monitor.setWslOptIn(enabled, dismissed);
    }
  }

  private async addNewWorktreeMonitor(
    wt: Worktree,
    isActive: boolean,
    skipInitialGitStatus: boolean
  ): Promise<void> {
    if (this.monitors.has(wt.id)) {
      return;
    }

    const enrichedWt = await this.enrichWorktreeWithWsl(wt);
    wt = enrichedWt;

    await ensureNoteFile(wt.path);
    const issueNumber = wt.branch ? extractIssueNumberSync(wt.branch, wt.name) : null;
    const interval = isActive ? this.pollIntervalActive : this.pollIntervalBackground;

    let createdAt: number | undefined;
    try {
      const stats = await stat(wt.path);
      createdAt = stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.ctimeMs;
    } catch {
      // If stat fails, leave undefined
    }

    const monitor = new WorktreeMonitor(
      { ...wt, isCurrent: isActive },
      {
        basePollingInterval: interval,
        adaptiveBackoff: this.adaptiveBackoff,
        pollIntervalMax: this.pollIntervalMax,
        circuitBreakerThreshold: this.circuitBreakerThreshold,
        gitWatchEnabled: this.gitWatchEnabled,
        gitWatchDebounceMs: this.gitWatchDebounceMs,
      },
      {
        onUpdate: (snapshot) => {
          this.handleMonitorUpdate(monitor, snapshot);
        },
        onRemoved: (worktreeId) => {
          this.handleExternalWorktreeRemoval(worktreeId);
        },
        onExternalRemoval: (worktreeId) => {
          this.handleExternalWorktreeRemoval(worktreeId);
        },
        onResourceStatusPoll: (worktreeId) => {
          return this.runResourceAction(
            `auto-status-${worktreeId}`,
            worktreeId,
            "status",
            undefined,
            { origin: "auto-poll" }
          );
        },
        onInotifyLimitReached: () => this.handleInotifyLimitReached(),
        onEmfileLimitReached: () => this.handleEmfileLimitReached(),
        onScheduleFetch: async (worktreeId, _isCurrent, force) => {
          const target = this.monitors.get(worktreeId);
          if (!target || !target.isRunning) return;
          const result = await this.fetchCoordinator.fetchForWorktree({
            worktreeId,
            worktreePath: target.path,
            force,
          });
          // Skipped for "no-common-dir" (e.g. path was just removed) means we
          // have no commondir to fan out on — bail.
          if (
            result.lastFetchedAt === undefined &&
            result.authFailed === undefined &&
            result.networkFailed === undefined
          ) {
            return;
          }
          this.applyFetchResultToSiblings(target, {
            lastFetchedAt: result.lastFetchedAt ?? null,
            authFailed: result.authFailed ?? false,
            networkFailed: result.networkFailed ?? false,
          });
        },
      },
      this.mainBranch,
      this.pollQueue
    );

    monitor.setIssueNumber(issueNumber ?? undefined);
    monitor.setCreatedAt(createdAt);

    this.monitors.set(wt.id, monitor);

    if (skipInitialGitStatus) {
      monitor.startWithoutGitStatus();
    } else {
      await monitor.start();
    }

    if (wt.branch && !issueNumber) {
      void this.extractIssueNumberAsync(monitor, wt.branch, wt.name);
    }

    void (async () => {
      await this.initResourceConfigAsync(monitor, wt.path);
      // Emit a secondary update if config was loaded and monitor is running.
      // This ensures the renderer receives the resource config metadata even when
      // initResourceConfigAsync completes after the initial snapshot was emitted.
      if (monitor.isRunning && monitor.hasResourceConfig) {
        this.emitUpdate(monitor);
      }
    })();

    // Resolve origin → github.com? once at monitor start. Setter re-emits the
    // snapshot only if the value differs from the initial `false`, so this is
    // a no-op for the (small) set of non-GitHub repos.
    void this.probeGitHubRemoteAsync(monitor);
  }

  private async initResourceConfigAsync(
    monitor: WorktreeMonitor,
    worktreePath: string
  ): Promise<void> {
    try {
      if (!this.projectRootPath) return;
      const config = await this.lifecycleService.loadConfig(worktreePath, this.projectRootPath);
      let resourceConfig = config?.resource;
      if (config?.resources) {
        const envKey = monitor.worktreeMode;
        if (envKey && config.resources[envKey]) {
          resourceConfig = config.resources[envKey];
        } else if (config.resources["default"]) {
          resourceConfig = config.resources["default"];
        } else {
          const keys = Object.keys(config.resources);
          if (keys.length > 0) resourceConfig = config.resources[keys[0]];
        }
      }
      if (!resourceConfig) {
        const envs = await this.lifecycleService.loadProjectResourceEnvironments(
          this.projectRootPath
        );
        if (envs) {
          const envKey = monitor.worktreeMode;
          if (envKey && envKey !== "local" && envs[envKey]) {
            resourceConfig = envs[envKey];
          } else {
            const keys = Object.keys(envs);
            if (keys.length > 0) resourceConfig = envs[keys[0]];
          }
        }
      }
      if (!resourceConfig) return;

      // Cache resource config metadata regardless of monitor.isRunning state.
      // This ensures the UI shows the Resource submenu even during cold start
      // before the monitor begins polling. Runtime behavior (emits, polling)
      // is still guarded by isRunning below.
      const vars = this.lifecycleService.buildVariables(
        worktreePath,
        this.projectRootPath,
        monitor.name,
        monitor.branch
      );
      const sub = (cmd: string) => this.lifecycleService.substituteVariables(cmd, vars);
      applyResourceConfigToMonitor(monitor, resourceConfig, sub);

      // Runtime behavior (emits, polling) requires monitor.isRunning
      if (!monitor.isRunning) return;

      if (monitor.hasInitialStatus) {
        this.emitUpdate(monitor);
      }
    } catch (error) {
      console.warn(
        "[WorkspaceHost] Resource config initialization failed (continuing without resources):",
        formatErrorMessage(error, "Resource config initialization failed")
      );
    }
  }

  private async extractIssueNumberAsync(
    monitor: WorktreeMonitor,
    branchName: string,
    folderName?: string
  ): Promise<void> {
    try {
      const issueNumber = await extractIssueNumber(branchName, folderName);
      if (issueNumber && monitor.isRunning && monitor.branch === branchName) {
        monitor.setIssueNumber(issueNumber);
        if (monitor.hasInitialStatus) {
          this.emitUpdate(monitor);
        }
      }
    } catch {
      // Silently ignore extraction errors
    }
  }

  private handleMonitorUpdate(monitor: WorktreeMonitor, _snapshot: WorktreeSnapshot): void {
    const snapshot = monitor.getSnapshot();
    this.sendEvent({
      type: "worktree-update",
      worktree: snapshot,
    });
    events.emit("sys:worktree:update", snapshot);
  }

  private emitUpdate(monitor: WorktreeMonitor): void {
    const snapshot = monitor.getSnapshot();
    this.sendEvent({
      type: "worktree-update",
      worktree: snapshot,
    });
    events.emit("sys:worktree:update", snapshot);
  }

  /**
   * Fan a coordinator-level fetch result out to every monitor sharing the same
   * `git common-dir`. Linked worktrees back the same `.git/objects`, so a
   * single `git fetch origin` updates upstream refs for all of them — and the
   * coordinator's per-commondir `lastSuccessfulFetch` and auth-failure state
   * apply uniformly. Without this fan-out, only the worktree that triggered
   * the fetch would surface "Last fetched X ago"; sibling cards would still
   * show stale (or absent) timestamps.
   *
   * `getGitCommonDir` is synchronous and cached, so the O(n) scan is cheap
   * after the first call per worktree.
   */
  private applyFetchResultToSiblings(
    triggering: WorktreeMonitor,
    result: { lastFetchedAt: number | null; authFailed: boolean; networkFailed: boolean }
  ): void {
    const triggeringCommonDir = getGitCommonDir(triggering.path, { logErrors: false });
    if (!triggeringCommonDir) {
      // Without a commondir we can't identify siblings. Apply to the
      // triggering monitor only — its own card still benefits.
      triggering.setFetchState(result.lastFetchedAt, result.authFailed, result.networkFailed);
      return;
    }
    for (const monitor of this.monitors.values()) {
      if (!monitor.isRunning) continue;
      const monitorCommonDir = getGitCommonDir(monitor.path, { logErrors: false });
      if (monitorCommonDir === triggeringCommonDir) {
        monitor.setFetchState(result.lastFetchedAt, result.authFailed, result.networkFailed);
      }
    }
  }

  /**
   * Probe origin's fetch URL once and tell the monitor whether it points at
   * github.com. Runs off the critical path — failures are silent (the
   * affordance simply stays hidden, which matches the non-GitHub behavior).
   */
  private async probeGitHubRemoteAsync(monitor: WorktreeMonitor): Promise<void> {
    try {
      const git = createHardenedGit(monitor.path);
      const remotes = await git.getRemotes(true);
      const origin = remotes.find((r) => r.name === "origin") ?? remotes[0];
      const fetchUrl = origin?.refs?.fetch;
      monitor.setIsGitHubRemote(isGitHubRemoteUrl(fetchUrl));
    } catch {
      // Remote probe is best-effort; keep the affordance hidden on failure.
    }
  }

  private handleInotifyLimitReached(): void {
    if (process.platform !== "linux") return;
    if (this.inotifyLimitNotified) return;
    this.inotifyLimitNotified = true;
    this.sendEvent({ type: "inotify-limit-reached" });
  }

  private handleEmfileLimitReached(): void {
    if (process.platform !== "darwin") return;
    if (this.emfileLimitNotified) return;
    this.emfileLimitNotified = true;
    this.sendEvent({ type: "emfile-limit-reached" });
  }

  private worktreeMetadataDirPath(): string | null {
    if (!this.projectRootPath) return null;
    const commonDir = getGitCommonDir(this.projectRootPath);
    if (!commonDir) return null;
    return `${commonDir}/worktrees`;
  }

  private startTopologyWatcher(): void {
    if (!this.topologyWatcherEnabled) return;
    if (this.topologyWatcherSubscription.value) return;

    const metadataDir = this.worktreeMetadataDirPath();
    if (!metadataDir) return;
    if (!existsSync(metadataDir)) return;

    const generation = ++this.topologyWatcherGeneration;
    const schedule = () => this.scheduleTopologyReconcile();

    parcelWatcher
      .subscribe(metadataDir, (_err, _events) => {
        if (this.topologyDebounceTimer) {
          clearTimeout(this.topologyDebounceTimer);
        }
        this.topologyDebounceTimer = setTimeout(schedule, 300);
      })
      .then((subscription) => {
        if (generation !== this.topologyWatcherGeneration) {
          // stopTopologyWatcher incremented the generation — discard.
          subscription.unsubscribe();
          return;
        }
        if (this.topologyWatcherSubscription.value) {
          subscription.unsubscribe();
          return;
        }
        this.topologyWatcherSubscription.value = {
          dispose: () => subscription.unsubscribe(),
        };
      })
      .catch((err) => {
        console.warn(
          `[WorkspaceHost] topology watcher subscribe failed for ${metadataDir}: ${(err as Error).message}`
        );
      });
  }

  private stopTopologyWatcher(): void {
    this.topologyWatcherGeneration++;
    this.topologyWatcherSubscription.value = undefined;
    if (this.topologyDebounceTimer) {
      clearTimeout(this.topologyDebounceTimer);
      this.topologyDebounceTimer = null;
    }
    this.topologyReconcilePending = false;
    this.topologyWatchCooldownDirty = false;
  }

  private scheduleTopologyReconcile(): void {
    if (!this.topologyWatcherEnabled) return;
    if (!this.pollingEnabled) return;
    if (Date.now() < this.topologyWatchSuppressUntil) return;
    if (Date.now() < this.topologyWatchCooldownUntil) {
      this.topologyWatchCooldownDirty = true;
      return;
    }
    if (this.topologyReconcilePending) {
      this.topologyWatchCooldownDirty = true;
      return;
    }

    this.topologyReconcilePending = true;
    this.topologyReconcileQueue.add(async () => {
      try {
        await this.runTopologyReconcile();
      } catch (err) {
        console.warn(`[WorkspaceHost] topology reconciliation failed: ${(err as Error).message}`);
      } finally {
        this.topologyReconcilePending = false;
        this.topologyWatchCooldownUntil = Date.now() + 2000;
        if (this.topologyWatchCooldownDirty) {
          this.topologyWatchCooldownDirty = false;
          const remaining = this.topologyWatchCooldownUntil - Date.now();
          setTimeout(() => this.scheduleTopologyReconcile(), Math.max(remaining, 0));
        }
      }
    });
  }

  private async runTopologyReconcile(): Promise<void> {
    const previousActiveId = this.activeWorktreeId;
    await this.discoverAndSyncWorktrees();

    // Auto-switch to main if the previously-active worktree was removed.
    // syncMonitors nulls activeWorktreeId when pruning the active monitor,
    // so we check: was there a previous active, is it gone from monitors,
    // and has the user NOT already switched to a *different* worktree.
    if (
      previousActiveId &&
      !this.monitors.has(previousActiveId) &&
      (this.activeWorktreeId === null || this.activeWorktreeId === previousActiveId)
    ) {
      let mainId: string | null = null;
      for (const [id, m] of this.monitors) {
        if (m.isMainWorktree) {
          mainId = id;
          break;
        }
      }
      if (mainId) {
        this.setActiveWorktree("topology-reconcile-auto-switch", mainId);
      }
    }
  }

  private handleExternalWorktreeRemoval(worktreeId: string): void {
    const monitor = this.monitors.get(worktreeId);
    if (!monitor) {
      return;
    }

    if (monitor.isMainWorktree) {
      console.warn("[WorkspaceHost] Blocked removal of main worktree monitor");
      monitor.setMood("error");
      monitor.setSummary("⚠️ Directory not accessible");
      this.emitUpdate(monitor);
      return;
    }

    if (!this.monitors.has(worktreeId)) {
      return;
    }

    if (this.activeWorktreeId === worktreeId) {
      this.activeWorktreeId = null;
    }

    this.resourceActionExecutor.cleanupResourceActionState(worktreeId);
    monitor.stop();
    this.monitors.delete(worktreeId);

    clearGitDirCache(monitor.path);
    invalidateGitStatusCache(monitor.path);
    const cacheKey = this.listService.getCacheKey();
    if (cacheKey) {
      this.listService.invalidateCache(cacheKey);
    }

    this.sendEvent({ type: "worktree-removed", worktreeId });
    events.emit("sys:worktree:remove", { worktreeId, timestamp: Date.now() });

    console.log(
      `[WorkspaceHost] Worktree deleted externally, removed monitor: ${monitor.name} (${worktreeId})`
    );
  }

  getAllStates(requestId: string): void {
    const states: WorktreeSnapshot[] = [];
    for (const monitor of this.monitors.values()) {
      states.push(monitor.getSnapshot());
    }
    this.sendEvent({ type: "all-states", requestId, states });
  }

  getSnapshotsSync(): WorktreeSnapshot[] {
    const states: WorktreeSnapshot[] = [];
    for (const monitor of this.monitors.values()) {
      states.push(monitor.getSnapshot());
    }
    return states;
  }

  getMonitor(requestId: string, worktreeId: string): void {
    const monitor = this.monitors.get(worktreeId);
    if (!monitor) {
      this.sendEvent({ type: "monitor", requestId, state: null });
      return;
    }

    this.sendEvent({
      type: "monitor",
      requestId,
      state: monitor.getSnapshot(),
    });
  }

  setActiveWorktree(requestId: string, worktreeId: string): void {
    this.activeWorktreeId = worktreeId;

    for (const [id, monitor] of this.monitors) {
      const isActive = id === worktreeId;
      const wasCurrent = monitor.isCurrent;
      const interval = isActive ? this.pollIntervalActive : this.pollIntervalBackground;

      monitor.updateConfig({ basePollingInterval: interval });
      monitor.isCurrent = isActive;

      if (wasCurrent !== isActive) {
        monitor.reschedulePolling();
      }

      if (isActive && monitor.isRunning) {
        monitor.triggerRefreshIfUpdating();
      }

      if (monitor.hasInitialStatus && wasCurrent !== isActive) {
        this.emitUpdate(monitor);
      }
    }

    this.sendEvent({ type: "set-active-result", requestId, success: true });
  }

  async refresh(requestId: string, worktreeId?: string): Promise<void> {
    try {
      if (worktreeId) {
        const monitor = this.monitors.get(worktreeId);
        if (monitor) {
          await monitor.refresh();
        }
      } else {
        await this.discoverAndSyncWorktrees();
        await this.refreshAll();
        await pullRequestService.refresh();
      }
      this.sendEvent({ type: "refresh-result", requestId, success: true });
    } catch (error) {
      this.sendEvent({
        type: "refresh-result",
        requestId,
        success: false,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Refresh the workspace after the OS wakes from sleep.
   *
   * Resets each monitor's adaptive polling strategy synchronously before
   * enqueuing a serialized refresh, so pre-sleep operation durations and
   * circuit-breaker counters don't poison the post-wake polling cadence.
   * The wake refresh runs through a dedicated `concurrency: 1` queue rather
   * than the shared `pollQueue` so we don't burst N concurrent `git status`
   * processes against shared `packed-refs` / `gc.pid` immediately on wake.
   */
  async refreshOnWake(requestId: string): Promise<void> {
    try {
      // Drop network/transient fetch failures so the post-wake fetch attempt
      // is allowed to run even if the network was down before sleep. Auth
      // suspensions stay sticky — they require explicit re-auth.
      this.fetchCoordinator.clearNetworkFailures();
      for (const monitor of this.monitors.values()) {
        monitor.resetPollingStrategy();
      }
      const wakeQueue = new PQueue({ concurrency: 1 });
      const promises = Array.from(this.monitors.values()).map((monitor) =>
        wakeQueue.add(async () => {
          try {
            await monitor.updateGitStatus(true);
          } finally {
            if (monitor.isRunning && this.pollingEnabled) {
              monitor.reschedulePolling();
            }
          }
        })
      );
      await Promise.all(promises);
      // Kick off background fetches across all worktrees so ahead/behind
      // counts catch up against the network state we just reconnected to.
      // Fire-and-forget — the fetch coordinator serializes per-repo and
      // failures don't block the wake refresh result.
      for (const monitor of this.monitors.values()) {
        if (monitor.isRunning) {
          void monitor.triggerFetchNow();
        }
      }
      await pullRequestService.refresh();
      this.sendEvent({ type: "refresh-result", requestId, success: true });
    } catch (error) {
      this.sendEvent({
        type: "refresh-result",
        requestId,
        success: false,
        error: (error as Error).message,
      });
    }
  }

  private async discoverAndSyncWorktrees(): Promise<void> {
    if (!this.git) {
      return;
    }

    // #6669: prune before listing so externally-deleted worktrees (which Git
    // 2.31+ keeps in `worktree list --porcelain` with a `prunable` marker)
    // are dropped from the list. Without this, `syncMonitors` re-creates a
    // monitor for the phantom path and the sidebar entry never clears.
    // `prune` skips locked worktrees, so this is safe to run on every refresh.
    // Best-effort: if prune fails (e.g. EPERM on .git/worktrees/), don't block
    // the rest of the refresh — that would recreate the original "refresh is a
    // no-op" symptom under a different trigger.
    try {
      await this.git.raw(["worktree", "prune"]);
    } catch (pruneError) {
      console.warn(
        `[WorkspaceHost] worktree prune during refresh failed: ${(pruneError as Error).message}`
      );
    }

    const rawWorktrees = await this.listService.list({ forceRefresh: true });
    const worktrees = this.listService.mapToWorktrees(rawWorktrees);

    await this.syncMonitors(worktrees, this.activeWorktreeId, this.mainBranch, undefined, true);
  }

  private async refreshAll(): Promise<void> {
    const promises = Array.from(this.monitors.values()).map((monitor) =>
      this.pollQueue.add(async () => {
        try {
          await monitor.updateGitStatus(true);
        } finally {
          if (monitor.isRunning && this.pollingEnabled) {
            monitor.reschedulePolling();
          }
        }
      })
    );
    await Promise.all(promises);
  }

  async createWorktree(
    requestId: string,
    rootPath: string,
    options: CreateWorktreeOptions
  ): Promise<void> {
    try {
      const git = createHardenedGit(rootPath);
      const { baseBranch, path } = options;
      let { newBranch } = options;
      let { fromRemote = false, useExistingBranch = false } = options;

      // Authoritative validation gate. Every caller (IPC, MCP, recipes,
      // worktree:create-for-task) reaches this method, so any branch-name or
      // parent-dir issue caught here surfaces a clear error instead of
      // bubbling up as a low-level git fatal. #7033. Also rejects argv-shaped
      // names (leading dash) and git-special characters before any git call.
      if (typeof newBranch !== "string" || newBranch.trim().length === 0) {
        throw new Error("Branch name cannot be empty");
      }
      const newBranchValidation = validateBranchName(newBranch);
      if (!newBranchValidation.valid) {
        throw new Error(
          `Invalid branch name '${newBranch}': ${newBranchValidation.error ?? "invalid"}`
        );
      }
      const baseBranchValidation = validateBranchName(baseBranch);
      if (!baseBranchValidation.valid) {
        throw new Error(
          `Invalid base branch '${baseBranch}': ${baseBranchValidation.error ?? "invalid"}`
        );
      }
      // Resolve before taking dirname so a relative `path` (rare, but allowed
      // through programmatic callers) is checked against the right parent
      // rather than against process.cwd.
      const absoluteCreatePath = isAbsolute(path) ? path : pathResolve(rootPath, path);
      const parentDir = dirname(absoluteCreatePath);
      if (!existsSync(parentDir)) {
        await mkdir(parentDir, { recursive: true });
      }

      // #6463: when not explicitly reusing a branch, guard against a stale
      // local branch with the same name. Without this, `git worktree add -b`
      // hits "fatal: a branch named '...' already exists" whenever a previous
      // worktree was deleted but its branch was kept. Two recoveries:
      // (a) branch exists but is not checked out anywhere → reuse it (drop
      //     -b, switch to the useExistingBranch arg form);
      // (b) branch is live in another worktree → suffix -2/-3/... and create
      //     a fresh branch.
      // Inlined (not behind a helper) so the happy-path microtask timing
      // matches the pre-fix behavior — the next await is still the worktree
      // add, not a wrapper-promise resolution.
      if (!useExistingBranch) {
        let localBranches: string[] = [];
        try {
          localBranches = (await git.branchLocal()).all;
        } catch {
          // Best-effort: if branch listing fails, fall through and let the
          // actual worktree command surface its own error.
        }

        if (localBranches.includes(newBranch)) {
          let checkedOut = new Set<string>();
          let listFailed = false;
          try {
            const output = await git.raw(["worktree", "list", "--porcelain"]);
            checkedOut = parseCheckedOutBranches(output);
          } catch {
            // We can't tell if the branch is live elsewhere; fall through to
            // the suffix path rather than risk reusing a checked-out branch.
            listFailed = true;
          }

          // For fromRemote (PR mode) we never reuse a stale local branch:
          // the local ref is at the previous tip, and dropping --track would
          // strip @{u} that ahead/behind badges depend on. Suffix instead so
          // a fresh tracking branch is created.
          const canReuse = !listFailed && !fromRemote && !checkedOut.has(newBranch);

          if (canReuse) {
            useExistingBranch = true;
            // The -b path tracks baseBranch; reuse drops that. Stale local
            // branches typically retain their original config, so this is
            // the right tradeoff vs. failing the user-visible create.
            fromRemote = false;
          } else {
            newBranch = nextAvailableBranchName(newBranch, new Set(localBranches));
          }
        }
      }

      // `--end-of-options` after the subcommand flags so any leading-dash ref
      // or path that slipped past validation is treated as positional.

      // Suppress the topology watcher during app-owned worktree creation so
      // the `.git/worktrees/<name>/` directory creation doesn't trigger a
      // redundant discoverAndSyncWorktrees pass.
      this.topologyWatchSuppressUntil = Date.now() + 60000;

      if (useExistingBranch) {
        await git.raw(["worktree", "add", "--end-of-options", path, newBranch]);
      } else if (fromRemote) {
        await git.raw([
          "worktree",
          "add",
          "-b",
          newBranch,
          "--track",
          "--end-of-options",
          path,
          baseBranch,
        ]);
      } else {
        // --no-track: local-base branches shouldn't auto-track a local ref even
        // when the user has branch.autoSetupMerge=always. Skipping tracking also
        // avoids a .git/config.lock acquisition, cutting contention under bulk
        // creation. PR-mode (fromRemote) keeps --track — ahead/behind badges
        // at WorktreeMonitor.ts:1092 depend on @{u} resolving.
        await git.raw([
          "worktree",
          "add",
          "-b",
          newBranch,
          "--no-track",
          "--end-of-options",
          path,
          baseBranch,
        ]);
      }

      const absolutePath = isAbsolute(path) ? path : pathResolve(rootPath, path);
      // 500ms is ample: git returns after the directory exists; the polling
      // loop gives 4-5 attempts (50/100/200/150ms) across the budget, which
      // covers APFS/NTFS/ext4 metadata flush latency without blocking the
      // critical path for seconds on transient filesystem stalls.
      await waitForPathExists(absolutePath, {
        timeoutMs: 500,
        initialRetryDelayMs: 50,
        maxRetryDelayMs: 800,
      });

      // Build the Worktree object directly from known inputs instead of
      // shelling out to `git worktree list --porcelain` — the per-create list
      // was O(N²) across batches. Fields match WorktreeListService.mapToWorktrees
      // output for a freshly-created, attached, non-main worktree.
      const createdWorktree: Worktree = {
        id: absolutePath,
        path: absolutePath,
        name: newBranch,
        branch: newBranch,
        head: undefined,
        isDetached: false,
        isCurrent: false,
        isMainWorktree: false,
        gitDir: getGitDir(absolutePath) || undefined,
      };
      const canonicalWorktreeId = createdWorktree.id;
      const isActive = canonicalWorktreeId === this.activeWorktreeId;

      // Register the monitor SYNCHRONOUSLY before emitting the success event.
      // Two invariants depend on this ordering:
      //   1. Any caller that queries this.monitors.get(worktreeId) immediately
      //      after receiving create-worktree-result finds a live monitor.
      //   2. startWithoutGitStatus (inside addNewWorktreeMonitor) emits the
      //      initial clean-state worktree-update, which is the signal the
      //      renderer's store uses to add the worktree to its list. Without
      //      this emission the worktree stays invisible in the UI until the
      //      next poll or watcher fire.
      // We bypass syncMonitors here because syncMonitors treats its array as
      // authoritative and would remove every other non-main monitor.
      await this.addNewWorktreeMonitor(createdWorktree, isActive, true);

      // Reset suppression: the monitor is registered, metadata writes will
      // settle within 500ms. The short post-op window absorbs any remaining
      // filesystem events from the git worktree add.
      this.topologyWatchSuppressUntil = Date.now() + 500;

      if (options.worktreeMode && options.worktreeMode !== "local") {
        const m = this.monitors.get(canonicalWorktreeId);
        if (m) {
          m.setWorktreeMode(options.worktreeMode);
          m.setWorktreeEnvironmentLabel(options.worktreeMode);
          // Re-emit so the UI picks up the mode on the same snapshot cycle
          // rather than waiting for the first real poll.
          m.emitUpdate();
        }
      }

      this.sendEvent({
        type: "create-worktree-result",
        requestId,
        success: true,
        worktreeId: canonicalWorktreeId,
      });

      // Fire-and-forget tail: cache invalidation, .daintree copy, and
      // lifecycle setup are non-blocking for callers of create-worktree-result.
      // Tail failures are logged but never re-emit a result event.
      void (async () => {
        // Invalidate first so any racing list() call after this emission
        // doesn't return a stale cached snapshot that excludes the new worktree.
        this.listService.invalidateCache(pathResolve(rootPath));

        await this.lifecycleService.copyDaintreeDir(rootPath, absolutePath);

        void this.runLifecycleSetup(
          canonicalWorktreeId,
          absolutePath,
          rootPath,
          options.provisionResource ?? options.worktreeMode === "remote-worker"
        );
      })().catch((err) => {
        console.warn("[WorkspaceHost] createWorktree async tail failed:", err);
      });
    } catch (error) {
      this.topologyWatchSuppressUntil = Date.now() + 500;
      this.sendEvent({
        type: "create-worktree-result",
        requestId,
        success: false,
        error: (error as Error).message,
      });
    }
  }

  private getLifecycleContext(): WorkspaceHostContext | null {
    if (!this.projectRootPath) return null;
    return {
      projectRootPath: this.projectRootPath,
      projectEnvVars: this.projectEnvVars,
      getMonitor: (id) => this.monitors.get(id),
      emitUpdate: (m) => this.emitUpdate(m),
    };
  }

  private async runLifecycleSetup(
    worktreeId: string,
    worktreePath: string,
    projectRootPath: string,
    provisionResource?: boolean,
    environmentId?: string
  ): Promise<void> {
    const ctx: WorkspaceHostContext = this.getLifecycleContext() ?? {
      projectRootPath,
      projectEnvVars: this.projectEnvVars,
      getMonitor: (id) => this.monitors.get(id),
      emitUpdate: (m) => this.emitUpdate(m),
    };

    const { shouldProvision } = await this.lifecycleService.runLifecycleSetup(
      worktreeId,
      worktreePath,
      ctx,
      provisionResource,
      environmentId
    );

    if (shouldProvision && this.projectRootPath) {
      await this.runResourceAction(`auto-provision-${worktreeId}`, worktreeId, "provision");
    }
  }

  private async runLifecycleTeardown(
    worktreeId: string,
    monitor: WorktreeMonitor,
    force: boolean
  ): Promise<void> {
    const ctx = this.getLifecycleContext();
    if (!ctx) {
      return;
    }
    await this.lifecycleService.runLifecycleTeardown(worktreeId, monitor, force, ctx);
  }

  async deleteWorktree(
    requestId: string,
    worktreeId: string,
    force: boolean = false,
    deleteBranch: boolean = false
  ): Promise<void> {
    try {
      const monitor = this.monitors.get(worktreeId);
      if (!monitor) {
        throw new Error(`Worktree not found: ${worktreeId}`);
      }

      if (monitor.isMainWorktree) {
        throw new Error("Cannot delete the main worktree");
      }

      const wtChanges = monitor.getWorktreeChanges();
      if (!force && (wtChanges?.changedFileCount ?? 0) > 0) {
        const fileChanges = wtChanges?.changes ?? [];
        const hasTracked = fileChanges.some(
          (c) => c.status !== "untracked" && c.status !== "ignored"
        );
        const hasUntracked = fileChanges.some((c) => c.status === "untracked");
        const description =
          hasTracked && hasUntracked
            ? "uncommitted changes and untracked files"
            : hasTracked
              ? "uncommitted changes"
              : "untracked files";
        throw new Error(`Worktree has ${description}. Use force delete to proceed.`);
      }

      const branchToDelete = deleteBranch ? monitor.branch : undefined;

      if (deleteBranch && !monitor.branch) {
        throw new Error("Cannot delete branch: worktree has no associated branch (detached HEAD)");
      }

      if (monitor.isCurrent) {
        let mainWorktreeId: string | undefined;
        for (const [id, m] of this.monitors) {
          if (m.isMainWorktree) {
            mainWorktreeId = id;
            break;
          }
        }
        if (!mainWorktreeId) {
          throw new Error("Cannot delete active worktree: no main worktree found to switch to");
        }
        this.setActiveWorktree(`${requestId}-auto-switch`, mainWorktreeId);
      }

      await this.runLifecycleTeardown(worktreeId, monitor, force);

      // Suppress the topology watcher during app-owned worktree deletion so
      // the `.git/worktrees/<name>/` directory removal doesn't trigger a
      // redundant discoverAndSyncWorktrees pass.
      this.topologyWatchSuppressUntil = Date.now() + 60000;

      if (this.git) {
        // #6669: if the directory is already gone (deleted externally), skip
        // `git worktree remove` (which fails with `is not a working tree`)
        // and run `git worktree prune` instead to clean up the leftover
        // metadata. This is the only UI recovery path for a phantom entry.
        // Only ENOENT routes to prune — other access errors (EPERM, EACCES,
        // ENOTDIR) fall through so we don't skip the remove on transient
        // permission issues; the remove call's own errors will surface.
        let pathMissing = false;
        try {
          await access(monitor.path);
        } catch (accessError) {
          if ((accessError as NodeJS.ErrnoException).code === "ENOENT") {
            pathMissing = true;
          }
        }

        if (pathMissing) {
          try {
            await this.git.raw(["worktree", "prune"]);
          } catch (pruneError) {
            // Best-effort: the directory is already gone, so failing to clean
            // up the metadata shouldn't block the UI from removing the entry.
            console.warn(
              `[WorkspaceHost] worktree prune failed for missing path ${monitor.path}: ${(pruneError as Error).message}`
            );
          }
        } else {
          const args = ["worktree", "remove"];
          if (force) {
            args.push("--force");
          }
          // `--end-of-options` so a leading-dash worktree path is treated as
          // positional rather than parsed as a flag.
          args.push("--end-of-options", monitor.path);
          const removeResult = await this.removeGitWorktreeWithRetry(this.git, args, monitor.path);
          if (removeResult === "stale") {
            try {
              await this.git.raw(["worktree", "prune"]);
            } catch (pruneError) {
              console.warn(
                `[WorkspaceHost] worktree prune failed after stale remove for ${monitor.path}: ${(pruneError as Error).message}`
              );
            }
          }
        }

        clearGitDirCache(monitor.path);

        const cacheKey = this.listService.getCacheKey();
        if (cacheKey) {
          this.listService.invalidateCache(cacheKey);
        }
      }

      // Clean up the monitor immediately after worktree removal succeeds,
      // before attempting branch deletion — so the monitor doesn't linger
      // if branch deletion fails.
      this.resourceActionExecutor.cleanupResourceActionState(worktreeId);
      monitor.stop();
      this.monitors.delete(worktreeId);

      // Reset suppression: monitor is cleaned up, metadata writes will settle
      // within 500ms.
      this.topologyWatchSuppressUntil = Date.now() + 500;

      this.sendEvent({
        type: "worktree-removed",
        worktreeId,
      });

      if (branchToDelete && this.git) {
        try {
          await this.git.raw(["branch", force ? "-D" : "-d", branchToDelete]);
          console.log(
            `[WorkspaceHost] Deleted branch: ${branchToDelete} (${force ? "force" : "safe"})`
          );
        } catch (branchError) {
          const errorMsg = (branchError as Error).message || "";
          if (errorMsg.includes("not found")) {
            console.log(`[WorkspaceHost] Branch already deleted: ${branchToDelete}`);
          } else if (errorMsg.includes("not fully merged")) {
            throw new Error(
              `Branch '${branchToDelete}' has unmerged changes. Enable force delete to remove it.`
            );
          } else if (errorMsg.includes("checked out at") || errorMsg.includes("Cannot delete")) {
            throw new Error(`Cannot delete branch '${branchToDelete}': ${errorMsg.split("\n")[0]}`);
          } else {
            throw new Error(`Failed to delete branch '${branchToDelete}': ${errorMsg}`);
          }
        }
      }

      this.sendEvent({ type: "delete-worktree-result", requestId, success: true });
    } catch (error) {
      this.topologyWatchSuppressUntil = Date.now() + 500;
      this.sendEvent({
        type: "delete-worktree-result",
        requestId,
        success: false,
        error: (error as Error).message,
      });
    }
  }

  private async removeGitWorktreeWithRetry(
    git: SimpleGit,
    args: string[],
    worktreePath: string
  ): Promise<"removed" | "stale"> {
    for (let attempt = 0; ; attempt++) {
      try {
        await git.raw(args);
        return "removed";
      } catch (removeError) {
        const message = (removeError as Error).message || "";
        if (message.includes("is not a working tree")) {
          return "stale";
        }

        const delayMs = WORKTREE_REMOVE_LOCK_RETRY_DELAYS_MS[attempt];
        if (delayMs !== undefined && isTransientWorktreeRemoveLockError(removeError)) {
          console.warn(
            `[WorkspaceHost] worktree remove hit a transient filesystem lock for ${worktreePath}; retrying in ${delayMs}ms`
          );
          await sleep(delayMs);
          continue;
        }

        throw removeError;
      }
    }
  }

  async listBranches(requestId: string, rootPath: string): Promise<void> {
    try {
      const git = createHardenedGit(rootPath);
      const summary: BranchSummary = await git.branch(["-a"]);
      const branches: BranchInfo[] = [];

      for (const [branchName, branchDetail] of Object.entries(summary.branches)) {
        if (
          branchName.includes("HEAD ->") ||
          branchName.endsWith("/HEAD") ||
          branchName.startsWith("(")
        ) {
          continue;
        }

        const isRemote = branchName.startsWith("remotes/");
        const displayName = isRemote ? branchName.replace("remotes/", "") : branchName;

        branches.push({
          name: displayName,
          current: branchDetail.current,
          commit: branchDetail.commit,
          remote: isRemote ? displayName.split("/")[0] : undefined,
        });
      }

      this.sendEvent({ type: "list-branches-result", requestId, branches });
    } catch (error) {
      this.sendEvent({
        type: "list-branches-result",
        requestId,
        branches: [],
        error: (error as Error).message,
      });
    }
  }

  async fetchPRBranch(
    requestId: string,
    rootPath: string,
    prNumber: number,
    headRefName: string
  ): Promise<void> {
    try {
      const git = createAuthenticatedGit(rootPath);
      await git.raw(["fetch", "origin", `pull/${prNumber}/head:${headRefName}`]);
      this.sendEvent({ type: "fetch-pr-branch-result", requestId, success: true });
    } catch (error) {
      const gitReason = classifyGitError(error);
      this.sendEvent({
        type: "fetch-pr-branch-result",
        requestId,
        success: false,
        error: (error as Error).message,
        gitReason,
        recoveryAction: getGitRecoveryAction(gitReason),
      });
    }
  }

  async getRecentBranches(requestId: string, rootPath: string): Promise<void> {
    try {
      const git = createHardenedGit(rootPath);
      const rawReflog = await git.raw(["reflog", "--format=%gs"]);

      if (!rawReflog?.trim()) {
        this.sendEvent({ type: "get-recent-branches-result", requestId, branches: [] });
        return;
      }

      const seen = new Set<string>();
      const branches: string[] = [];
      const checkoutRegex = /^checkout: moving from \S+ to (\S+)$/;

      for (const line of rawReflog.split("\n")) {
        const m = line.match(checkoutRegex);
        if (!m) continue;
        const name = m[1].trim();
        if (/^[0-9a-f]{40}$/i.test(name)) continue;
        if (!seen.has(name)) {
          seen.add(name);
          branches.push(name);
        }
      }

      this.sendEvent({ type: "get-recent-branches-result", requestId, branches });
    } catch {
      this.sendEvent({ type: "get-recent-branches-result", requestId, branches: [] });
    }
  }

  async getFileDiff(
    requestId: string,
    cwd: string,
    filePath: string,
    status: string
  ): Promise<void> {
    try {
      const { resolve, normalize, sep, isAbsolute } = await import("path");

      if (isAbsolute(filePath)) {
        throw new Error("Absolute paths are not allowed");
      }

      const normalizedPath = normalize(filePath);
      const pathSegments = normalizedPath.split(/[\\/]+/).filter(Boolean);
      if (pathSegments.includes("..") || normalizedPath.startsWith(sep)) {
        throw new Error("Path traversal detected");
      }

      // Git always uses forward slashes in diff output, even on Windows
      const gitPath = normalizedPath.replaceAll("\\", "/");

      const git = createHardenedGit(cwd);

      if (status === "untracked" || status === "added") {
        const { readFile } = await import("fs/promises");
        const absolutePath = resolve(cwd, normalizedPath);
        const buffer = await readFile(absolutePath);

        let isBinary = false;
        const checkLength = Math.min(buffer.length, 8192);
        for (let i = 0; i < checkLength; i++) {
          if (buffer[i] === 0) {
            isBinary = true;
            break;
          }
        }

        if (isBinary) {
          this.sendEvent({ type: "get-file-diff-result", requestId, diff: "BINARY_FILE" });
          return;
        }

        const content = buffer.toString("utf-8");
        const lines = content.split("\n");

        const diff = `diff --git a/${gitPath} b/${gitPath}
new file mode 100644
--- /dev/null
+++ b/${gitPath}
@@ -0,0 +1,${lines.length} @@
${lines.map((l) => "+" + l).join("\n")}`;

        this.sendEvent({ type: "get-file-diff-result", requestId, diff });
        return;
      }

      // `--no-textconv` blocks user-defined diff drivers that would otherwise
      // execute arbitrary binaries via `.gitattributes` textconv mappings.
      const diff = await git.diff([
        "HEAD",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--",
        normalizedPath,
      ]);

      if (diff.includes("Binary files")) {
        this.sendEvent({ type: "get-file-diff-result", requestId, diff: "BINARY_FILE" });
        return;
      }

      if (!diff.trim()) {
        this.sendEvent({ type: "get-file-diff-result", requestId, diff: "NO_CHANGES" });
        return;
      }

      this.sendEvent({ type: "get-file-diff-result", requestId, diff });
    } catch (error) {
      this.sendEvent({
        type: "get-file-diff-result",
        requestId,
        diff: "",
        error: (error as Error).message,
      });
    }
  }

  updateMonitorConfig(config: MonitorConfig): void {
    if (config.pollIntervalActive !== undefined) {
      this.pollIntervalActive = config.pollIntervalActive;
    }
    if (config.pollIntervalBackground !== undefined) {
      this.pollIntervalBackground = config.pollIntervalBackground;
    }
    if (config.adaptiveBackoff !== undefined) {
      this.adaptiveBackoff = config.adaptiveBackoff;
    }
    if (config.pollIntervalMax !== undefined) {
      this.pollIntervalMax = config.pollIntervalMax;
    }

    for (const [worktreeId, monitor] of this.monitors) {
      const isActive = worktreeId === this.activeWorktreeId;
      const baseInterval = isActive ? this.pollIntervalActive : this.pollIntervalBackground;
      monitor.updateConfig({ basePollingInterval: baseInterval });
    }
  }

  setPollingEnabled(enabled: boolean): void {
    if (this.pollingEnabled === enabled) return;

    this.pollingEnabled = enabled;

    if (!enabled) {
      this.stopTopologyWatcher();
      for (const monitor of this.monitors.values()) {
        monitor.pausePolling();
      }
    } else {
      for (const monitor of this.monitors.values()) {
        monitor.resumePolling();
      }
      this.startTopologyWatcher();
      this.scheduleTopologyReconcile();
    }
  }

  pause(): void {
    console.log("[WorkspaceService] Pausing (backgrounded)");
    this.setPollingEnabled(false);
    this.prService.pause();
    try {
      os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW);
    } catch {
      // Sandboxed environments may deny setpriority — non-fatal
    }
  }

  resume(): void {
    console.log("[WorkspaceService] Resuming (foregrounded)");
    try {
      os.setPriority(process.pid, os.constants.priority.PRIORITY_NORMAL);
    } catch {
      // Sandboxed environments may deny setpriority — non-fatal
    }
    this.setPollingEnabled(true);
    this.prService.resume();
  }

  getPRStatus(requestId: string): void {
    const prStatus = this.prService.getStatus();
    this.sendEvent({ type: "get-pr-status-result", requestId, status: prStatus });
  }

  resetPRState(requestId: string): void {
    this.prService.resetPRState(this.projectRootPath);
    this.sendEvent({ type: "reset-pr-state-result", requestId, success: true });
  }

  updateGitHubToken(token: string | null): void {
    this.prService.updateToken(token, this.projectRootPath);
    if (token) {
      // A new token may resolve previously-failing auth — drop suspensions so
      // the next scheduled fetch retries. Network/transient entries stay so we
      // don't immediately re-storm an offline remote.
      this.fetchCoordinator.clearAuthFailures();
      // Trigger an opportunistic fetch on every worktree so the user sees
      // refreshed counts shortly after sign-in / token rotation.
      for (const monitor of this.monitors.values()) {
        if (monitor.isRunning) {
          void monitor.triggerFetchNow();
        }
      }
    }
  }

  private initializePRService(): Promise<void> {
    if (!this.projectRootPath) {
      return Promise.resolve();
    }

    return this.prService.initialize(this.projectRootPath, () => {
      const candidates: Array<{
        worktreeId: string;
        branch?: string;
        issueNumber?: number;
        isMainWorktree?: boolean;
      }> = [];
      for (const monitor of this.monitors.values()) {
        candidates.push({
          worktreeId: monitor.id,
          branch: monitor.branch,
          issueNumber: monitor.issueNumber,
          isMainWorktree: monitor.isMainWorktree,
        });
      }
      return candidates;
    });
  }

  async onProjectSwitch(requestId: string): Promise<void> {
    this.stopTopologyWatcher();
    this.topologyReconcileQueue.clear();
    this.prService.cleanup();

    for (const id of this.monitors.keys()) {
      this.resourceActionExecutor.cleanupResourceActionState(id);
    }
    for (const monitor of this.monitors.values()) {
      monitor.stop();
    }
    this.monitors.clear();
    // Drop in-flight fetch chains and per-repo failure state — the next
    // project's monitors get a clean coordinator and stale completions are
    // discarded by the generation guard.
    this.fetchCoordinator.destroy();
    this.pollQueue.clear();

    this.activeWorktreeId = null;
    this.mainBranch = "main";
    this.git = null;
    this.projectRootPath = null;
    this.projectEnvVars = {};
    this.wslDefaultDistroPromise = null;

    clearGitDirCache();
    clearGitCommonDirCache();
    this.listService.invalidateCache();
    this.listService.setGit(null, null);

    this.sendEvent({ type: "project-switch-result", requestId, success: true });
  }

  async switchWorktreeEnvironment(
    requestId: string,
    worktreeId: string,
    envKey: string
  ): Promise<void> {
    const monitor = this.monitors.get(worktreeId);
    if (!monitor) {
      this.sendEvent({
        type: "resource-action-result",
        requestId,
        success: false,
        error: "Worktree not found",
      });
      return;
    }

    monitor.setWorktreeMode(envKey);
    monitor.setWorktreeEnvironmentLabel(envKey);

    try {
      if (this.projectRootPath) {
        await this.runLifecycleSetup(worktreeId, monitor.path, this.projectRootPath, false, envKey);
      }
    } catch (err) {
      console.warn(
        `[WorkspaceService] switchWorktreeEnvironment config resolution failed (non-fatal):`,
        err
      );
    }

    this.emitUpdate(monitor);
    this.sendEvent({
      type: "resource-action-result",
      requestId,
      success: true,
    });
  }

  async runResourceAction(
    requestId: string,
    worktreeId: string,
    action: "provision" | "teardown" | "resume" | "pause" | "status",
    environmentId?: string,
    options?: { origin?: "auto-poll" }
  ): Promise<{ success: boolean; error?: string; output?: string }> {
    return this.resourceActionExecutor.runResourceAction(
      requestId,
      worktreeId,
      action,
      environmentId,
      options
    );
  }

  async hasResourceConfig(rootPath: string): Promise<boolean> {
    if (!this.projectRootPath) {
      return false;
    }
    const config = await this.lifecycleService.loadConfig(rootPath, this.projectRootPath);
    if (config?.resource || config?.resources) return true;
    const envs = await this.lifecycleService.loadProjectResourceEnvironments(this.projectRootPath);
    return envs !== null && Object.keys(envs).length > 0;
  }

  private async loadProjectEnvVars(projectRootPath: string): Promise<Record<string, string>> {
    try {
      const userDataDir = process.env.DAINTREE_USER_DATA ?? "";
      const projectId = generateProjectId(projectRootPath);
      const filePath = settingsFilePath(userDataDir, projectId);
      if (!filePath) return {};
      const raw = await readFile(filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const envVars = (parsed as Record<string, unknown>).environmentVariables;
      if (!envVars || typeof envVars !== "object" || Array.isArray(envVars)) return {};
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(envVars as Record<string, unknown>)) {
        if (typeof k === "string" && typeof v === "string") {
          result[k] = v;
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  dispose(): void {
    this._shutdownController.abort();
    this.stopTopologyWatcher();
    this.topologyReconcileQueue.clear();
    this.prService.cleanup();
    this.resourceActionExecutor.dispose();
    for (const monitor of this.monitors.values()) {
      monitor.stop();
    }
    this.monitors.clear();
    this.fetchCoordinator.destroy();
    this.pollQueue.clear();
    this.listService.invalidateCache();
  }
}
