/**
 * Periodic resource-status poll for worktrees that expose a status command
 * (cloud sandbox providers, remote compute, etc.). Runs independently from
 * the local-status poll because the underlying call is a remote round-trip,
 * not a git invocation. Cadence flips between active (focused) and background
 * tiers via the host interface.
 */

export interface ResourcePollTimerHost {
  readonly isRunning: boolean;
  readonly hasResourceConfig: boolean;
  readonly hasStatusCommand: boolean;
  /** Interval in milliseconds. 0 disables auto-polling. */
  readonly resourcePollIntervalMs: number;
  readonly worktreeId: string;
  /**
   * Execute the resource status poll. Errors are swallowed by the timer
   * — provider-specific failure recovery is the callback's responsibility.
   */
  onResourceStatusPoll(worktreeId: string): Promise<unknown> | void;
}

export class ResourcePollTimer {
  private timer: NodeJS.Timeout | null = null;
  private disposed = false;

  constructor(private readonly host: ResourcePollTimerHost) {}

  /**
   * Schedule the next poll. Idempotent — no-op if a timer is already armed,
   * if disposed, or if the interval/feature gates are not satisfied.
   */
  schedule(): void {
    if (this.disposed) return;
    if (this.timer) return;
    if (this.host.resourcePollIntervalMs <= 0) return;
    if (!this.host.hasResourceConfig || !this.host.hasStatusCommand) return;

    this.timer = setTimeout(async () => {
      this.timer = null;
      if (this.disposed) return;
      // Re-check at fire time — feature flags or running state may have
      // flipped between schedule and fire.
      if (
        !this.host.isRunning ||
        !this.host.hasResourceConfig ||
        !this.host.hasStatusCommand ||
        this.host.resourcePollIntervalMs <= 0
      ) {
        return;
      }
      try {
        await this.host.onResourceStatusPoll(this.host.worktreeId);
      } catch {
        // Poll callback failure — swallowed intentionally; provider state
        // recovery is the callback's responsibility.
      }
      if (this.disposed || !this.host.isRunning) return;
      this.schedule();
    }, this.host.resourcePollIntervalMs);
  }

  /** Cancel any armed timer without disposing — used by focus flips and pause. */
  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Permanently disable. Late callbacks short-circuit on the disposed flag. */
  dispose(): void {
    this.disposed = true;
    this.clear();
  }
}
