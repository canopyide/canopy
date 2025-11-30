import { createHash } from "crypto";
import { readFile, stat } from "fs/promises";
import { join as pathJoin } from "path";
import { execSync } from "child_process";
import { simpleGit } from "simple-git";
import type { Worktree, WorktreeChanges, AISummaryStatus } from "../types/index.js";
import { DEFAULT_CONFIG } from "../types/config.js";
import { getWorktreeChangesWithStats, invalidateGitStatusCache } from "../utils/git.js";
import { WorktreeRemovedError } from "../utils/errorTypes.js";
import { generateWorktreeSummary } from "./ai/worktree.js";
import { getAIClient } from "./ai/client.js";
import { categorizeWorktree } from "../utils/worktreeMood.js";
import { logWarn, logError, logInfo, logDebug } from "../utils/logger.js";
import { events } from "./events.js";
import { extractIssueNumberSync, extractIssueNumber } from "./ai/issueExtractor.js";

// Default AI debounce (used when config is not provided)
const DEFAULT_AI_DEBOUNCE_MS = DEFAULT_CONFIG.ai?.summaryDebounceMs ?? 10000;

/**
 * Represents the complete state of a monitored worktree.
 * This is what gets emitted on every update.
 */
export interface WorktreeState extends Worktree {
  worktreeId: string;
  // Full worktree changes (includes all file details)
  worktreeChanges: WorktreeChanges | null;

  // Activity tracking (used by ActivityTrafficLight for smooth color transitions)
  lastActivityTimestamp: number | null;

  // AI summary status (active, loading, disabled, error)
  aiStatus: AISummaryStatus;

  // Content from .git/canopy/note file (for AI agent status)
  aiNote?: string;

  // Timestamp when the note file was last modified (milliseconds since epoch)
  aiNoteTimestamp?: number;
}

/**
 * WorktreeMonitor is responsible for monitoring a single git worktree.
 *
 * It encapsulates all the logic for:
 * - Git status polling
 * - AI summary generation
 * - Mood categorization
 * - Activity tracking (traffic light)
 *
 * The monitor emits 'sys:worktree:update' events via the global TypedEventBus.
 * React components subscribe to these updates via WorktreeService, which
 * forwards them to the renderer via IPC.
 */
export class WorktreeMonitor {
  public readonly id: string;
  public readonly path: string;
  private name: string;
  private branch: string | undefined;
  public readonly isCurrent: boolean;

  private state: WorktreeState;
  private mainBranch: string;

  // Hash-based change detection
  private previousStateHash: string = "";
  private lastSummarizedHash: string | null = null;

  // Timers
  private pollingTimer: NodeJS.Timeout | null = null;
  private aiUpdateTimer: NodeJS.Timeout | null = null;

  // Configuration
  private pollingInterval: number = 2000; // Default 2s for active worktree
  private maxPollingInterval: number = DEFAULT_CONFIG.monitor?.pollIntervalMax ?? 30000;
  private adaptiveBackoff: boolean = DEFAULT_CONFIG.monitor?.adaptiveBackoff ?? true;
  private circuitBreakerThreshold: number = DEFAULT_CONFIG.monitor?.circuitBreakerThreshold ?? 3;
  private aiBufferDelay: number = DEFAULT_AI_DEBOUNCE_MS; // Configurable AI debounce
  private noteEnabled: boolean = DEFAULT_CONFIG.note?.enabled ?? true;
  private noteFilename: string = DEFAULT_CONFIG.note?.filename ?? "canopy/note";

  // Adaptive backoff state
  private lastOperationDuration: number = 0; // Duration of last git operation in ms
  private consecutiveFailures: number = 0; // Count of consecutive git operation failures
  private circuitBreakerTripped: boolean = false; // Whether circuit breaker has stopped polling

  // Git directory cache (resolved once on first use)
  private gitDir: string | null = null;

  // Flags
  private isRunning: boolean = false;
  private isUpdating: boolean = false;
  private isGeneratingSummary: boolean = false;
  private hasGeneratedInitialSummary: boolean = false;
  private pollingEnabled: boolean = false; // Tracks if polling should be active
  private pendingAISummary: boolean = false; // Tracks if AI summary should run after current generation completes

  // PR event unsubscribe functions
  private prEventUnsubscribers: (() => void)[] = [];

  constructor(worktree: Worktree, mainBranch: string = "main") {
    this.id = worktree.id;
    this.path = worktree.path;
    this.name = worktree.name;
    this.branch = worktree.branch;
    this.isCurrent = worktree.isCurrent;
    this.mainBranch = mainBranch;

    // Initialize state - determine initial AI status based on API key availability
    const initialAIStatus: AISummaryStatus = getAIClient() ? "active" : "disabled";

    // Extract issue number from branch name and folder synchronously (regex only)
    // We'll also trigger async extraction for AI fallback
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

    // Async extraction with AI fallback (fires in background, updates state if found)
    if (worktree.branch && !initialIssueNumber) {
      void this.extractIssueNumberAsync(worktree.branch, worktree.name);
    }

    // Subscribe to PR detection events and store unsubscribe functions
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

  /**
   * Extract issue number from branch name using AI fallback.
   * Updates state and emits an update if issue number is found.
   *
   * @param branchName - Git branch name to extract issue number from
   * @param folderName - Worktree folder name for additional context
   */
  private async extractIssueNumberAsync(branchName: string, folderName?: string): Promise<void> {
    try {
      const issueNumber = await extractIssueNumber(branchName, folderName);
      if (issueNumber && this.isRunning) {
        this.state.issueNumber = issueNumber;
        this.emitUpdate();
      }
    } catch (error) {
      // Silently ignore - issue extraction is non-critical
      logDebug("Failed to extract issue number from branch", {
        branch: branchName,
        folder: folderName,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Start monitoring this worktree via Git polling.
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    logInfo("Starting WorktreeMonitor (polling)", { id: this.id, path: this.path });

    this.isRunning = true;
    this.pollingEnabled = true;

    // 1. Perform initial fetch immediately
    // This will trigger summary generation via updateGitStatus
    await this.updateGitStatus(true);

    // 2. Start the polling loop
    // Check isRunning in case stop() was called during the await above
    if (this.isRunning) {
      this.scheduleNextPoll();
    }
  }

  /**
   * Fetch initial status without starting polling.
   * Used when polling is explicitly disabled.
   */
  public async fetchInitialStatus(): Promise<void> {
    logInfo("Fetching initial status (no polling)", { id: this.id, path: this.path });

    this.isRunning = true;
    this.pollingEnabled = false;

    await this.updateGitStatus(true);
  }

  /**
   * Stop monitoring this worktree.
   * Cleans up timers. Event bus subscriptions are managed by WorktreeService.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logInfo("Stopping WorktreeMonitor", { id: this.id });

    // Clear timers
    this.stopPolling();

    if (this.aiUpdateTimer) {
      clearTimeout(this.aiUpdateTimer);
      this.aiUpdateTimer = null;
    }

    // Clean up PR event subscriptions to prevent memory leaks
    for (const unsubscribe of this.prEventUnsubscribers) {
      unsubscribe();
    }
    this.prEventUnsubscribers = [];
  }

  /**
   * Get the current state of this worktree.
   */
  public getState(): WorktreeState {
    return { ...this.state };
  }

  /**
   * Set the polling interval for git status updates.
   * Used by WorktreeService to adjust intervals based on active/background status.
   */
  public setPollingInterval(ms: number): void {
    if (this.pollingInterval === ms) {
      return;
    }

    this.pollingInterval = ms;

    // Reschedule if idle (polling timer will be set after current poll finishes otherwise)
    // If a timer is waiting, cancel it and reschedule with new interval to be responsive
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
      this.scheduleNextPoll();
    }
  }

  /**
   * Set the AI buffer delay for summary generation.
   * Used by WorktreeService to apply user-configured debounce settings.
   * Cancels any pending AI timer so the new delay takes effect immediately.
   */
  public setAIBufferDelay(ms: number): void {
    if (this.aiBufferDelay === ms) {
      return;
    }

    this.aiBufferDelay = ms;

    // Cancel any pending AI timer so the new delay takes effect immediately
    // The next scheduleAISummary() call will use the updated delay
    if (this.aiUpdateTimer) {
      clearTimeout(this.aiUpdateTimer);
      this.aiUpdateTimer = null;
      // Reschedule with new delay if there was a pending timer
      this.scheduleAISummary();
    }
  }

  /**
   * Configure the AI note feature.
   * @param enabled - Whether to poll for note file
   * @param filename - Override the default filename
   */
  public setNoteConfig(enabled: boolean, filename?: string): void {
    this.noteEnabled = enabled;
    if (filename !== undefined) {
      this.noteFilename = filename;
    }
  }

  /**
   * Configure adaptive backoff settings.
   * @param enabled - Enable/disable adaptive backoff based on operation duration
   * @param maxInterval - Maximum polling interval in ms (cap for backoff)
   * @param threshold - Number of consecutive failures before circuit breaker trips
   */
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

  /**
   * Check if the circuit breaker is currently tripped.
   * @returns true if polling has stopped due to consecutive failures
   */
  public isCircuitBreakerTripped(): boolean {
    return this.circuitBreakerTripped;
  }

  /**
   * Get the current adaptive backoff metrics for debugging/monitoring.
   * @returns Object containing current backoff state
   */
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

  /**
   * Update metadata (branch, name) from a refreshed worktree object.
   * This is called by WorktreeService.sync() when worktree metadata changes
   * (e.g., after a `git checkout` or `git switch` in the worktree).
   *
   * Only updates the mutable state object, not the readonly instance properties.
   * Emits an update event if metadata actually changed.
   * Re-extracts issue number when branch changes.
   *
   * @param worktree - Updated worktree data from git worktree list
   */
  public updateMetadata(worktree: Worktree): void {
    const branchChanged = this.state.branch !== worktree.branch;
    const nameChanged = this.state.name !== worktree.name;

    if (branchChanged || nameChanged) {
      // Capture old values from state before updating
      const oldBranch = this.state.branch;
      const oldName = this.state.name;

      // Update both state and instance properties so mood/AI calls see current metadata
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

      // Re-extract issue number when branch changes
      if (branchChanged && worktree.branch) {
        // Try sync extraction first for immediate UI update
        const syncIssueNumber = extractIssueNumberSync(worktree.branch, worktree.name);
        this.state.issueNumber = syncIssueNumber ?? undefined;

        // If sync didn't find it, try async with AI fallback
        if (!syncIssueNumber) {
          void this.extractIssueNumberAsync(worktree.branch, worktree.name);
        }
      } else if (branchChanged && !worktree.branch) {
        // Branch cleared (detached HEAD or similar) - clear issue number
        this.state.issueNumber = undefined;
      }

      this.emitUpdate();
    }
  }

  /**
   * Force refresh of git status and AI summary.
   * Resets the circuit breaker if it was tripped, allowing polling to resume.
   */
  public async refresh(forceAI: boolean = false): Promise<void> {
    // Reset circuit breaker on manual refresh - user is explicitly requesting status
    if (this.circuitBreakerTripped) {
      this.resetCircuitBreaker();
    }

    await this.updateGitStatus(true);
    if (forceAI) {
      // Bypass buffer for forced refresh
      await this.updateAISummary(true);
    }
  }

  /**
   * Calculate a stable hash of the current git state.
   * This hash represents the exact state of all tracked files and their changes.
   *
   * @param changes - Current worktree changes from git
   * @returns MD5 hash of the changes
   */
  private calculateStateHash(changes: WorktreeChanges): string {
    // Create a lightweight signature: Path + Status + Insertions + Deletions
    // Sort by path to ensure order doesn't affect hash
    const signature = changes.changes
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => `${f.path}:${f.status}:${f.insertions || 0}:${f.deletions || 0}`)
      .join("|");

    return createHash("md5").update(signature).digest("hex");
  }

  /**
   * Update git status for this worktree using hash-based change detection.
   * Uses atomic state updates to prevent UI flickering.
   */
  private async updateGitStatus(forceRefresh: boolean = false): Promise<void> {
    // Prevent overlapping updates
    if (this.isUpdating) {
      return;
    }

    this.isUpdating = true;

    try {
      // ============================================
      // PHASE 1: FETCH GIT STATUS
      // ============================================
      if (forceRefresh) {
        invalidateGitStatusCache(this.path);
      }

      const newChanges = await getWorktreeChangesWithStats(this.path, forceRefresh);

      // Check if monitor was stopped while waiting for git status
      if (!this.isRunning) {
        return;
      }

      // ============================================
      // PHASE 2: DETECT CHANGES (Hash Check)
      // ============================================
      const currentHash = this.calculateStateHash(newChanges);
      const stateChanged = currentHash !== this.previousStateHash;

      // Optimization: Skip if nothing changed and not forced
      if (!stateChanged && !forceRefresh) {
        return;
      }

      // Store previous state for comparison
      const prevChanges = this.state.worktreeChanges;
      const isInitialLoad = this.previousStateHash === "";
      const wasClean = prevChanges ? prevChanges.changedFileCount === 0 : true;
      const isNowClean = newChanges.changedFileCount === 0;

      // ============================================
      // PHASE 3: PREPARE DRAFT STATE VALUES
      // All state changes are drafted here before committing
      // ============================================
      let nextSummary = this.state.summary;
      let nextSummaryLoading = this.state.summaryLoading;
      let nextLastActivityTimestamp = this.state.lastActivityTimestamp;

      // Update activity timestamp when changes are detected
      // (ActivityTrafficLight component uses this for smooth color transitions)
      //
      // Set timestamp when:
      // 1. State changed (hash is different) AND not initial load - normal activity detection
      // 2. Initial load AND worktree has changes (dirty) - show activity for already-dirty worktrees
      //
      // NOTE: In polling mode, this updates at the poll interval (e.g., 2s),
      // so there's a small latency between file save and UI update.
      const hasPendingChanges = newChanges.changedFileCount > 0;
      const shouldUpdateTimestamp =
        (stateChanged && !isInitialLoad) || (isInitialLoad && hasPendingChanges);

      if (shouldUpdateTimestamp) {
        nextLastActivityTimestamp = Date.now();
      }

      // ============================================
      // PHASE 4: HANDLE SUMMARY LOGIC (The Sync Fix)
      // Fetch last commit SYNCHRONOUSLY when clean so stats + summary update together
      // ============================================
      let shouldTriggerAI = false;
      let shouldScheduleAI = false;

      // Cancel any pending AI buffer if transitioning to clean
      if (isNowClean && this.aiUpdateTimer) {
        clearTimeout(this.aiUpdateTimer);
        this.aiUpdateTimer = null;
        this.lastSummarizedHash = null;
      }

      if (isNowClean) {
        // CLEAN STATE: Fetch commit message IMMEDIATELY so stats + summary update together
        nextSummary = await this.fetchLastCommitMessage();
        nextSummaryLoading = false;
      } else {
        // DIRTY STATE: Show last commit as fallback, then trigger AI if needed
        const isFirstDirty = isInitialLoad || wasClean;

        if (isFirstDirty) {
          // First time becoming dirty: Fetch last commit as placeholder, then trigger AI
          nextSummary = await this.fetchLastCommitMessage();
          nextSummaryLoading = false;

          // Guard: Prevent duplicate AI calls on initial load
          if (!(isInitialLoad && this.hasGeneratedInitialSummary)) {
            this.hasGeneratedInitialSummary = true;
            shouldTriggerAI = true;
            logDebug("Will trigger AI summary generation", { id: this.id, isInitialLoad });
          }
        } else {
          // Subsequent change while dirty: Schedule AI with buffer
          shouldScheduleAI = true;
          logDebug(`Will schedule AI summary (${this.aiBufferDelay / 1000}s buffer)`, {
            id: this.id,
          });
        }
      }

      // ============================================
      // PHASE 5: UPDATE MOOD
      // This is computed before the atomic commit
      // ============================================
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

      // ============================================
      // PHASE 5.5: READ AI NOTE FILE
      // Polled at same interval as git status
      // ============================================
      const noteData = await this.readNoteFile();
      const nextAiNote = noteData?.content;
      const nextAiNoteTimestamp = noteData?.timestamp;

      // ============================================
      // PHASE 6: ATOMIC COMMIT
      // Apply all state changes at once
      // ============================================
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

      // ============================================
      // PHASE 7: SINGLE EMISSION
      // ============================================
      this.emitUpdate();

      // ============================================
      // PHASE 8: POST-EMIT ASYNC WORK
      // AI summary is fire-and-forget with its own emission
      // ============================================
      if (shouldTriggerAI) {
        void this.triggerAISummary();
      } else if (shouldScheduleAI) {
        this.scheduleAISummary();
      }
    } catch (error) {
      // FIX: Handle worktree directory access errors resiliently
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

      // Handle index.lock collision gracefully (don't trigger circuit breaker)
      const errorMessage = (error as Error).message || "";
      if (errorMessage.includes("index.lock")) {
        logWarn("Git index locked, skipping this poll cycle", { id: this.id });
        return; // Silent skip - wait for next poll
      }

      // For all other errors, set mood to error and rethrow to trigger circuit breaker
      logError("Failed to update git status", error as Error, { id: this.id });
      this.state.mood = "error";
      this.state.summaryLoading = false; // Clear any pending loading state
      this.emitUpdate();

      // Rethrow to allow poll() to track consecutive failures and trigger circuit breaker
      throw error;
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Fetch the last commit message.
   * Returns the string directly, does not modify state.
   * This is the pure helper used by the atomic update cycle.
   */
  private async fetchLastCommitMessage(): Promise<string> {
    try {
      const git = simpleGit(this.path);

      const log = await git.log({ maxCount: 1 });
      const lastCommitMsg = log.latest?.message ?? "";

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

  /**
   * Get the git directory for this worktree.
   * For regular repos: .git directory
   * For worktrees: the actual git directory (e.g., ../.git/worktrees/branch-name)
   * Cached after first resolution.
   */
  private getGitDir(): string | null {
    if (this.gitDir !== null) {
      return this.gitDir;
    }

    try {
      // Use git rev-parse --git-dir to get the actual git directory
      // This works correctly for both regular repos and worktrees
      const result = execSync("git rev-parse --git-dir", {
        cwd: this.path,
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      // If relative path, resolve it relative to worktree path
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

  /**
   * Read the AI note file content and timestamp from the git directory.
   * Returns undefined if the file doesn't exist or is empty.
   * Content is truncated to 500 chars and only the last line is returned.
   * Timestamp is the file's mtime in milliseconds since epoch.
   */
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
      // Get file stats for mtime
      const fileStat = await stat(notePath);
      const timestamp = fileStat.mtimeMs;

      // Read file content
      const content = await readFile(notePath, "utf-8");
      const trimmed = content.trim();

      // Treat empty file as non-existent
      if (!trimmed) {
        return undefined;
      }

      // Get last line only and truncate to 500 chars
      const lines = trimmed.split("\n");
      const lastLine = lines[lines.length - 1].trim();
      if (lastLine.length > 500) {
        return { content: lastLine.slice(0, 497) + "...", timestamp };
      }
      return { content: lastLine, timestamp };
    } catch (error) {
      // File doesn't exist or permission error - treat as non-existent
      // Only log if it's not a simple ENOENT (file not found)
      const code = (error as NodeJS.ErrnoException).code;
      if (code && code !== "ENOENT") {
        logWarn("Failed to read AI note file", { id: this.id, error: (error as Error).message });
      }
      return undefined;
    }
  }

  /**
   * Schedule AI summary generation with a configurable buffer.
   * If a generation is already running, sets pending flag to re-run after completion.
   */
  private scheduleAISummary(): void {
    // If already generating, mark as pending to run after completion
    if (this.isGeneratingSummary) {
      this.pendingAISummary = true;
      return;
    }

    if (this.aiUpdateTimer) {
      return; // Already buffered
    }

    this.aiUpdateTimer = setTimeout(() => {
      this.aiUpdateTimer = null;
      void this.updateAISummary();
    }, this.aiBufferDelay);
  }

  /**
   * Trigger AI summary generation immediately (fire and forget).
   * This method updates state and emits its own update when AI completes.
   * Used by the atomic updateGitStatus() after the main state emission.
   */
  private async triggerAISummary(): Promise<void> {
    await this.updateAISummary();
  }

  /**
   * Update AI summary for this worktree.
   * Emits its own update when the summary is ready.
   * Tracks aiStatus throughout the lifecycle:
   * - 'loading' while generating
   * - 'active' on success
   * - 'disabled' if no API key
   * - 'error' on failure
   */
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

    // Check if AI is available before proceeding
    if (!getAIClient()) {
      this.state.aiStatus = "disabled";
      this.state.summaryLoading = false;
      logDebug("Skipping AI summary (no API key)", { id: this.id });
      this.emitUpdate();
      return;
    }

    // Don't generate summary if we don't have changes data yet
    if (!this.state.worktreeChanges) {
      logDebug("Skipping AI summary (no changes data)", { id: this.id });
      return;
    }

    const currentHash = this.calculateStateHash(this.state.worktreeChanges);

    // Dedup logic: don't run AI on exact same state unless forced
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
      // Keep showing old summary while AI generates new one
      // No loading state - just swap when ready

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

        // Mark as processed
        this.lastSummarizedHash = currentHash;
        this.emitUpdate();
      } else {
        // generateWorktreeSummary returns null when AI client is unavailable
        this.state.aiStatus = "disabled";
        this.emitUpdate();
      }

      // Ensure loading flag is off (defensive cleanup)
      this.state.summaryLoading = false;
    } catch (error) {
      logError("AI summary generation failed", error as Error, { id: this.id });
      this.state.summaryLoading = false;
      this.state.aiStatus = "error";
      this.emitUpdate();
      // Keep showing last commit on error (don't change summary)
    } finally {
      this.isGeneratingSummary = false;
      logDebug("AI summary generation complete", { id: this.id });

      // Check if another summary was requested while we were busy
      if (this.pendingAISummary) {
        this.pendingAISummary = false;
        this.scheduleAISummary();
      }
    }
  }

  /**
   * Calculate the next polling interval based on adaptive backoff.
   *
   * Uses a self-scheduling pattern where the next poll is scheduled AFTER the current
   * operation completes. This prevents overlapping git processes on large repositories.
   *
   * Interval calculation:
   * 1. Base interval (pollingInterval) as minimum
   * 2. If adaptive backoff is enabled, use 1.5x last operation duration as minimum
   * 3. Cap at maxPollingInterval
   *
   * @returns The calculated next polling interval in ms
   */
  private calculateNextInterval(): number {
    if (!this.adaptiveBackoff || this.lastOperationDuration === 0) {
      return this.pollingInterval;
    }

    // Use 1.5x the last operation duration as the buffer
    // This ensures we don't poll faster than git can respond
    const adaptiveInterval = Math.ceil(this.lastOperationDuration * 1.5);

    // Take the maximum of base interval and adaptive interval
    const nextInterval = Math.max(this.pollingInterval, adaptiveInterval);

    // Cap at maximum interval
    return Math.min(nextInterval, this.maxPollingInterval);
  }

  /**
   * Schedule the next poll after the current operation completes.
   * This is the core of the self-scheduling pattern that prevents overlapping git processes.
   */
  private scheduleNextPoll(): void {
    if (!this.isRunning || !this.pollingEnabled || this.circuitBreakerTripped) {
      return;
    }

    // If timer already exists, don't overwrite it
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

  /**
   * Execute a single polling cycle with timing and error handling.
   * This method wraps updateGitStatus() with:
   * - Operation duration tracking for adaptive backoff
   * - Circuit breaker logic for consecutive failures
   * - Self-scheduling of the next poll
   */
  private async poll(): Promise<void> {
    if (!this.isRunning || this.circuitBreakerTripped) {
      return;
    }

    const startTime = Date.now();

    try {
      await this.updateGitStatus();

      // Success: track duration and reset failure count
      this.lastOperationDuration = Date.now() - startTime;
      this.consecutiveFailures = 0;

      logDebug("Poll completed successfully", {
        id: this.id,
        duration: this.lastOperationDuration,
      });
    } catch (error) {
      // Track duration even on failure for adaptive backoff
      this.lastOperationDuration = Date.now() - startTime;

      // Increment failure counter
      // Note: index.lock and WorktreeRemovedError are handled in updateGitStatus()
      // and don't rethrow, so they won't reach this catch block
      this.consecutiveFailures++;

      logWarn("Poll failed", {
        id: this.id,
        consecutiveFailures: this.consecutiveFailures,
        threshold: this.circuitBreakerThreshold,
        error: (error as Error).message,
      });

      // Circuit breaker: Stop polling after consecutive failures
      if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
        this.tripCircuitBreaker();
        return; // Don't schedule next poll
      }
    }

    // Schedule next poll AFTER current operation completes
    this.scheduleNextPoll();
  }

  /**
   * Trip the circuit breaker to stop polling after consecutive failures.
   * Sets mood to 'error' and requires manual refresh to resume.
   */
  private tripCircuitBreaker(): void {
    this.circuitBreakerTripped = true;
    this.state.mood = "error";
    this.state.summary = `⚠️ Polling stopped after ${this.consecutiveFailures} consecutive failures`;

    logWarn("Circuit breaker tripped", {
      id: this.id,
      consecutiveFailures: this.consecutiveFailures,
    });

    this.emitUpdate();
    // Note: Polling will NOT be scheduled until resetCircuitBreaker() is called
  }

  /**
   * Reset the circuit breaker and resume polling.
   * Called by manual refresh (Cmd+R) or explicit recovery.
   */
  public resetCircuitBreaker(): void {
    if (!this.circuitBreakerTripped) {
      return;
    }

    logInfo("Resetting circuit breaker", { id: this.id });

    this.circuitBreakerTripped = false;
    this.consecutiveFailures = 0;
    this.lastOperationDuration = 0;

    // Resume polling if enabled
    if (this.isRunning && this.pollingEnabled) {
      this.scheduleNextPoll();
    }
  }

  /**
   * Stop polling for git status updates.
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Emit state update event via the global TypedEventBus.
   * WorktreeService subscribes to this event and forwards to renderer via IPC.
   */
  private emitUpdate(): void {
    const state = this.getState();
    logDebug("emitUpdate called", {
      id: this.id,
      summary: state.summary ? `${state.summary.substring(0, 50)}...` : undefined,
      modifiedCount: state.modifiedCount,
      mood: state.mood,
      stack: new Error().stack?.split("\n").slice(2, 5).join(" <-\n"),
    });
    events.emit("sys:worktree:update", state);
  }
}
