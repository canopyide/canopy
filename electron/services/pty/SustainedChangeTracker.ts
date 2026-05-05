export const AGENT_WORKING_RECOVERY_WINDOW_MS = 1000;
export const AGENT_WORKING_RECOVERY_MIN_CHANGED_FRAMES = 3;
export const AGENT_WORKING_RECOVERY_MAX_QUIET_MS = 1250;

export interface SustainedChangeTrackerOptions {
  windowMs: number;
  minChangedFrames: number;
  maxQuietMs: number;
}

export class SustainedChangeTracker {
  private firstChangedAt: number | undefined;
  private lastChangedAt: number | undefined;
  private changedFrames = 0;

  constructor(private readonly options: SustainedChangeTrackerOptions) {}

  observe(now: number, changed: boolean): boolean {
    if (!changed) {
      this.resetIfQuiet(now);
      return false;
    }

    if (
      this.firstChangedAt === undefined ||
      (this.lastChangedAt !== undefined && now - this.lastChangedAt > this.options.maxQuietMs)
    ) {
      this.firstChangedAt = now;
      this.changedFrames = 0;
    }

    this.lastChangedAt = now;
    this.changedFrames += 1;

    return (
      now - this.firstChangedAt >= this.options.windowMs &&
      this.changedFrames >= this.options.minChangedFrames
    );
  }

  reset(): void {
    this.firstChangedAt = undefined;
    this.lastChangedAt = undefined;
    this.changedFrames = 0;
  }

  private resetIfQuiet(now: number): void {
    if (this.lastChangedAt !== undefined && now - this.lastChangedAt > this.options.maxQuietMs) {
      this.reset();
    }
  }
}

export function hashStrings(values: readonly string[]): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 10;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
