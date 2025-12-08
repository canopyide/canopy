import type { Worktree, WorktreeChanges } from "../types/index.js";
import { invalidateGitStatusCache } from "../utils/git.js";
import { WorktreeRemovedError } from "../utils/errorTypes.js";
import { categorizeWorktree } from "../utils/worktreeMood.js";
import { logWarn, logError, logInfo, logDebug } from "../utils/logger.js";
import { events } from "./events.js";
import { extractIssueNumberSync, extractIssueNumber } from "./issueExtractor.js";
import type { GitService } from "./GitService.js";
import type { WorktreeService } from "./WorktreeService.js";
import { AdaptivePollingStrategy, NoteFileReader } from "./worktree/index.js";

const VERBOSE_WORKTREE_LOGS = process.env.CANOPY_DEBUG_WORKTREE === "1";

export interface WorktreeState extends Worktree {
  worktreeId: string;
  worktreeChanges: WorktreeChanges | null;
  lastActivityTimestamp: number | null;
  timestamp?: number;
}

export class WorktreeMonitor {
  public readonly id: string;
  public readonly path: string;
  private name: string;
  private branch: string | undefined;
  public readonly isCurrent: boolean;

  private state: WorktreeState;
  private mainBranch: string;
  private gitService: GitService;
  private worktreeService: WorktreeService | null = null;

  private previousStateHash: string = "";

  private pollingTimer: NodeJS.Timeout | null = null;
  private resumeTimer: NodeJS.Timeout | null = null;
  private pollingInterval: number = 2000;

  private isRunning: boolean = false;
  private isUpdating: boolean = false;
  private pollingEnabled: boolean = false;

  private prEventUnsubscribers: (() => void)[] = [];

  private pollingStrategy: AdaptivePollingStrategy;
  private noteReader: NoteFileReader;

  constructor(
    worktree: Worktree,
    gitService: GitService,
    worktreeService: WorktreeService | null,
    mainBranch: string = "main"
  ) {
    this.id = worktree.id;
    this.path = worktree.path;
    this.name = worktree.name;
    this.branch = worktree.branch;
    this.isCurrent = worktree.isCurrent;
    this.mainBranch = mainBranch;
    this.gitService = gitService;
    this.worktreeService = worktreeService;

    this.pollingStrategy = new AdaptivePollingStrategy({
      baseInterval: this.pollingInterval,
    });

    this.noteReader = new NoteFileReader(worktree.path);

    const initialIssueNumber = worktree.branch
      ? extractIssueNumberSync(worktree.branch, worktree.name)
      : null;

    this.state = {
      id: worktree.id,
      path: worktree.path,
      name: worktree.name,
      branch: worktree.branch,
      isCurrent: worktree.isCurrent,
      isMainWorktree: Boolean(worktree.isMainWorktree),
      worktreeId: worktree.id,
      worktreeChanges: null,
      mood: "stable",
      summary: worktree.summary,
      modifiedCount: worktree.modifiedCount || 0,
      changes: worktree.changes,
      lastActivityTimestamp: null,
      issueNumber: initialIssueNumber ?? undefined,
    };

    if (worktree.branch && !initialIssueNumber) {
      void this.extractIssueNumberAsync(worktree.branch, worktree.name);
    }

    this.prEventUnsubscribers.push(
      events.on("sys:pr:detected", (data) => {
        if (data.worktreeId === this.id) {
          this.state.prNumber = data.prNumber;
          this.state.prUrl = data.prUrl;
          this.state.prState = data.prState;
          this.emitUpdate();
        }
      })
    );

    this.prEventUnsubscribers.push(
      events.on("sys:pr:cleared", (data) => {
        if (data.worktreeId === this.id) {
          this.state.prNumber = undefined;
          this.state.prUrl = undefined;
          this.state.prState = undefined;
          this.emitUpdate();
        }
      })
    );
  }

  private async extractIssueNumberAsync(branchName: string, folderName?: string): Promise<void> {
    try {
      const issueNumber = await extractIssueNumber(branchName, folderName);
      if (issueNumber && this.isRunning) {
        this.state.issueNumber = issueNumber;
        this.emitUpdate();
      }
    } catch (error) {
      if (VERBOSE_WORKTREE_LOGS) {
        logDebug("Failed to extract issue number from branch", {
          branch: branchName,
          folder: folderName,
          error: (error as Error).message,
        });
      }
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    logInfo("Starting WorktreeMonitor (polling)", { id: this.id, path: this.path });

    this.isRunning = true;
    this.pollingEnabled = true;

    await this.updateGitStatus(true);

    if (this.isRunning) {
      this.scheduleNextPoll();
    }
  }

  public async fetchInitialStatus(): Promise<void> {
    logInfo("Fetching initial status (no polling)", { id: this.id, path: this.path });

    this.isRunning = true;
    this.pollingEnabled = false;

    await this.updateGitStatus(true);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logInfo("Stopping WorktreeMonitor", { id: this.id });

    this.stopPolling();

    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }

    for (const unsubscribe of this.prEventUnsubscribers) {
      unsubscribe();
    }
    this.prEventUnsubscribers = [];
  }

  public getState(): WorktreeState {
    return { ...this.state };
  }

  public setPollingInterval(ms: number): void {
    if (this.pollingInterval === ms) {
      return;
    }

    this.pollingInterval = ms;
    this.pollingStrategy.setBaseInterval(ms);

    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
      this.scheduleNextPoll();
    }
  }

  public setNoteConfig(enabled: boolean, filename?: string): void {
    this.noteReader.setConfig(enabled, filename);
  }

  public setAdaptiveBackoffConfig(
    enabled: boolean,
    maxInterval?: number,
    threshold?: number
  ): void {
    this.pollingStrategy.updateConfig(enabled, maxInterval, threshold);
  }

  public isCircuitBreakerTripped(): boolean {
    return this.pollingStrategy.isCircuitBreakerTripped();
  }

  public getAdaptiveBackoffMetrics(): {
    lastOperationDuration: number;
    consecutiveFailures: number;
    circuitBreakerTripped: boolean;
    currentInterval: number;
  } {
    return this.pollingStrategy.getMetrics();
  }

  public updateMetadata(worktree: Worktree): void {
    const branchChanged = this.state.branch !== worktree.branch;
    const nameChanged = this.state.name !== worktree.name;

    if (branchChanged || nameChanged) {
      const oldBranch = this.state.branch;
      const oldName = this.state.name;

      this.state.branch = worktree.branch;
      this.state.name = worktree.name;
      this.branch = worktree.branch;
      this.name = worktree.name;
      logInfo("WorktreeMonitor metadata updated", {
        id: this.id,
        oldBranch,
        newBranch: worktree.branch,
        oldName,
        newName: worktree.name,
      });

      if (branchChanged && worktree.branch) {
        const syncIssueNumber = extractIssueNumberSync(worktree.branch, worktree.name);
        this.state.issueNumber = syncIssueNumber ?? undefined;

        if (!syncIssueNumber) {
          void this.extractIssueNumberAsync(worktree.branch, worktree.name);
        }
      } else if (branchChanged && !worktree.branch) {
        this.state.issueNumber = undefined;
      }

      this.emitUpdate();
    }
  }

  public async refresh(): Promise<void> {
    if (this.pollingStrategy.isCircuitBreakerTripped()) {
      this.resetCircuitBreaker();
    }

    await this.updateGitStatus(true);
  }

  private calculateStateHash(changes: WorktreeChanges): string {
    const hashInput = changes.changes
      .map((c) => `${c.path}:${c.status}:${c.insertions ?? 0}:${c.deletions ?? 0}`)
      .sort()
      .join("|");
    return hashInput;
  }

  private async updateGitStatus(forceRefresh: boolean = false): Promise<void> {
    if (this.isUpdating) {
      return;
    }

    this.isUpdating = true;

    try {
      if (forceRefresh) {
        invalidateGitStatusCache(this.path);
      }

      const newChanges = await this.gitService.getWorktreeChangesWithStats(this.path, forceRefresh);

      if (!this.isRunning) {
        return;
      }

      const noteData = await this.noteReader.read();
      const currentHash = this.calculateStateHash(newChanges);
      const stateChanged = currentHash !== this.previousStateHash;
      const noteChanged =
        noteData?.content !== this.state.aiNote ||
        noteData?.timestamp !== this.state.aiNoteTimestamp;

      if (!stateChanged && !noteChanged && !forceRefresh) {
        return;
      }

      const prevChanges = this.state.worktreeChanges;
      const isInitialLoad = this.previousStateHash === "";
      const isNowClean = newChanges.changedFileCount === 0;

      let nextSummary = this.state.summary;
      let nextLastActivityTimestamp = this.state.lastActivityTimestamp;

      const hasPendingChanges = newChanges.changedFileCount > 0;
      const shouldUpdateTimestamp =
        (stateChanged && !isInitialLoad) || (isInitialLoad && hasPendingChanges);

      if (shouldUpdateTimestamp) {
        nextLastActivityTimestamp = Date.now();
      }

      // Use last commit message as summary
      if (isNowClean || isInitialLoad || (prevChanges && prevChanges.changedFileCount === 0)) {
        nextSummary = await this.fetchLastCommitMessage();
      }

      let nextMood = this.state.mood;
      try {
        nextMood = await categorizeWorktree(
          {
            id: this.id,
            path: this.path,
            name: this.name,
            branch: this.branch,
            isCurrent: this.isCurrent,
          },
          newChanges || undefined,
          this.mainBranch
        );
      } catch (error) {
        logWarn("Failed to categorize worktree mood", {
          id: this.id,
          message: (error as Error).message,
        });
        nextMood = "error";
      }

      const nextAiNote = noteData?.content;
      const nextAiNoteTimestamp = noteData?.timestamp;

      this.previousStateHash = currentHash;
      this.state = {
        ...this.state,
        worktreeChanges: newChanges,
        changes: newChanges.changes,
        modifiedCount: newChanges.changedFileCount,
        summary: nextSummary,
        lastActivityTimestamp: nextLastActivityTimestamp,
        mood: nextMood,
        aiNote: nextAiNote,
        aiNoteTimestamp: nextAiNoteTimestamp,
      };

      this.emitUpdate();
    } catch (error) {
      if (error instanceof WorktreeRemovedError) {
        logWarn("Worktree directory not accessible (transient or deleted)", {
          id: this.id,
          path: this.path,
        });

        this.state = {
          ...this.state,
          mood: "error",
          summary: "⚠️ Directory not accessible",
        };

        this.emitUpdate();
        return;
      }

      const errorMessage = (error as Error).message || "";
      if (errorMessage.includes("index.lock")) {
        logWarn("Git index locked, skipping this poll cycle", { id: this.id });
        return;
      }

      logError("Failed to update git status", error as Error, { id: this.id });
      this.state.mood = "error";
      this.emitUpdate();

      throw error;
    } finally {
      this.isUpdating = false;
    }
  }

  private async fetchLastCommitMessage(): Promise<string> {
    if (this.state.worktreeChanges?.lastCommitMessage) {
      const firstLine = this.state.worktreeChanges.lastCommitMessage.split("\n")[0].trim();
      return `✅ ${firstLine}`;
    }

    try {
      const lastCommitMsg = await this.gitService.getLastCommitMessage(this.path);

      if (lastCommitMsg) {
        const firstLine = lastCommitMsg.split("\n")[0].trim();
        return `✅ ${firstLine}`;
      }
      return "🌱 Ready to get started";
    } catch (error) {
      logError("Failed to fetch last commit message", error as Error, { id: this.id });
      return "🌱 Ready to get started";
    }
  }

  private scheduleNextPoll(): void {
    if (!this.isRunning || !this.pollingEnabled || this.pollingStrategy.isCircuitBreakerTripped()) {
      return;
    }

    if (this.pollingTimer) {
      return;
    }

    const nextInterval = this.pollingStrategy.calculateNextInterval();

    if (VERBOSE_WORKTREE_LOGS) {
      logDebug("Scheduling next poll", {
        id: this.id,
        nextInterval,
        ...this.pollingStrategy.getMetrics(),
      });
    }

    this.pollingTimer = setTimeout(() => {
      this.pollingTimer = null;
      void this.poll();
    }, nextInterval);
  }

  private async poll(): Promise<void> {
    if (!this.isRunning || this.pollingStrategy.isCircuitBreakerTripped()) {
      return;
    }

    const executePoll = async (): Promise<void> => {
      const startTime = Date.now();

      try {
        await this.updateGitStatus();
        this.pollingStrategy.recordSuccess(Date.now() - startTime);

        if (VERBOSE_WORKTREE_LOGS) {
          logDebug("Poll completed successfully", {
            id: this.id,
            duration: Date.now() - startTime,
          });
        }
      } catch (error) {
        const tripped = this.pollingStrategy.recordFailure(Date.now() - startTime);

        logWarn("Poll failed", {
          id: this.id,
          ...this.pollingStrategy.getMetrics(),
          error: (error as Error).message,
        });

        if (tripped) {
          this.tripCircuitBreaker();
          return;
        }
      }
    };

    try {
      if (this.worktreeService) {
        await this.worktreeService.executePoll(this.id, executePoll);
      } else {
        await executePoll();
      }
    } catch (error) {
      logWarn("Queue execution failed", {
        id: this.id,
        error: (error as Error).message,
      });
    }

    if (this.isRunning && !this.pollingStrategy.isCircuitBreakerTripped()) {
      this.scheduleNextPoll();
    }
  }

  private tripCircuitBreaker(): void {
    const metrics = this.pollingStrategy.getMetrics();
    this.state.mood = "error";
    this.state.summary = `⚠️ Polling stopped after ${metrics.consecutiveFailures} consecutive failures`;

    logWarn("Circuit breaker tripped", {
      id: this.id,
      consecutiveFailures: metrics.consecutiveFailures,
    });

    this.emitUpdate();
  }

  public resetCircuitBreaker(): void {
    if (!this.pollingStrategy.isCircuitBreakerTripped()) {
      return;
    }

    logInfo("Resetting circuit breaker", { id: this.id });

    this.pollingStrategy.reset();

    if (this.isRunning && this.pollingEnabled) {
      this.scheduleNextPoll();
    }
  }

  /** Pause polling (used during system sleep) */
  public pause(): void {
    if (!this.pollingEnabled) return;
    this.pollingEnabled = false;
    this.stopPolling();
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
    if (VERBOSE_WORKTREE_LOGS) {
      logDebug("WorktreeMonitor paused", { id: this.id });
    }
  }

  /** Resume polling (used after system wake) */
  public resume(): void {
    if (this.pollingEnabled) return;

    // Reset polling strategy to clear stale metrics from before sleep
    // After sleep, lastOperationDuration may show absurd values from time drift
    this.pollingStrategy.reset();

    this.pollingEnabled = true;

    if (this.isRunning && !this.pollingStrategy.isCircuitBreakerTripped()) {
      // Add random jitter (0-2000ms) to prevent thundering herd
      // All worktrees waking at once can freeze the UI with disk I/O
      const jitter = Math.random() * 2000;

      if (VERBOSE_WORKTREE_LOGS) {
        logDebug("WorktreeMonitor resuming with jitter", {
          id: this.id,
          jitterMs: Math.round(jitter),
        });
      }

      this.resumeTimer = setTimeout(() => {
        this.resumeTimer = null;
        // Verify still running (user might have stopped during jitter)
        if (this.isRunning && this.pollingEnabled) {
          this.scheduleNextPoll();
        }
      }, jitter);
    } else if (VERBOSE_WORKTREE_LOGS) {
      logDebug("WorktreeMonitor resumed", { id: this.id });
    }
  }

  private stopPolling(): void {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private emitUpdate(): void {
    const state = this.getState();
    const payload = { ...state, timestamp: Date.now() };
    if (VERBOSE_WORKTREE_LOGS) {
      logDebug("emitUpdate called", {
        id: this.id,
        summary: state.summary ? `${state.summary.substring(0, 50)}...` : undefined,
        modifiedCount: state.modifiedCount,
        mood: state.mood,
        stack: new Error().stack?.split("\n").slice(2, 5).join(" <-\\n"),
      });
    }
    events.emit("sys:worktree:update", payload);
  }
}
