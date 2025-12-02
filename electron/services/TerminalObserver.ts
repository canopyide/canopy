import { getAgentObserver } from "./ai/AgentObserver.js";
import { detectPrompt } from "./AgentStateMachine.js";
import type { TerminalSnapshot, PtyManager } from "./PtyManager.js";

export interface TerminalObserverConfig {
  checkIntervalMs?: number;
  silenceThresholdMs?: number;
  aiThrottleMs?: number;
  verbose?: boolean;
}

const DEFAULT_CHECK_INTERVAL_MS = 200;
const DEFAULT_SILENCE_THRESHOLD_MS = 500;
const DEFAULT_AI_THROTTLE_MS = 2000;

export class TerminalObserver {
  private ptyManager: PtyManager;
  private config: Required<TerminalObserverConfig>;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private checkInProgress = false;

  private lastAICheckTimes: Map<string, number> = new Map();
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

  private async checkTerminals(): Promise<void> {
    if (this.checkInProgress) {
      return;
    }

    this.checkInProgress = true;
    try {
      const snapshots = this.ptyManager.getAllTerminalSnapshots();

      const activeIds = new Set(snapshots.map((s) => s.id));
      for (const id of this.lastAICheckTimes.keys()) {
        if (!activeIds.has(id)) {
          this.lastAICheckTimes.delete(id);
          this.lastAIResults.delete(id);
        }
      }

      for (const snapshot of snapshots) {
        const now = Date.now();
        await this.checkTerminal(snapshot, now);
      }
    } finally {
      this.checkInProgress = false;
    }
  }

  private async checkTerminal(snapshot: TerminalSnapshot, now: number): Promise<void> {
    if (snapshot.type === "shell" || !snapshot.agentId) {
      return;
    }

    if (snapshot.agentState !== "working") {
      return;
    }

    const timeSinceOutput = now - snapshot.lastOutputTime;
    if (timeSinceOutput < this.config.silenceThresholdMs) {
      return;
    }

    const bufferText = snapshot.lines.join("\n");
    const isPromptDetected = detectPrompt(bufferText, {
      type: snapshot.type,
      timeSinceLastOutput: timeSinceOutput,
      processAlive: true,
    });

    if (isPromptDetected) {
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

    const lastAICheck = this.lastAICheckTimes.get(snapshot.id) ?? 0;
    const timeSinceAICheck = now - lastAICheck;
    const lastResult = this.lastAIResults.get(snapshot.id);

    if (lastResult === "working" && snapshot.lastOutputTime <= lastAICheck) {
      return;
    }

    if (timeSinceAICheck < this.config.aiThrottleMs) {
      return;
    }

    const observer = getAgentObserver();
    if (!observer.isAvailable()) {
      return;
    }

    this.lastAICheckTimes.set(snapshot.id, now);

    try {
      const result = await observer.analyzeWithConfidence(snapshot.lines);

      this.lastAIResults.set(snapshot.id, result.classification);

      const currentSnapshot = this.ptyManager.getTerminalSnapshot(snapshot.id);
      if (
        !currentSnapshot ||
        currentSnapshot.agentState !== "working" ||
        currentSnapshot.spawnedAt !== snapshot.spawnedAt
      ) {
        return;
      }

      if (result.classification === "waiting_for_user") {
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
      this.lastAIResults.delete(snapshot.id);
    }
  }

  dispose(): void {
    this.stop();
  }
}

let observerInstance: TerminalObserver | null = null;

export function getTerminalObserver(ptyManager?: PtyManager): TerminalObserver {
  if (!observerInstance) {
    if (!ptyManager) {
      throw new Error("PtyManager required to create TerminalObserver");
    }
    observerInstance = new TerminalObserver(ptyManager);
  }
  return observerInstance;
}

export function disposeTerminalObserver(): void {
  if (observerInstance) {
    observerInstance.dispose();
    observerInstance = null;
  }
}
