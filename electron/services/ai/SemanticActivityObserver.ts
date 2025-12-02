import { getAIClient, isAIAvailable } from "./client.js";
import { getPtyManager } from "../PtyManager.js";
import { sendToRenderer } from "../../ipc/handlers.js";
import { CHANNELS } from "../../ipc/channels.js";
import type { BrowserWindow } from "electron";
import type {
  TerminalTaskType,
  TerminalActivityStatus,
  TerminalActivityPayload,
} from "../../../shared/types/terminal.js";

export interface SemanticActivityObserverConfig {
  pollIntervalMs?: number;
  activityThresholdMs?: number;
  throttleMs?: number;
  verbose?: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_ACTIVITY_THRESHOLD_MS = 1000;
const DEFAULT_THROTTLE_MS = 5000;

const CLASSIFICATION_MODEL = "gpt-4o-mini";

// To control API cost and latency
const MAX_ANALYSIS_LINES = 30;

const MAX_RESPONSE_TOKENS = 150;

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

interface SemanticAnalysisResult {
  headline: string;
  status: TerminalActivityStatus;
  type: TerminalTaskType;
  confidence: number;
}

export class SemanticActivityObserver {
  private mainWindow: BrowserWindow | null = null;
  private config: Required<SemanticActivityObserverConfig>;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private checkInProgress = false;

  // Enforce throttling
  private lastCheckTimes: Map<string, number> = new Map();
  // Avoid duplicate emissions
  private lastActivities: Map<string, string> = new Map();
  // Prevent concurrent analyses
  private analyzing: Set<string> = new Set();

  constructor(config: SemanticActivityObserverConfig = {}) {
    this.config = {
      pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      activityThresholdMs: config.activityThresholdMs ?? DEFAULT_ACTIVITY_THRESHOLD_MS,
      throttleMs: config.throttleMs ?? DEFAULT_THROTTLE_MS,
      verbose: config.verbose ?? !!process.env.CANOPY_VERBOSE,
    };
  }

  // Must be called before start()
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
  }

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

  private async checkTerminals(): Promise<void> {
    // Prevent overlapping check runs
    if (this.checkInProgress) {
      return;
    }

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

      for (const snapshot of snapshots) {
        if (this.analyzing.has(snapshot.id)) {
          continue;
        }

        const timeSinceOutput = now - snapshot.lastOutputTime;
        if (timeSinceOutput > this.config.activityThresholdMs) {
          continue;
        }

        const lastCheck = this.lastCheckTimes.get(snapshot.id) ?? 0;
        if (now - lastCheck < this.config.throttleMs) {
          continue;
        }

        if (snapshot.lines.length === 0) {
          continue;
        }

        // Don't await - let analyses run in parallel
        this.analyzeTerminal(snapshot.id, snapshot.lines, snapshot.worktreeId).catch((err) => {
          console.error(`[SemanticActivityObserver] Analysis failed for ${snapshot.id}:`, err);
        });
      }
    } finally {
      this.checkInProgress = false;
    }
  }

  private async analyzeTerminal(
    terminalId: string,
    lines: string[],
    worktreeId?: string
  ): Promise<void> {
    this.analyzing.add(terminalId);
    this.lastCheckTimes.set(terminalId, Date.now());

    try {
      const result = await this.callAI(lines);
      if (!result) {
        return;
      }

      const activity: TerminalActivityPayload = {
        terminalId,
        headline: result.headline,
        status: result.status,
        type: result.type,
        confidence: result.confidence,
        timestamp: Date.now(),
        worktreeId,
      };

      const activityKey = `${activity.headline}|${activity.status}|${activity.type}`;
      const lastKey = this.lastActivities.get(terminalId);
      if (activityKey === lastKey) {
        return;
      }

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

  private async callAI(lines: string[]): Promise<SemanticAnalysisResult | null> {
    const client = getAIClient();
    if (!client) {
      return null;
    }

    const context = lines.slice(-MAX_ANALYSIS_LINES).join("\n");

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
        temperature: 0,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return null;
      }

      const parsed = JSON.parse(content);

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

  private normalizeType(type: unknown): TerminalTaskType {
    if (typeof type !== "string") return "interactive";
    const normalized = type.toLowerCase();
    if (normalized === "interactive" || normalized === "background" || normalized === "idle") {
      return normalized;
    }
    return "interactive";
  }

  private emitActivity(activity: TerminalActivityPayload): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    sendToRenderer(this.mainWindow, CHANNELS.TERMINAL_ACTIVITY, activity);
  }

  // Useful for testing or manual triggering
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

  dispose(): void {
    this.stop();
    this.mainWindow = null;
  }
}

let observerInstance: SemanticActivityObserver | null = null;

export function getSemanticActivityObserver(): SemanticActivityObserver {
  if (!observerInstance) {
    observerInstance = new SemanticActivityObserver();
  }
  return observerInstance;
}

export function disposeSemanticActivityObserver(): void {
  if (observerInstance) {
    observerInstance.dispose();
    observerInstance = null;
  }
}
