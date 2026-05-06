export const AGENT_WORKING_RECOVERY_WINDOW_MS = 2500;
export const AGENT_WORKING_RECOVERY_MIN_SUSTAIN_MS = 2000;
export const AGENT_WORKING_RECOVERY_MIN_CHANGED_FRAMES = 4;
export const AGENT_WORKING_RECOVERY_MAX_QUIET_MS = 3000;
export const AGENT_WORKING_RECOVERY_MIN_HEAT = 4;
export const AGENT_WORKING_RECOVERY_LARGE_CHANGE_WINDOW_MS = 1000;
export const AGENT_WORKING_RECOVERY_LARGE_CHANGE_MIN_FRAMES = 3;
export const AGENT_WORKING_RECOVERY_LARGE_CHANGE_MIN_HEAT = 12;

export interface SustainedChangeTrackerOptions {
  windowMs: number;
  minChangedFrames: number;
  maxQuietMs: number;
  minSustainMs?: number;
  minHeat?: number;
  largeChangeWindowMs?: number;
  largeChangeMinFrames?: number;
  largeChangeMinHeat?: number;
}

export interface ChangeObservation {
  changedChars: number;
}

export interface VisibleContentSnapshot {
  text: string;
  hash: number;
  length: number;
}

export interface VisibleContentDelta {
  changed: boolean;
  changedChars: number;
}

interface ChangeSample {
  at: number;
  heat: number;
}

export class SustainedChangeTracker {
  private lastChangedAt: number | undefined;
  private readonly minHeat: number;
  private readonly minSustainMs: number;
  private readonly largeChangeWindowMs: number;
  private readonly largeChangeMinFrames: number;
  private readonly largeChangeMinHeat: number;
  private samples: ChangeSample[] = [];

  constructor(private readonly options: SustainedChangeTrackerOptions) {
    this.minHeat = options.minHeat ?? AGENT_WORKING_RECOVERY_MIN_HEAT;
    this.minSustainMs = options.minSustainMs ?? AGENT_WORKING_RECOVERY_MIN_SUSTAIN_MS;
    this.largeChangeWindowMs =
      options.largeChangeWindowMs ?? AGENT_WORKING_RECOVERY_LARGE_CHANGE_WINDOW_MS;
    this.largeChangeMinFrames =
      options.largeChangeMinFrames ?? AGENT_WORKING_RECOVERY_LARGE_CHANGE_MIN_FRAMES;
    this.largeChangeMinHeat =
      options.largeChangeMinHeat ?? AGENT_WORKING_RECOVERY_LARGE_CHANGE_MIN_HEAT;
  }

  observe(now: number, observation: ChangeObservation): boolean {
    const changedChars = Number.isFinite(observation.changedChars)
      ? Math.max(0, observation.changedChars)
      : 0;
    if (changedChars <= 0) {
      this.resetIfQuiet(now);
      return false;
    }

    if (this.lastChangedAt !== undefined && now - this.lastChangedAt > this.options.maxQuietMs) {
      this.reset();
    }

    this.lastChangedAt = now;
    this.samples.push({ at: now, heat: heatForChangedChars(changedChars) });
    this.prune(now, this.options.windowMs);

    return this.hasSustainedHeat(now) || this.hasLargeChangeHeat(now);
  }

  reset(): void {
    this.lastChangedAt = undefined;
    this.samples = [];
  }

  private resetIfQuiet(now: number): void {
    if (this.lastChangedAt !== undefined && now - this.lastChangedAt > this.options.maxQuietMs) {
      this.reset();
    }
  }

  private prune(now: number, windowMs: number): void {
    const earliest = now - windowMs;
    while (this.samples.length > 0 && this.samples[0]!.at < earliest) {
      this.samples.shift();
    }
  }

  private hasSustainedHeat(now: number): boolean {
    if (this.samples.length < this.options.minChangedFrames) {
      return false;
    }

    const firstAt = this.samples[0]!.at;
    if (now - firstAt < this.minSustainMs) {
      return false;
    }

    return sumHeat(this.samples) >= this.minHeat;
  }

  private hasLargeChangeHeat(now: number): boolean {
    const earliest = now - this.largeChangeWindowMs;
    const recent = this.samples.filter((sample) => sample.at >= earliest);
    if (recent.length < this.largeChangeMinFrames) {
      return false;
    }

    const firstAt = recent[0]!.at;
    if (now - firstAt < this.largeChangeWindowMs) {
      return false;
    }

    return sumHeat(recent) >= this.largeChangeMinHeat;
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

export function normalizeVisibleContent(values: string | readonly string[]): string {
  const text = typeof values === "string" ? values : values.join("");
  return text.replace(/\s+/gu, "");
}

export function createVisibleContentSnapshot(
  values: string | readonly string[]
): VisibleContentSnapshot {
  const text = normalizeVisibleContent(values);
  return {
    text,
    hash: hashStrings([text]),
    length: Array.from(text).length,
  };
}

export function measureVisibleContentDelta(
  previous: VisibleContentSnapshot | undefined,
  current: VisibleContentSnapshot
): VisibleContentDelta {
  if (!previous || (previous.hash === current.hash && previous.text === current.text)) {
    return { changed: false, changedChars: 0 };
  }

  const previousChars = Array.from(previous.text);
  const currentChars = Array.from(current.text);
  let prefix = 0;
  while (
    prefix < previousChars.length &&
    prefix < currentChars.length &&
    previousChars[prefix] === currentChars[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < previousChars.length - prefix &&
    suffix < currentChars.length - prefix &&
    previousChars[previousChars.length - 1 - suffix] ===
      currentChars[currentChars.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const previousChanged = previousChars.length - prefix - suffix;
  const currentChanged = currentChars.length - prefix - suffix;
  const changedChars = Math.max(previousChanged, currentChanged);
  return { changed: changedChars > 0, changedChars };
}

function heatForChangedChars(changedChars: number): number {
  if (changedChars <= 0) return 0;
  if (changedChars === 1) return 1;
  if (changedChars <= 16) return 2;
  if (changedChars <= 64) return 4;
  return 6;
}

function sumHeat(samples: readonly ChangeSample[]): number {
  return samples.reduce((total, sample) => total + sample.heat, 0);
}
