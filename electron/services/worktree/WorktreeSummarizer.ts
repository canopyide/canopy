import { createHash } from "crypto";
import type { WorktreeChanges, AISummaryStatus } from "../../types/index.js";
import { generateWorktreeSummary } from "../ai/worktree.js";
import { getAIClient } from "../ai/client.js";
import { logDebug, logError } from "../../utils/logger.js";
import type { GitService } from "../GitService.js";

export interface SummaryResult {
  summary: string;
  modifiedCount: number;
  aiStatus: AISummaryStatus;
}

export interface SummaryContext {
  path: string;
  branch: string | undefined;
  mainBranch: string;
  changes: WorktreeChanges;
}

export class WorktreeSummarizer {
  private monitorId: string;
  private gitService: GitService;
  private lastSummarizedHash: string | null = null;
  private isGenerating: boolean = false;
  private pendingGeneration: boolean = false;
  private latestContext: SummaryContext | null = null;
  private latestOnComplete: ((result: SummaryResult) => void) | null = null;
  private destroyed: boolean = false;
  private aiBufferDelay: number;
  private aiUpdateTimer: NodeJS.Timeout | null = null;

  constructor(monitorId: string, gitService: GitService, aiBufferDelay: number = 10000) {
    this.monitorId = monitorId;
    this.gitService = gitService;
    this.aiBufferDelay = aiBufferDelay;
  }

  public setAIBufferDelay(ms: number): void {
    this.aiBufferDelay = ms;
  }

  public calculateStateHash(changes: WorktreeChanges): string {
    const sortedChanges = [...changes.changes].sort((a, b) => a.path.localeCompare(b.path));
    const fileSignature = sortedChanges
      .map((f) => `${f.path}:${f.status}:${f.insertions || 0}:${f.deletions || 0}`)
      .join("|");

    const fullSignature = `${fileSignature}|commit:${changes.lastCommitMessage || ""}`;
    return createHash("md5").update(fullSignature).digest("hex");
  }

  public scheduleGeneration(
    context: SummaryContext,
    onComplete: (result: SummaryResult) => void
  ): void {
    if (this.destroyed) return;

    this.latestContext = context;
    this.latestOnComplete = onComplete;

    if (this.isGenerating) {
      this.pendingGeneration = true;
      return;
    }

    if (this.aiUpdateTimer) {
      return;
    }

    this.aiUpdateTimer = setTimeout(() => {
      this.aiUpdateTimer = null;
      if (this.destroyed || !this.latestContext || !this.latestOnComplete) return;
      void this.generateSummary(this.latestContext, false, this.latestOnComplete);
    }, this.aiBufferDelay);
  }

  public cancelScheduled(): void {
    if (this.aiUpdateTimer) {
      clearTimeout(this.aiUpdateTimer);
      this.aiUpdateTimer = null;
    }
    this.lastSummarizedHash = null;
  }

  public async generateSummary(
    context: SummaryContext,
    forceUpdate: boolean,
    onComplete: (result: SummaryResult) => void
  ): Promise<void> {
    logDebug("generateSummary called", {
      id: this.monitorId,
      isGenerating: this.isGenerating,
      forceUpdate,
    });

    if (this.isGenerating) {
      logDebug("Skipping summary generation (already generating)", { id: this.monitorId });
      return;
    }

    if (!getAIClient()) {
      logDebug("Skipping summary generation (no API key)", { id: this.monitorId });
      onComplete({
        summary: "",
        modifiedCount: 0,
        aiStatus: "disabled",
      });
      return;
    }

    const currentHash = this.calculateStateHash(context.changes);

    if (!forceUpdate && this.lastSummarizedHash === currentHash) {
      logDebug("Skipping summary generation (same hash)", { id: this.monitorId, currentHash });
      return;
    }

    this.isGenerating = true;
    logDebug("Starting summary generation", { id: this.monitorId, currentHash });

    try {
      const result = await generateWorktreeSummary(
        context.path,
        context.branch,
        context.mainBranch,
        context.changes,
        this.gitService
      );

      if (result) {
        logDebug("Summary generated successfully", {
          id: this.monitorId,
          summary: result.summary.substring(0, 50) + "...",
        });
        this.lastSummarizedHash = currentHash;
        onComplete({
          summary: result.summary,
          modifiedCount: result.modifiedCount,
          aiStatus: "active",
        });
      } else {
        onComplete({
          summary: "",
          modifiedCount: 0,
          aiStatus: "disabled",
        });
      }
    } catch (error) {
      logError("Summary generation failed", error as Error, { id: this.monitorId });
      onComplete({
        summary: "",
        modifiedCount: 0,
        aiStatus: "error",
      });
    } finally {
      this.isGenerating = false;
      logDebug("Summary generation complete", { id: this.monitorId });

      if (this.pendingGeneration) {
        this.pendingGeneration = false;
        if (!this.destroyed && this.latestContext && this.latestOnComplete) {
          this.scheduleGeneration(this.latestContext, this.latestOnComplete);
        }
      }
    }
  }

  public triggerImmediate(
    context: SummaryContext,
    onComplete: (result: SummaryResult) => void
  ): void {
    void this.generateSummary(context, false, onComplete);
  }

  public getAIStatus(): AISummaryStatus {
    return getAIClient() ? "active" : "disabled";
  }

  public destroy(): void {
    this.destroyed = true;
    this.cancelScheduled();
  }
}
