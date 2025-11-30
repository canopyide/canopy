/**
 * SemanticActivityObserver Service
 *
 * Uses AI (gpt-4o-mini) to generate human-readable headlines and classify
 * terminal activity as interactive, background, or idle.
 *
 * This service polls active terminals and generates semantic activity updates
 * that are displayed in the terminal header as badges.
 *
 * @module electron/services/ai/SemanticActivityObserver
 */

import { getAIClient, isAIAvailable } from "./client.js";
import { getPtyManager } from "../PtyManager.js";
import { sendToRenderer } from "../../ipc/handlers.js";
import { CHANNELS } from "../../ipc/channels.js";
import type { BrowserWindow } from "electron";
import type {
  TerminalTaskType,
  TerminalActivityStatus,
  TerminalActivityPayload,
} from "@shared/types/terminal.js";

/**
 * Configuration for the semantic activity observer.
 */
export interface SemanticActivityObserverConfig {
  /** Interval between activity checks (ms). Default: 3000 (every 3s) */
  pollIntervalMs?: number;
  /** Minimum time since last output before checking (ms). Default: 1000 */
  activityThresholdMs?: number;
  /** Minimum interval between checks per terminal (ms). Default: 5000 */
  throttleMs?: number;
  /** Enable verbose logging. Default: false */
  verbose?: boolean;
}

// Default configuration values
const DEFAULT_POLL_INTERVAL_MS = 3000; // Poll every 3 seconds
const DEFAULT_ACTIVITY_THRESHOLD_MS = 1000; // Only check terminals with activity in last 1s
const DEFAULT_THROTTLE_MS = 5000; // Don't check same terminal more than once per 5s

/** Model to use for classification (fast, cheap) */
const CLASSIFICATION_MODEL = "gpt-4o-mini";

/** Maximum lines to analyze (to control API cost and latency) */
const MAX_ANALYSIS_LINES = 30;

/** Maximum tokens in response */
const MAX_RESPONSE_TOKENS = 150;

/**
 * System prompt for AI semantic activity classification.
 * Instructs the model to generate a headline and classify the terminal.
 */
const SEMANTIC_ACTIVITY_PROMPT = `You are analyzing terminal output to generate a human-readable status summary.

Your task: Analyze the terminal output and return a JSON object with:
1. A short headline (max 6 words, active voice) describing what the terminal is doing
2. A status classification
3. A type classification

Rules for HEADLINE:
- Use active voice: "Installing dependencies", "Running tests", "Waiting for input"
- Be specific but concise: "Building React app" not "Running build command"
- For prompts/questions: "Waiting for confirmation", "Requesting password"
- For idle shells: "Idle"
- Max 6 words

Rules for STATUS:
- "working": Actively processing, building, installing, running
- "waiting": Waiting for user input, showing prompt, asking question
- "success": Task completed successfully, build passed, tests passed
- "failure": Error occurred, build failed, tests failed

Rules for TYPE:
- "background": Long-running processes that run continuously
  Examples: dev servers (Vite, Next.js, webpack), file watchers, databases
  Indicators: "Listening on port", "Watching for changes", "ready in", "Server running"
- "interactive": Commands that need user attention or will complete
  Examples: npm install, git operations, CLI prompts, test runs
  Indicators: User prompts, progress bars, completion messages
- "idle": Shell is idle with just a prompt showing
  Indicators: Just "$ " or similar prompt with no activity

Reply with ONLY a JSON object:
{"headline": "...", "status": "working|waiting|success|failure", "type": "interactive|background|idle", "confidence": 0.0-1.0}`;

/**
 * Result of AI semantic analysis.
 */
interface SemanticAnalysisResult {
  headline: string;
  status: TerminalActivityStatus;
  type: TerminalTaskType;
  confidence: number;
}

/**
 * SemanticActivityObserver polls terminals and generates human-readable
 * activity status updates using AI.
 *
 * Usage:
 * ```typescript
 * const observer = new SemanticActivityObserver(mainWindow);
 * observer.start();
 * ```
 */
export class SemanticActivityObserver {
  private mainWindow: BrowserWindow | null = null;
  private config: Required<SemanticActivityObserverConfig>;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private checkInProgress = false;

  /** Track last check time per terminal to enforce throttling */
  private lastCheckTimes: Map<string, number> = new Map();
  /** Track last emitted activity per terminal to avoid duplicate emissions */
  private lastActivities: Map<string, string> = new Map();
  /** Track terminals currently being analyzed to prevent concurrent analyses */
  private analyzing: Set<string> = new Set();

  constructor(config: SemanticActivityObserverConfig = {}) {
    this.config = {
      pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      activityThresholdMs: config.activityThresholdMs ?? DEFAULT_ACTIVITY_THRESHOLD_MS,
      throttleMs: config.throttleMs ?? DEFAULT_THROTTLE_MS,
      verbose: config.verbose ?? !!process.env.CANOPY_VERBOSE,
    };
  }

  /**
   * Initialize the observer with the main window reference.
   * Must be called before start().
   */
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
  }

  /**
   * Start the polling loop.
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    if (!this.mainWindow) {
      console.warn("[SemanticActivityObserver] Cannot start: mainWindow not initialized");
      return;
    }

    this.isRunning = true;
    this.pollInterval = setInterval(() => {
      this.checkTerminals().catch((err) => {
        console.error("[SemanticActivityObserver] Poll loop error:", err);
      });
    }, this.config.pollIntervalMs);

    if (this.config.verbose) {
      console.log(
        `[SemanticActivityObserver] Started with ${this.config.pollIntervalMs}ms interval`
      );
    }
  }

  /**
   * Stop the polling loop.
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
    this.lastCheckTimes.clear();
    this.lastActivities.clear();
    this.analyzing.clear();

    if (this.config.verbose) {
      console.log("[SemanticActivityObserver] Stopped");
    }
  }

  /**
   * Check all terminals for activity updates.
   */
  private async checkTerminals(): Promise<void> {
    // Prevent overlapping check runs
    if (this.checkInProgress) {
      return;
    }

    // Skip if AI is not available
    if (!isAIAvailable()) {
      return;
    }

    this.checkInProgress = true;
    try {
      const ptyManager = getPtyManager();
      const snapshots = ptyManager.getAllTerminalSnapshots();
      const now = Date.now();

      // Clean up Map entries for terminals that no longer exist
      const activeIds = new Set(snapshots.map((s) => s.id));
      for (const id of this.lastCheckTimes.keys()) {
        if (!activeIds.has(id)) {
          this.lastCheckTimes.delete(id);
          this.lastActivities.delete(id);
        }
      }

      // Process terminals with recent activity
      for (const snapshot of snapshots) {
        // Skip if terminal is being analyzed
        if (this.analyzing.has(snapshot.id)) {
          continue;
        }

        // Skip if no recent activity (older than threshold)
        const timeSinceOutput = now - snapshot.lastOutputTime;
        if (timeSinceOutput > this.config.activityThresholdMs) {
          continue;
        }

        // Skip if we checked this terminal recently (throttling)
        const lastCheck = this.lastCheckTimes.get(snapshot.id) ?? 0;
        if (now - lastCheck < this.config.throttleMs) {
          continue;
        }

        // Skip if no lines to analyze
        if (snapshot.lines.length === 0) {
          continue;
        }

        // Analyze terminal (don't await - let analyses run in parallel)
        this.analyzeTerminal(snapshot.id, snapshot.lines, snapshot.worktreeId).catch((err) => {
          console.error(`[SemanticActivityObserver] Analysis failed for ${snapshot.id}:`, err);
        });
      }
    } finally {
      this.checkInProgress = false;
    }
  }

  /**
   * Analyze a terminal and emit activity event.
   */
  private async analyzeTerminal(
    terminalId: string,
    lines: string[],
    worktreeId?: string
  ): Promise<void> {
    // Mark as analyzing
    this.analyzing.add(terminalId);
    this.lastCheckTimes.set(terminalId, Date.now());

    try {
      const result = await this.callAI(lines);
      if (!result) {
        return;
      }

      // Create activity payload
      const activity: TerminalActivityPayload = {
        terminalId,
        headline: result.headline,
        status: result.status,
        type: result.type,
        confidence: result.confidence,
        timestamp: Date.now(),
        worktreeId,
      };

      // Check if this is different from last emitted activity
      const activityKey = `${activity.headline}|${activity.status}|${activity.type}`;
      const lastKey = this.lastActivities.get(terminalId);
      if (activityKey === lastKey) {
        // Same as last emission, skip
        return;
      }

      // Update last activity and emit
      this.lastActivities.set(terminalId, activityKey);
      this.emitActivity(activity);

      if (this.config.verbose) {
        console.log(
          `[SemanticActivityObserver] ${terminalId}: "${result.headline}" ` +
            `(${result.status}, ${result.type}, confidence: ${result.confidence})`
        );
      }
    } finally {
      this.analyzing.delete(terminalId);
    }
  }

  /**
   * Call the AI model to analyze terminal output.
   */
  private async callAI(lines: string[]): Promise<SemanticAnalysisResult | null> {
    const client = getAIClient();
    if (!client) {
      return null;
    }

    // Take only the last N lines for analysis
    const context = lines.slice(-MAX_ANALYSIS_LINES).join("\n");

    // Empty context = skip
    if (context.trim().length === 0) {
      return null;
    }

    try {
      const response = await client.chat.completions.create({
        model: CLASSIFICATION_MODEL,
        messages: [
          { role: "system", content: SEMANTIC_ACTIVITY_PROMPT },
          { role: "user", content: context },
        ],
        max_tokens: MAX_RESPONSE_TOKENS,
        temperature: 0, // Deterministic for consistent results
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return null;
      }

      // Parse JSON response
      const parsed = JSON.parse(content);

      // Validate and normalize response
      const headline =
        typeof parsed.headline === "string" ? parsed.headline.slice(0, 50) : "Unknown";
      const status = this.normalizeStatus(parsed.status);
      const type = this.normalizeType(parsed.type);
      const confidence =
        typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.7;

      return { headline, status, type, confidence };
    } catch (error) {
      if (this.config.verbose) {
        console.warn("[SemanticActivityObserver] AI call failed:", error);
      }
      return null;
    }
  }

  /**
   * Normalize status string to valid TerminalActivityStatus.
   */
  private normalizeStatus(status: unknown): TerminalActivityStatus {
    if (typeof status !== "string") return "working";
    const normalized = status.toLowerCase();
    if (
      normalized === "working" ||
      normalized === "waiting" ||
      normalized === "success" ||
      normalized === "failure"
    ) {
      return normalized;
    }
    return "working";
  }

  /**
   * Normalize type string to valid TerminalTaskType.
   */
  private normalizeType(type: unknown): TerminalTaskType {
    if (typeof type !== "string") return "interactive";
    const normalized = type.toLowerCase();
    if (normalized === "interactive" || normalized === "background" || normalized === "idle") {
      return normalized;
    }
    return "interactive";
  }

  /**
   * Emit activity event to renderer.
   */
  private emitActivity(activity: TerminalActivityPayload): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    sendToRenderer(this.mainWindow, CHANNELS.TERMINAL_ACTIVITY, activity);
  }

  /**
   * Force immediate analysis of a specific terminal.
   * Useful for testing or manual triggering.
   */
  async analyzeNow(terminalId: string): Promise<TerminalActivityPayload | null> {
    const ptyManager = getPtyManager();
    const snapshot = ptyManager.getTerminalSnapshot(terminalId);

    if (!snapshot || snapshot.lines.length === 0) {
      return null;
    }

    const result = await this.callAI(snapshot.lines);
    if (!result) {
      return null;
    }

    const activity: TerminalActivityPayload = {
      terminalId,
      headline: result.headline,
      status: result.status,
      type: result.type,
      confidence: result.confidence,
      timestamp: Date.now(),
      worktreeId: snapshot.worktreeId,
    };

    this.emitActivity(activity);
    return activity;
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.stop();
    this.mainWindow = null;
  }
}

// Singleton instance
let observerInstance: SemanticActivityObserver | null = null;

/**
 * Get the singleton SemanticActivityObserver instance.
 */
export function getSemanticActivityObserver(): SemanticActivityObserver {
  if (!observerInstance) {
    observerInstance = new SemanticActivityObserver();
  }
  return observerInstance;
}

/**
 * Dispose the singleton SemanticActivityObserver instance.
 */
export function disposeSemanticActivityObserver(): void {
  if (observerInstance) {
    observerInstance.dispose();
    observerInstance = null;
  }
}
