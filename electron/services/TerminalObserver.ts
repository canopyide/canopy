/**
 * TerminalObserver Service
 *
 * Polls silent agent terminals to detect state transitions using a three-tiered approach:
 * 1. Deterministic (Level 1): Input/output triggers handled by PtyManager
 * 2. Heuristic (Level 2): Fast regex pattern matching
 * 3. Semantic (Level 3): AI classification during extended silence
 *
 * This service implements the polling loop that checks terminals for silence
 * and triggers heuristic/AI analysis when appropriate.
 *
 * @module electron/services/TerminalObserver
 */

import { getAgentObserver } from "./ai/AgentObserver.js";
import { detectPrompt } from "./AgentStateMachine.js";
import type { TerminalSnapshot, PtyManager } from "./PtyManager.js";

/**
 * Configuration for the terminal observer.
 */
export interface TerminalObserverConfig {
  /** Interval between state checks (ms). Default: 200 (5x/second) */
  checkIntervalMs?: number;
  /** Silence threshold before triggering checks (ms). Default: 500 */
  silenceThresholdMs?: number;
  /** Minimum interval between AI checks per terminal (ms). Default: 2000 */
  aiThrottleMs?: number;
  /** Enable verbose logging. Default: false */
  verbose?: boolean;
}

// Default configuration values
const DEFAULT_CHECK_INTERVAL_MS = 200; // 5 Hz
const DEFAULT_SILENCE_THRESHOLD_MS = 500;
const DEFAULT_AI_THROTTLE_MS = 2000;

/**
 * TerminalObserver polls silent agent terminals and triggers state detection.
 *
 * Usage:
 * ```typescript
 * const observer = new TerminalObserver(ptyManager);
 * observer.start();
 * ```
 *
 * State changes are applied directly through PtyManager.transitionState().
 */
export class TerminalObserver {
  private ptyManager: PtyManager;
  private config: Required<TerminalObserverConfig>;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private checkInProgress = false;

  /** Track last AI check time per terminal to enforce throttling */
  private lastAICheckTimes: Map<string, number> = new Map();
  /** Track last AI classification result per terminal for backoff logic */
  private lastAIResults: Map<string, "working" | "waiting_for_user" | "unknown"> = new Map();

  constructor(ptyManager: PtyManager, config: TerminalObserverConfig = {}) {
    this.ptyManager = ptyManager;
    this.config = {
      checkIntervalMs: config.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS,
      silenceThresholdMs: config.silenceThresholdMs ?? DEFAULT_SILENCE_THRESHOLD_MS,
      aiThrottleMs: config.aiThrottleMs ?? DEFAULT_AI_THROTTLE_MS,
      verbose: config.verbose ?? !!process.env.CANOPY_VERBOSE,
    };
  }

  /**
   * Start the state check loop.
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.checkInterval = setInterval(() => {
      this.checkTerminals().catch((err) => {
        console.error("[TerminalObserver] Check loop error:", err);
      });
    }, this.config.checkIntervalMs);

    if (this.config.verbose) {
      console.log(
        `[TerminalObserver] Started with ${this.config.checkIntervalMs}ms interval, ` +
          `${this.config.silenceThresholdMs}ms silence threshold, ` +
          `${this.config.aiThrottleMs}ms AI throttle`
      );
    }
  }

  /**
   * Stop the state check loop.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    this.lastAICheckTimes.clear();
    this.lastAIResults.clear();

    if (this.config.verbose) {
      console.log("[TerminalObserver] Stopped");
    }
  }

  /**
   * Check all terminals for state changes.
   */
  private async checkTerminals(): Promise<void> {
    // Prevent overlapping check runs
    if (this.checkInProgress) {
      return;
    }

    this.checkInProgress = true;
    try {
      const snapshots = this.ptyManager.getAllTerminalSnapshots();

      // Clean up Map entries for terminals that no longer exist
      const activeIds = new Set(snapshots.map((s) => s.id));
      for (const id of this.lastAICheckTimes.keys()) {
        if (!activeIds.has(id)) {
          this.lastAICheckTimes.delete(id);
          this.lastAIResults.delete(id);
        }
      }

      for (const snapshot of snapshots) {
        const now = Date.now(); // Compute fresh timestamp per terminal
        await this.checkTerminal(snapshot, now);
      }
    } finally {
      this.checkInProgress = false;
    }
  }

  /**
   * Check a single terminal for potential state change.
   */
  private async checkTerminal(snapshot: TerminalSnapshot, now: number): Promise<void> {
    // Skip non-agent terminals (shell)
    if (snapshot.type === "shell" || !snapshot.agentId) {
      return;
    }

    // Skip terminals not in working state (we only check if they might be waiting)
    if (snapshot.agentState !== "working") {
      return;
    }

    // Skip terminals that are not silent
    const timeSinceOutput = now - snapshot.lastOutputTime;
    if (timeSinceOutput < this.config.silenceThresholdMs) {
      return;
    }

    // Terminal is silent and in working state - check if it's actually waiting

    // Level 2: Fast heuristic check (synchronous regex)
    const bufferText = snapshot.lines.join("\n");
    const isPromptDetected = detectPrompt(bufferText, {
      type: snapshot.type,
      timeSinceLastOutput: timeSinceOutput,
      processAlive: true,
    });

    if (isPromptDetected) {
      // Heuristic detected a prompt - transition to waiting state
      const success = this.ptyManager.transitionState(
        snapshot.id,
        { type: "prompt" },
        "heuristic",
        0.8,
        snapshot.spawnedAt
      );

      if (success) {
        this.ptyManager.markChecked(snapshot.id);
        if (this.config.verbose) {
          console.log(
            `[TerminalObserver] Heuristic detected prompt in ${snapshot.id}, ` +
              `transitioning to waiting state (confidence: 0.8)`
          );
        }
      }
      return;
    }

    // Level 3: AI classification (throttled with backoff)
    const lastAICheck = this.lastAICheckTimes.get(snapshot.id) ?? 0;
    const timeSinceAICheck = now - lastAICheck;
    const lastResult = this.lastAIResults.get(snapshot.id);

    // Apply backoff if last AI result was "working" - only check once per silence period
    // until new output arrives (indicated by lastOutputTime > lastAICheck)
    if (lastResult === "working" && snapshot.lastOutputTime <= lastAICheck) {
      // Terminal is still in the same silence period as last AI check, and AI said "working"
      // Skip AI check to avoid hammering the API - wait for new output
      return;
    }

    if (timeSinceAICheck < this.config.aiThrottleMs) {
      // AI check throttled - skip
      return;
    }

    // Perform AI classification
    const observer = getAgentObserver();
    if (!observer.isAvailable()) {
      // AI not available - rely on heuristics only
      return;
    }

    // Update AI check time before async call to prevent concurrent checks
    this.lastAICheckTimes.set(snapshot.id, now);

    try {
      const result = await observer.analyzeWithConfidence(snapshot.lines);

      // Store result for backoff logic
      this.lastAIResults.set(snapshot.id, result.classification);

      // Verify terminal still exists, is in working state, and session hasn't changed
      const currentSnapshot = this.ptyManager.getTerminalSnapshot(snapshot.id);
      if (
        !currentSnapshot ||
        currentSnapshot.agentState !== "working" ||
        currentSnapshot.spawnedAt !== snapshot.spawnedAt
      ) {
        // Terminal state changed or was respawned while we were analyzing
        return;
      }

      if (result.classification === "waiting_for_user") {
        // AI classification detected waiting state - transition
        const success = this.ptyManager.transitionState(
          snapshot.id,
          { type: "prompt" },
          "ai-classification",
          result.confidence,
          snapshot.spawnedAt
        );

        if (success) {
          this.ptyManager.markChecked(snapshot.id);
          if (this.config.verbose) {
            console.log(
              `[TerminalObserver] AI classified ${snapshot.id} as waiting ` +
                `(confidence: ${result.confidence})`
            );
          }
        }
      } else if (this.config.verbose && result.classification !== "unknown") {
        console.log(
          `[TerminalObserver] AI classification for ${snapshot.id}: ${result.classification} ` +
            `(confidence: ${result.confidence})`
        );
      }
    } catch (error) {
      console.warn(`[TerminalObserver] AI analysis failed for ${snapshot.id}:`, error);
      // Remove from results map on error so we retry on next cycle
      this.lastAIResults.delete(snapshot.id);
      // Continue - we'll try again on next cycle
    }
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.stop();
  }
}

// Singleton instance
let observerInstance: TerminalObserver | null = null;

/**
 * Create or get the singleton TerminalObserver instance.
 *
 * @param ptyManager - PtyManager to observe (required on first call)
 * @returns TerminalObserver instance
 */
export function getTerminalObserver(ptyManager?: PtyManager): TerminalObserver {
  if (!observerInstance) {
    if (!ptyManager) {
      throw new Error("PtyManager required to create TerminalObserver");
    }
    observerInstance = new TerminalObserver(ptyManager);
  }
  return observerInstance;
}

/**
 * Dispose the singleton TerminalObserver instance.
 */
export function disposeTerminalObserver(): void {
  if (observerInstance) {
    observerInstance.dispose();
    observerInstance = null;
  }
}
