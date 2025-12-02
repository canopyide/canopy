import { createHash } from "crypto";
import { readFile, stat } from "fs/promises";
import { join as pathJoin } from "path";
import { execSync } from "child_process";
import type { Worktree, WorktreeChanges, AISummaryStatus } from "../types/index.js";
import { DEFAULT_CONFIG } from "../types/config.js";
import { invalidateGitStatusCache } from "../utils/git.js";
import { WorktreeRemovedError } from "../utils/errorTypes.js";
import { generateWorktreeSummary } from "./ai/worktree.js";
import { getAIClient } from "./ai/client.js";
import { categorizeWorktree } from "../utils/worktreeMood.js";
import { logWarn, logError, logInfo, logDebug } from "../utils/logger.js";
import { events } from "./events.js";
import { extractIssueNumberSync, extractIssueNumber } from "./ai/issueExtractor.js";
import type { GitService } from "./GitService.js";

// Default AI debounce
const DEFAULT_AI_DEBOUNCE_MS = DEFAULT_CONFIG.ai?.summaryDebounceMs ?? 10000;

/** Monitors single worktree (git status, AI summary, mood) and emits updates via event bus */
export interface WorktreeState extends Worktree {
  worktreeId: string;
  // Full changes
  worktreeChanges: WorktreeChanges | null;
  // Activity timestamp
  lastActivityTimestamp: number | null;
  // AI summary status (active, loading, disabled, error)
  aiStatus: AISummaryStatus;
  // Agent note content
  aiNote?: string;
  // Timestamp when note file was last modified
  aiNoteTimestamp?: number;
  timestamp?: number;
}

/** Monitors single worktree (git status, AI summary, mood) and emits updates via event bus */
export class WorktreeMonitor {
  public readonly id: string;
  public readonly path: string;
  private name: string;
  private branch: string | undefined;
  public readonly isCurrent: boolean;

  private state: WorktreeState;
  private mainBranch: string;
  private gitService: GitService;

  // Hash-based change detection
  private previousStateHash: string = "";
  private lastSummarizedHash: string | null = null;

  // Timers
  private pollingTimer: NodeJS.Timeout | null = null;
  private aiUpdateTimer: NodeJS.Timeout | null = null;

  // Configuration
  private pollingInterval: number = 2000;
  private maxPollingInterval: number = DEFAULT_CONFIG.monitor?.pollIntervalMax ?? 30000;
  private adaptiveBackoff: boolean = DEFAULT_CONFIG.monitor?.adaptiveBackoff ?? true;
  private circuitBreakerThreshold: number = DEFAULT_CONFIG.monitor?.circuitBreakerThreshold ?? 3;
  private aiBufferDelay: number = DEFAULT_AI_DEBOUNCE_MS;
  private noteEnabled: boolean = DEFAULT_CONFIG.note?.enabled ?? true;
  private noteFilename: string = DEFAULT_CONFIG.note?.filename ?? "canopy/note";

  // Adaptive backoff state
  private lastOperationDuration: number = 0;
  private consecutiveFailures: number = 0;
  private circuitBreakerTripped: boolean = false;

  // Git directory cache
  private gitDir: string | null = null;

  // Flags
  private isRunning: boolean = false;
  private isUpdating: boolean = false;
  private isGeneratingSummary: boolean = false;
  private hasGeneratedInitialSummary: boolean = false;
  private pollingEnabled: boolean = false;
  private pendingAISummary: boolean = false;

  // PR event unsubscribe functions
  private prEventUnsubscribers: (() => void)[] = [];

  constructor(worktree: Worktree, gitService: GitService, mainBranch: string = "main") {
    this.id = worktree.id;
    this.path = worktree.path;
    this.name = worktree.name;
    this.branch = worktree.branch;
    this.isCurrent = worktree.isCurrent;
    this.mainBranch = mainBranch;
    this.gitService = gitService;

    const initialAIStatus: AISummaryStatus = getAIClient() ? "active" : "disabled";

    const initialIssueNumber = worktree.branch
      ? extractIssueNumberSync(worktree.branch, worktree.name)
      : null;

    this.state = {
      id: worktree.id,
      path: worktree.path,
      name: worktree.name,
      branch: worktree.branch,
      isCurrent: worktree.isCurrent,
      worktreeId: worktree.id,
      worktreeChanges: null,
      mood: "stable",
      summary: worktree.summary,
      summaryLoading: false,
      modifiedCount: worktree.modifiedCount || 0,
      changes: worktree.changes,
      lastActivityTimestamp: null,
      aiStatus: initialAIStatus,
      aiNote: undefined,
      aiNoteTimestamp: undefined,
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

  /** Extract issue number (async AI fallback) */
  private async extractIssueNumberAsync(branchName: string, folderName?: string): Promise<void> {
    try {
      const issueNumber = await extractIssueNumber(branchName, folderName);
      if (issueNumber && this.isRunning) {
        this.state.issueNumber = issueNumber;
        this.emitUpdate();
      }
    } catch (error) {
      logDebug("Failed to extract issue number from branch", {
        branch: branchName,
        folder: folderName,
        error: (error as Error).message,
      });
    }
  }

  /** Start monitoring (polling) */
  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    logInfo("Starting WorktreeMonitor (polling)", { id: this.id, path: this.path });

    this.isRunning = true;
    this.pollingEnabled = true;

    // 1. Initial fetch
    await this.updateGitStatus(true);

    // 2. Start polling loop
    if (this.isRunning) {
      this.scheduleNextPoll();
    }
  }

  /** Fetch initial status (no polling) */
  public async fetchInitialStatus(): Promise<void> {
    logInfo("Fetching initial status (no polling)", { id: this.id, path: this.path });

    this.isRunning = true;
    this.pollingEnabled = false;

    await this.updateGitStatus(true);
  }

  /** Stop monitoring and cleanup */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logInfo("Stopping WorktreeMonitor", { id: this.id });

    this.stopPolling();

    if (this.aiUpdateTimer) {
      clearTimeout(this.aiUpdateTimer);
      this.aiUpdateTimer = null;
    }

    for (const unsubscribe of this.prEventUnsubscribers) {
      unsubscribe();
    }
    this.prEventUnsubscribers = [];
  }

  /** Get current state */
  public getState(): WorktreeState {
    return { ...this.state };
  }

  /** Set polling interval */
  public setPollingInterval(ms: number): void {
    if (this.pollingInterval === ms) {
      return;
    }

    this.pollingInterval = ms;

    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
      this.scheduleNextPoll();
    }
  }

  /** Set AI summary debounce delay */
  public setAIBufferDelay(ms: number): void {
    if (this.aiBufferDelay === ms) {
      return;
    }

    this.aiBufferDelay = ms;

    if (this.aiUpdateTimer) {
      clearTimeout(this.aiUpdateTimer);
      this.aiUpdateTimer = null;
      this.scheduleAISummary();
    }
  }

  /** Configure AI note polling */
  public setNoteConfig(enabled: boolean, filename?: string): void {
    this.noteEnabled = enabled;
    if (filename !== undefined) {
      this.noteFilename = filename;
    }
  }

  /** Configure adaptive backoff */
  public setAdaptiveBackoffConfig(
    enabled: boolean,
    maxInterval?: number,
    threshold?: number
  ): void {
    this.adaptiveBackoff = enabled;
    if (maxInterval !== undefined) {
      this.maxPollingInterval = maxInterval;
    }
    if (threshold !== undefined) {
      this.circuitBreakerThreshold = threshold;
    }
  }

  /** Check if circuit breaker tripped */
  public isCircuitBreakerTripped(): boolean {
    return this.circuitBreakerTripped;
  }

  /** Get backoff metrics */
  public getAdaptiveBackoffMetrics(): {
    lastOperationDuration: number;
    consecutiveFailures: number;
    circuitBreakerTripped: boolean;
    currentInterval: number;
  } {
    return {
      lastOperationDuration: this.lastOperationDuration,
      consecutiveFailures: this.consecutiveFailures,
      circuitBreakerTripped: this.circuitBreakerTripped,
      currentInterval: this.calculateNextInterval(),
    };
  }

  /** Update metadata (branch/name) and re-extract issue number if needed */
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

  /** Force refresh status and optionally AI summary */
  public async refresh(forceAI: boolean = false): Promise<void> {
    if (this.circuitBreakerTripped) {
      this.resetCircuitBreaker();
    }

    await this.updateGitStatus(true);
    if (forceAI) {
      await this.updateAISummary(true);
    }
  }

  /** Calculate hash of git state (changes) */
  private calculateStateHash(changes: WorktreeChanges): string {
    const signature = changes.changes
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => `${f.path}:${f.status}:${f.insertions || 0}:${f.deletions || 0}`)
      .join("|");

    return createHash("md5").update(signature).digest("hex");
  }

  /** Update git status (hash-based change detection) */
  private async updateGitStatus(forceRefresh: boolean = false): Promise<void> {
    if (this.isUpdating) {
      return;
    }

    this.isUpdating = true;

    try {
      // 1. Fetch status
      if (forceRefresh) {
        invalidateGitStatusCache(this.path);
      }

      const newChanges = await this.gitService.getWorktreeChangesWithStats(this.path, forceRefresh);

      if (!this.isRunning) {
        return;
      }

      // 2. Hash check
      const currentHash = this.calculateStateHash(newChanges);
      const stateChanged = currentHash !== this.previousStateHash;

      if (!stateChanged && !forceRefresh) {
        return;
      }

      const prevChanges = this.state.worktreeChanges;
      const isInitialLoad = this.previousStateHash === "";
      const wasClean = prevChanges ? prevChanges.changedFileCount === 0 : true;
      const isNowClean = newChanges.changedFileCount === 0;

      // 3. Draft state
      let nextSummary = this.state.summary;
      let nextSummaryLoading = this.state.summaryLoading;
      let nextLastActivityTimestamp = this.state.lastActivityTimestamp;

      // Update activity timestamp
      const hasPendingChanges = newChanges.changedFileCount > 0;
      const shouldUpdateTimestamp =
        (stateChanged && !isInitialLoad) || (isInitialLoad && hasPendingChanges);

      if (shouldUpdateTimestamp) {
        nextLastActivityTimestamp = Date.now();
      }

      // 4. Summary logic
      let shouldTriggerAI = false;
      let shouldScheduleAI = false;

      if (isNowClean && this.aiUpdateTimer) {
        clearTimeout(this.aiUpdateTimer);
        this.aiUpdateTimer = null;
        this.lastSummarizedHash = null;
      }

      if (isNowClean) {
        nextSummary = await this.fetchLastCommitMessage();
        nextSummaryLoading = false;
      } else {
        const isFirstDirty = isInitialLoad || wasClean;

        if (isFirstDirty) {
          nextSummary = await this.fetchLastCommitMessage();
          nextSummaryLoading = false;

          if (!(isInitialLoad && this.hasGeneratedInitialSummary)) {
            this.hasGeneratedInitialSummary = true;
            shouldTriggerAI = true;
            logDebug("Will trigger AI summary generation", { id: this.id, isInitialLoad });
          }
        } else {
          shouldScheduleAI = true;
          logDebug(`Will schedule AI summary (${this.aiBufferDelay / 1000}s buffer)`, {
            id: this.id,
          });
        }
      }

      // 5. Update mood
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

      // 5.5. Read AI note
      const noteData = await this.readNoteFile();
      const nextAiNote = noteData?.content;
      const nextAiNoteTimestamp = noteData?.timestamp;

      // 6. Atomic commit
      this.previousStateHash = currentHash;
      this.state = {
        ...this.state,
        worktreeChanges: newChanges,
        changes: newChanges.changes,
        modifiedCount: newChanges.changedFileCount,
        summary: nextSummary,
        summaryLoading: nextSummaryLoading,
        lastActivityTimestamp: nextLastActivityTimestamp,
        mood: nextMood,
        aiNote: nextAiNote,
        aiNoteTimestamp: nextAiNoteTimestamp,
      };

      // 7. Emit
      this.emitUpdate();

      // 8. Post-emit async work
      if (shouldTriggerAI) {
        void this.triggerAISummary();
      } else if (shouldScheduleAI) {
        this.scheduleAISummary();
      }
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
          summaryLoading: false,
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
      this.state.summaryLoading = false;
      this.emitUpdate();

      throw error;
    } finally {
      this.isUpdating = false;
    }
  }

  /** Fetch last commit message (helper) */
  private async fetchLastCommitMessage(): Promise<string> {
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

  /** Get git directory (resolves .git for worktrees) */
  private getGitDir(): string | null {
    if (this.gitDir !== null) {
      return this.gitDir;
    }

    try {
      const result = execSync("git rev-parse --git-dir", {
        cwd: this.path,
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      if (!result.startsWith("/")) {
        this.gitDir = pathJoin(this.path, result);
      } else {
        this.gitDir = result;
      }

      return this.gitDir;
    } catch (error) {
      logWarn("Failed to resolve git directory", { id: this.id, error: (error as Error).message });
      return null;
    }
  }

  /** Read AI note file (.git/canopy/note) */
  private async readNoteFile(): Promise<{ content: string; timestamp: number } | undefined> {
    if (!this.noteEnabled) {
      return undefined;
    }

    const gitDir = this.getGitDir();
    if (!gitDir) {
      return undefined;
    }

    const notePath = pathJoin(gitDir, this.noteFilename);

    try {
      const fileStat = await stat(notePath);
      const timestamp = fileStat.mtimeMs;

      const content = await readFile(notePath, "utf-8");
      const trimmed = content.trim();

      if (!trimmed) {
        return undefined;
      }

      const lines = trimmed.split("\n");
      const lastLine = lines[lines.length - 1].trim();
      if (lastLine.length > 500) {
        return { content: lastLine.slice(0, 497) + "...", timestamp };
      }
      return { content: lastLine, timestamp };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && code !== "ENOENT") {
        logWarn("Failed to read AI note file", { id: this.id, error: (error as Error).message });
      }
      return undefined;
    }
  }

  /** Schedule AI summary (debounced) */
  private scheduleAISummary(): void {
    if (this.isGeneratingSummary) {
      this.pendingAISummary = true;
      return;
    }

    if (this.aiUpdateTimer) {
      return;
    }

    this.aiUpdateTimer = setTimeout(() => {
      this.aiUpdateTimer = null;
      void this.updateAISummary();
    }, this.aiBufferDelay);
  }

  /** Trigger AI summary immediately */
  private async triggerAISummary(): Promise<void> {
    await this.updateAISummary();
  }

  /** Generate AI summary and emit update */
  private async updateAISummary(forceUpdate: boolean = false): Promise<void> {
    logDebug("updateAISummary called", {
      id: this.id,
      isRunning: this.isRunning,
      isGeneratingSummary: this.isGeneratingSummary,
      forceUpdate,
    });

    if (!this.isRunning || this.isGeneratingSummary) {
      logDebug("Skipping AI summary (not running or already generating)", { id: this.id });
      return;
    }

    if (!getAIClient()) {
      this.state.aiStatus = "disabled";
      this.state.summaryLoading = false;
      logDebug("Skipping AI summary (no API key)", { id: this.id });
      this.emitUpdate();
      return;
    }

    if (!this.state.worktreeChanges) {
      logDebug("Skipping AI summary (no changes data)", { id: this.id });
      return;
    }

    const currentHash = this.calculateStateHash(this.state.worktreeChanges);

    if (!forceUpdate && this.lastSummarizedHash === currentHash) {
      logDebug("Skipping AI summary (same hash)", { id: this.id, currentHash });
      this.state.summaryLoading = false;
      this.emitUpdate();
      return;
    }

    this.isGeneratingSummary = true;
    this.state.aiStatus = "loading";
    logDebug("Starting AI summary generation", { id: this.id, currentHash });

    try {
      const result = await generateWorktreeSummary(
        this.path,
        this.branch,
        this.mainBranch,
        this.state.worktreeChanges
      );

      if (!this.isRunning) return;

      if (result) {
        logDebug("AI summary generated successfully", {
          id: this.id,
          summary: result.summary.substring(0, 50) + "...",
        });
        this.state.summary = result.summary;
        this.state.modifiedCount = result.modifiedCount;
        this.state.aiStatus = "active";

        this.lastSummarizedHash = currentHash;
        this.emitUpdate();
      } else {
        this.state.aiStatus = "disabled";
        this.emitUpdate();
      }

      this.state.summaryLoading = false;
    } catch (error) {
      logError("AI summary generation failed", error as Error, { id: this.id });
      this.state.summaryLoading = false;
      this.state.aiStatus = "error";
      this.emitUpdate();
    } finally {
      this.isGeneratingSummary = false;
      logDebug("AI summary generation complete", { id: this.id });

      if (this.pendingAISummary) {
        this.pendingAISummary = false;
        this.scheduleAISummary();
      }
    }
  }

  /** Calculate next poll interval (adaptive) */
  private calculateNextInterval(): number {
    if (!this.adaptiveBackoff || this.lastOperationDuration === 0) {
      return this.pollingInterval;
    }

    const adaptiveInterval = Math.ceil(this.lastOperationDuration * 1.5);
    const nextInterval = Math.max(this.pollingInterval, adaptiveInterval);
    return Math.min(nextInterval, this.maxPollingInterval);
  }

  /** Schedule next poll */
  private scheduleNextPoll(): void {
    if (!this.isRunning || !this.pollingEnabled || this.circuitBreakerTripped) {
      return;
    }

    if (this.pollingTimer) {
      return;
    }

    const nextInterval = this.calculateNextInterval();

    logDebug("Scheduling next poll", {
      id: this.id,
      nextInterval,
      lastOperationDuration: this.lastOperationDuration,
      adaptiveBackoff: this.adaptiveBackoff,
    });

    this.pollingTimer = setTimeout(() => {
      this.pollingTimer = null;
      void this.poll();
    }, nextInterval);
  }

  /** Execute single poll cycle */
  private async poll(): Promise<void> {
    if (!this.isRunning || this.circuitBreakerTripped) {
      return;
    }

    const startTime = Date.now();

    try {
      await this.updateGitStatus();

      this.lastOperationDuration = Date.now() - startTime;
      this.consecutiveFailures = 0;

      logDebug("Poll completed successfully", {
        id: this.id,
        duration: this.lastOperationDuration,
      });
    } catch (error) {
      this.lastOperationDuration = Date.now() - startTime;
      this.consecutiveFailures++;

      logWarn("Poll failed", {
        id: this.id,
        consecutiveFailures: this.consecutiveFailures,
        threshold: this.circuitBreakerThreshold,
        error: (error as Error).message,
      });

      if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
        this.tripCircuitBreaker();
        return;
      }
    }

    this.scheduleNextPoll();
  }

  /** Trip circuit breaker (stop polling) */
  private tripCircuitBreaker(): void {
    this.circuitBreakerTripped = true;
    this.state.mood = "error";
    this.state.summary = `⚠️ Polling stopped after ${this.consecutiveFailures} consecutive failures`;

    logWarn("Circuit breaker tripped", {
      id: this.id,
      consecutiveFailures: this.consecutiveFailures,
    });

    this.emitUpdate();
  }

  /** Reset circuit breaker */
  public resetCircuitBreaker(): void {
    if (!this.circuitBreakerTripped) {
      return;
    }

    logInfo("Resetting circuit breaker", { id: this.id });

    this.circuitBreakerTripped = false;
    this.consecutiveFailures = 0;
    this.lastOperationDuration = 0;

    if (this.isRunning && this.pollingEnabled) {
      this.scheduleNextPoll();
    }
  }

  /** Stop polling */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /** Emit state update event */
  private emitUpdate(): void {
    const state = this.getState();
    const payload = { ...state, timestamp: Date.now() };
    logDebug("emitUpdate called", {
      id: this.id,
      summary: state.summary ? `${state.summary.substring(0, 50)}...` : undefined,
      modifiedCount: state.modifiedCount,
      mood: state.mood,
      stack: new Error().stack?.split("\n").slice(2, 5).join(" <-\n"),
    });
    events.emit("sys:worktree:update", payload);
  }
}
