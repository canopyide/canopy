/**
 * TerminalFrameStabilizer - FRAME COMPLETION DETECTION
 *
 * Buffers frames and only emits when we KNOW a frame is complete.
 * A frame is "complete" when either:
 * 1. A new frame starts (we see a clear screen / frame boundary)
 * 2. No new data arrives for STABILITY_MS (assume it's done)
 * 3. MAX_HOLD_MS expires (safety valve)
 *
 * This prevents showing half-drawn frames during TUI redraws.
 *
 * KNOWN LIMITATION: Boundaries split across PTY chunks are not detected.
 * If "\x1b[" arrives in one chunk and "2J" in the next, the boundary is missed.
 * The stability timeout (100ms) mitigates this in practice.
 */

import type { Terminal as HeadlessTerminal } from "@xterm/headless";

// Frame boundary patterns
const CLEAR_SCREEN = "\x1b[2J";
const ALT_BUFFER_ON = "\x1b[?1049h";

// How long to wait before assuming current frame is complete
const STABILITY_MS = 100;

// Interactive mode - shorter stability window
const INTERACTIVE_STABILITY_MS = 32;

// How long interactive mode lasts
const INTERACTIVE_WINDOW_MS = 1000;

// Maximum time to hold a frame before force emitting (5 FPS minimum)
const MAX_HOLD_MS = 200;

// Max buffer before force flush
const MAX_BUFFER_SIZE = 512 * 1024;

export interface FrameStabilizerOptions {
  verbose?: boolean;
}

export class TerminalFrameStabilizer {
  private emitCallback: ((data: string) => void) | null = null;

  // Current frame being built
  private buffer = "";

  // Stability timer
  private stabilityTimer: ReturnType<typeof setTimeout> | null = null;

  // Max hold timer
  private maxHoldTimer: ReturnType<typeof setTimeout> | null = null;

  // Interactive mode
  private interactiveUntil = 0;

  // Stats
  private framesEmitted = 0;

  // Debug
  private verbose: boolean;

  constructor(options?: FrameStabilizerOptions) {
    this.verbose = options?.verbose ?? process.env.CANOPY_VERBOSE === "1";
  }

  attach(_headless: HeadlessTerminal, emit: (data: string) => void): void {
    this.emitCallback = emit;
  }

  detach(): void {
    this.cancelStabilityTimer();
    this.cancelMaxHoldTimer();
    // Emit any pending data
    if (this.buffer) {
      this.emit(this.buffer, "detach");
      this.buffer = "";
    }
    this.emitCallback = null;
  }

  markInteractive(ttlMs: number = INTERACTIVE_WINDOW_MS): void {
    this.interactiveUntil = Date.now() + ttlMs;
  }

  ingest(data: string): void {
    // Look for frame boundaries in incoming data
    let remaining = data;

    while (remaining.length > 0) {
      const boundaryIndex = this.findFrameBoundary(remaining);

      if (boundaryIndex === -1) {
        // No boundary - add all remaining to buffer
        this.buffer += remaining;
        break;
      }

      if (boundaryIndex > 0) {
        // Content before boundary - add to current frame
        this.buffer += remaining.substring(0, boundaryIndex);
      }

      // Emit current frame (it's complete - new frame is starting)
      if (this.buffer.length > 0) {
        this.cancelStabilityTimer();
        this.cancelMaxHoldTimer();
        this.emit(this.buffer, "frame-boundary");
        this.buffer = "";
      }

      // Find where the boundary sequence ends
      const boundaryLength = this.getBoundaryLength(remaining, boundaryIndex);

      // Start new frame with the boundary sequence
      this.buffer = remaining.substring(boundaryIndex, boundaryIndex + boundaryLength);

      // Arm max-hold timer for the new frame
      this.scheduleMaxHoldFlush();

      // Continue processing after the boundary
      remaining = remaining.substring(boundaryIndex + boundaryLength);
    }

    // Arm max-hold timer if we started buffering (and it's not already armed)
    if (this.buffer.length > 0 && !this.maxHoldTimer) {
      this.scheduleMaxHoldFlush();
    }

    // Force flush if buffer too large
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.cancelStabilityTimer();
      this.cancelMaxHoldTimer();
      this.emit(this.buffer, "overflow");
      this.buffer = "";
      return;
    }

    // Schedule stability flush
    this.scheduleStabilityFlush();
  }

  private findFrameBoundary(data: string): number {
    // Find all boundaries and return the earliest
    const clearIdx = data.indexOf(CLEAR_SCREEN);
    const altIdx = data.indexOf(ALT_BUFFER_ON);

    if (clearIdx === -1) return altIdx;
    if (altIdx === -1) return clearIdx;
    return Math.min(clearIdx, altIdx);
  }

  private getBoundaryLength(data: string, index: number): number {
    // Check what boundary we found and return its length
    if (data.substring(index).startsWith(CLEAR_SCREEN)) {
      // Check if followed by cursor home
      if (data.substring(index + CLEAR_SCREEN.length).startsWith("\x1b[H")) {
        return CLEAR_SCREEN.length + 3; // \x1b[2J\x1b[H
      }
      return CLEAR_SCREEN.length;
    }
    if (data.substring(index).startsWith(ALT_BUFFER_ON)) {
      return ALT_BUFFER_ON.length;
    }
    return 0;
  }

  private scheduleStabilityFlush(): void {
    this.cancelStabilityTimer();

    const delay = this.isInteractive() ? INTERACTIVE_STABILITY_MS : STABILITY_MS;

    this.stabilityTimer = setTimeout(() => {
      this.stabilityTimer = null;
      this.cancelMaxHoldTimer();
      if (this.buffer.length > 0) {
        this.emit(this.buffer, "stable");
        this.buffer = "";
      }
    }, delay);
  }

  private cancelStabilityTimer(): void {
    if (this.stabilityTimer) {
      clearTimeout(this.stabilityTimer);
      this.stabilityTimer = null;
    }
  }

  private scheduleMaxHoldFlush(): void {
    this.cancelMaxHoldTimer();

    this.maxHoldTimer = setTimeout(() => {
      this.maxHoldTimer = null;
      if (this.buffer.length > 0) {
        this.cancelStabilityTimer();
        this.emit(this.buffer, "max-hold");
        this.buffer = "";
      }
    }, MAX_HOLD_MS);
  }

  private cancelMaxHoldTimer(): void {
    if (this.maxHoldTimer) {
      clearTimeout(this.maxHoldTimer);
      this.maxHoldTimer = null;
    }
  }

  private emit(data: string, reason: string): void {
    if (!data || !this.emitCallback) return;

    this.emitCallback(data);
    this.framesEmitted++;

    if (this.verbose) {
      console.log(
        `[FrameStabilizer] Emit #${this.framesEmitted}: ${data.length} bytes (${reason})`
      );
    }
  }

  private isInteractive(): boolean {
    return Date.now() < this.interactiveUntil;
  }

  getDebugState(): {
    hasPending: boolean;
    pendingBytes: number;
    framesEmitted: number;
    isInteractive: boolean;
  } {
    return {
      hasPending: this.buffer.length > 0,
      pendingBytes: this.buffer.length,
      framesEmitted: this.framesEmitted,
      isInteractive: this.isInteractive(),
    };
  }
}
