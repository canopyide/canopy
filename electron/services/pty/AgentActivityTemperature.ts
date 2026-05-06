import {
  measureVisibleContentDelta,
  type VisibleContentSnapshot,
} from "./SustainedChangeTracker.js";

export const AGENT_OUTPUT_ACTIVITY_LINE_COUNT = 15;

const DEFAULT_HALF_LIFE_MS = 4500;
const DEFAULT_WORKING_THRESHOLD = 70;
const DEFAULT_WAITING_THRESHOLD = 40;
const DEFAULT_WORKING_DWELL_MS = 2000;
const DEFAULT_WAITING_DWELL_MS = 6000;
const DEFAULT_ACTIVE_GAP_RESET_MS = 3000;
const DEFAULT_RESIZE_QUIET_MS = 1000;
const DEFAULT_RESIZE_MAX_BLIND_MS = 2000;
const DEFAULT_MAX_TEMPERATURE = 100;
const DEFAULT_VISIBLE_BASE_IMPULSE = 22;
const DEFAULT_VISIBLE_LOG_SCALE = 8;
const DEFAULT_DECORATIVE_IMPULSE = 1;

export interface AgentActivityTemperatureOptions {
  halfLifeMs?: number;
  workingThreshold?: number;
  waitingThreshold?: number;
  workingDwellMs?: number;
  waitingDwellMs?: number;
  activeGapResetMs?: number;
  resizeQuietMs?: number;
  resizeMaxBlindMs?: number;
  maxTemperature?: number;
  visibleBaseImpulse?: number;
  visibleLogScale?: number;
  decorativeImpulse?: number;
}

export interface AgentActivityDeltaObservation {
  changedChars: number;
  decorative?: boolean;
}

export interface AgentActivityObservationResult {
  stateHint?: "busy" | "idle";
  changed: boolean;
  changedChars: number;
  heatAdded: number;
  temperature: number;
  suppressed: boolean;
  seeded: boolean;
}

export class AgentActivityTemperature {
  private readonly halfLifeMs: number;
  private readonly workingThreshold: number;
  private readonly waitingThreshold: number;
  private readonly workingDwellMs: number;
  private readonly waitingDwellMs: number;
  private readonly activeGapResetMs: number;
  private readonly resizeQuietMs: number;
  private readonly resizeMaxBlindMs: number;
  private readonly maxTemperature: number;
  private readonly visibleBaseImpulse: number;
  private readonly visibleLogScale: number;
  private readonly decorativeImpulse: number;

  private temperature = 0;
  private lastSampleAt = 0;
  private activeEvidenceStartedAt = 0;
  private lastChangedAt = 0;
  private quietStartedAt = 0;
  private resizeStartedAt = 0;
  private resizeSuppressUntil = 0;
  private baselineInvalid = false;
  private lastSnapshot: VisibleContentSnapshot | undefined;

  constructor(options?: AgentActivityTemperatureOptions) {
    this.halfLifeMs = positive(options?.halfLifeMs, DEFAULT_HALF_LIFE_MS);
    this.workingThreshold = positive(options?.workingThreshold, DEFAULT_WORKING_THRESHOLD);
    this.waitingThreshold = positive(options?.waitingThreshold, DEFAULT_WAITING_THRESHOLD);
    this.workingDwellMs = nonNegative(options?.workingDwellMs, DEFAULT_WORKING_DWELL_MS);
    this.waitingDwellMs = nonNegative(options?.waitingDwellMs, DEFAULT_WAITING_DWELL_MS);
    this.activeGapResetMs = positive(options?.activeGapResetMs, DEFAULT_ACTIVE_GAP_RESET_MS);
    this.resizeQuietMs = nonNegative(options?.resizeQuietMs, DEFAULT_RESIZE_QUIET_MS);
    this.resizeMaxBlindMs = nonNegative(options?.resizeMaxBlindMs, DEFAULT_RESIZE_MAX_BLIND_MS);
    this.maxTemperature = positive(options?.maxTemperature, DEFAULT_MAX_TEMPERATURE);
    this.visibleBaseImpulse = nonNegative(
      options?.visibleBaseImpulse,
      DEFAULT_VISIBLE_BASE_IMPULSE
    );
    this.visibleLogScale = nonNegative(options?.visibleLogScale, DEFAULT_VISIBLE_LOG_SCALE);
    this.decorativeImpulse = nonNegative(options?.decorativeImpulse, DEFAULT_DECORATIVE_IMPULSE);
  }

  getTemperature(now?: number): number {
    if (now !== undefined && !this.isResizeSuppressed(now)) {
      this.applyDecay(now);
    }
    return this.temperature;
  }

  reset(): void {
    this.temperature = 0;
    this.lastSampleAt = 0;
    this.activeEvidenceStartedAt = 0;
    this.lastChangedAt = 0;
    this.quietStartedAt = 0;
    this.resizeStartedAt = 0;
    this.resizeSuppressUntil = 0;
    this.baselineInvalid = false;
    this.lastSnapshot = undefined;
  }

  noteResize(now: number, quietMs = this.resizeQuietMs): void {
    if (this.resizeStartedAt === 0 || now - this.resizeStartedAt > this.resizeMaxBlindMs) {
      this.resizeStartedAt = now;
    }
    this.resizeSuppressUntil = now + nonNegative(quietMs, this.resizeQuietMs);
    this.baselineInvalid = true;
    this.lastSnapshot = undefined;
    this.activeEvidenceStartedAt = 0;
    this.lastChangedAt = 0;
    this.quietStartedAt = 0;
  }

  seedSnapshot(snapshot: VisibleContentSnapshot, now: number): AgentActivityObservationResult {
    this.lastSnapshot = snapshot;
    this.lastSampleAt = now;
    this.quietStartedAt = now;
    this.clearResizeSuppression();
    return this.result(now, false, 0, 0, true, false);
  }

  observeSnapshot(
    now: number,
    snapshot: VisibleContentSnapshot,
    options?: { decorative?: boolean }
  ): AgentActivityObservationResult {
    const suppressed = this.consumeResizeSuppression(now);
    if (suppressed) {
      return this.result(now, false, 0, 0, false, true);
    }

    if (this.baselineInvalid || this.lastSnapshot === undefined) {
      return this.seedSnapshot(snapshot, now);
    }

    this.applyDecay(now);
    const delta = measureVisibleContentDelta(this.lastSnapshot, snapshot);
    this.lastSnapshot = snapshot;
    return this.observeDeltaAfterDecay(now, delta.changedChars, options?.decorative === true);
  }

  observeDelta(
    now: number,
    observation: AgentActivityDeltaObservation
  ): AgentActivityObservationResult {
    const suppressed = this.consumeResizeSuppression(now);
    if (suppressed) {
      return this.result(now, false, 0, 0, false, true);
    }

    if (this.baselineInvalid) {
      this.lastSampleAt = now;
      this.quietStartedAt = now;
      this.clearResizeSuppression();
      return this.result(now, false, 0, 0, true, false);
    }

    this.applyDecay(now);
    return this.observeDeltaAfterDecay(
      now,
      observation.changedChars,
      observation.decorative === true
    );
  }

  private observeDeltaAfterDecay(
    now: number,
    rawChangedChars: number,
    decorative: boolean
  ): AgentActivityObservationResult {
    const changedChars = Number.isFinite(rawChangedChars) ? Math.max(0, rawChangedChars) : 0;

    if (changedChars <= 0) {
      if (this.lastChangedAt > 0 && now - this.lastChangedAt > this.activeGapResetMs) {
        this.activeEvidenceStartedAt = 0;
      }
      if (this.quietStartedAt === 0) {
        this.quietStartedAt = now;
      }
      return this.result(now, false, 0, 0, false, false);
    }

    const heatAdded = this.heatForChange(changedChars, decorative);
    this.temperature = Math.min(this.maxTemperature, this.temperature + heatAdded);

    if (
      this.activeEvidenceStartedAt === 0 ||
      (this.lastChangedAt > 0 && now - this.lastChangedAt > this.activeGapResetMs)
    ) {
      this.activeEvidenceStartedAt = now;
    }
    this.lastChangedAt = now;
    this.quietStartedAt = 0;

    return this.result(now, true, changedChars, heatAdded, false, false);
  }

  private result(
    now: number,
    changed: boolean,
    changedChars: number,
    heatAdded: number,
    seeded: boolean,
    suppressed: boolean
  ): AgentActivityObservationResult {
    return {
      stateHint: suppressed || seeded ? undefined : this.computeStateHint(now, changed),
      changed,
      changedChars,
      heatAdded,
      temperature: this.temperature,
      suppressed,
      seeded,
    };
  }

  private computeStateHint(now: number, changed: boolean): "busy" | "idle" | undefined {
    if (
      changed &&
      this.temperature >= this.workingThreshold &&
      this.activeEvidenceStartedAt > 0 &&
      now - this.activeEvidenceStartedAt >= this.workingDwellMs
    ) {
      return "busy";
    }

    if (
      this.temperature <= this.waitingThreshold &&
      this.quietStartedAt > 0 &&
      now - this.quietStartedAt >= this.waitingDwellMs
    ) {
      return "idle";
    }

    return undefined;
  }

  private heatForChange(changedChars: number, decorative: boolean): number {
    if (decorative) {
      return this.decorativeImpulse;
    }
    return Math.min(
      this.maxTemperature,
      this.visibleBaseImpulse + this.visibleLogScale * Math.log1p(changedChars)
    );
  }

  private applyDecay(now: number): void {
    if (this.lastSampleAt <= 0) {
      this.lastSampleAt = now;
      return;
    }

    const elapsed = Math.max(0, now - this.lastSampleAt);
    if (elapsed === 0) {
      return;
    }

    const decay = Math.pow(0.5, elapsed / this.halfLifeMs);
    this.temperature *= decay;
    if (this.temperature < 0.0001) {
      this.temperature = 0;
    }
    this.lastSampleAt = now;
  }

  private consumeResizeSuppression(now: number): boolean {
    if (!this.baselineInvalid) {
      return false;
    }

    if (this.isResizeSuppressed(now)) {
      this.lastSampleAt = now;
      return true;
    }

    return false;
  }

  private isResizeSuppressed(now: number): boolean {
    if (!this.baselineInvalid || this.resizeStartedAt === 0) {
      return false;
    }

    if (this.resizeMaxBlindMs > 0 && now - this.resizeStartedAt >= this.resizeMaxBlindMs) {
      return false;
    }

    return now < this.resizeSuppressUntil;
  }

  private clearResizeSuppression(): void {
    this.resizeStartedAt = 0;
    this.resizeSuppressUntil = 0;
    this.baselineInvalid = false;
  }
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}
