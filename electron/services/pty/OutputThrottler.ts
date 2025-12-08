import type * as pty from "node-pty";
import type { ActivityTier } from "../../../shared/types/pty-host.js";
import {
  SOFT_QUEUE_LIMIT_BYTES,
  HARD_QUEUE_LIMIT_BYTES,
  AGGRESSIVE_FLUSH_INTERVAL_MS,
  QUEUE_STATE_HYSTERESIS_MS,
  DEFAULT_MAX_QUEUE_SIZE,
  DEFAULT_MAX_QUEUE_BYTES,
  FLOOD_THRESHOLD_BYTES,
  FLOOD_RESUME_THRESHOLD,
} from "./types.js";

// Threshold for bulk data mode - when buffer exceeds this, wait longer to
// coalesce large outputs (like MCP dumps) into atomic frame updates.
const BULK_DATA_THRESHOLD_BYTES = 4096;
import { events } from "../events.js";

export type QueueState = "normal" | "soft" | "hard";

export type EmitFunction = (data: string | Uint8Array) => void;

export interface OutputThrottlerOptions {
  maxQueueSize?: number;
  maxQueueBytes?: number;
  title?: string;
}

/**
 * Handles output buffering, throttling, and flood protection for a terminal.
 * Uses Uint8Array buffers to minimize GC pressure during high-throughput output.
 * Manages both buffering mode (for hidden terminals) and IPC batch mode (for visible terminals).
 */
export class OutputThrottler {
  // Buffering mode state (for hidden terminals)
  private bufferingMode = false;
  private chunkQueue: Uint8Array[] = [];
  private queuedBytes = 0;
  private maxQueueSize: number;
  private maxQueueBytes: number;

  // IPC batching state (for visible terminals)
  private batchChunks: Uint8Array[] = [];
  private batchBytes = 0;

  // Text encoder for string-to-binary conversion (allocated once)
  private encoder = new TextEncoder();
  private batchTimer: NodeJS.Timeout | null = null;
  private activityTier: ActivityTier = "focused";
  private lastTierChangeAt = 0;

  // Watermark-based queue state
  private queueState: QueueState = "normal";
  private lastQueueStateChange: number;

  // Flood protection state
  private bytesThisSecond = 0;
  private isFlooded = false;
  private lastResumedAt = 0;

  private title?: string;

  constructor(
    private terminalId: string,
    private emitFn: EmitFunction,
    options: OutputThrottlerOptions = {}
  ) {
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    this.maxQueueBytes = options.maxQueueBytes ?? DEFAULT_MAX_QUEUE_BYTES;
    this.lastQueueStateChange = Date.now();
    this.title = options.title;
  }

  /**
   * Process incoming data, applying buffering or batching as needed.
   * Accepts string or Uint8Array input; normalizes to Uint8Array internally.
   * Returns true if data should be processed further, false if flooded.
   */
  write(data: string | Uint8Array): boolean {
    // Normalize to Uint8Array
    const bytes = typeof data === "string" ? this.encoder.encode(data) : data;

    // Track byte rate for flood protection
    this.bytesThisSecond += bytes.length;

    // Drop data if flooded
    if (this.isFlooded) {
      return false;
    }

    if (this.bufferingMode) {
      // Buffer data instead of emitting
      this.chunkQueue.push(bytes);
      this.queuedBytes += bytes.length;

      // Auto-flush if buffer exceeds limits
      if (this.chunkQueue.length >= this.maxQueueSize || this.queuedBytes >= this.maxQueueBytes) {
        this.flush();
      }
    } else {
      // Visible terminal: use watermark-based flow control
      const incomingBytes = this.enforceQueueLimits(bytes);
      this.batchChunks.push(bytes);
      this.batchBytes += incomingBytes;
      this.scheduleBatchFlush();
    }

    return true;
  }

  /**
   * Enable/disable buffering mode.
   * Buffering mode is used for hidden terminals to reduce IPC overhead.
   */
  setBuffering(enabled: boolean): void {
    if (this.bufferingMode === enabled) {
      return;
    }
    this.bufferingMode = enabled;
  }

  /**
   * Flush all buffered output (for hidden terminals).
   * Merges queued Uint8Array chunks efficiently and emits as binary.
   */
  flush(): void {
    if (this.chunkQueue.length === 0) {
      return;
    }

    const combined = this.concatChunks(this.chunkQueue, this.queuedBytes);
    this.chunkQueue = [];
    this.queuedBytes = 0;
    this.emitFn(combined);
  }

  /**
   * Flush the batch buffer (for visible terminals).
   * Merges batched Uint8Array chunks efficiently and emits as binary.
   */
  flushBatch(): void {
    if (this.batchChunks.length === 0) {
      return;
    }

    const combined = this.concatChunks(this.batchChunks, this.batchBytes);
    this.batchChunks = [];
    this.batchBytes = 0;

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    this.emitFn(combined);
  }

  /**
   * Set activity tier for IPC batching.
   * FOCUSED: immediate, VISIBLE: 100ms, BACKGROUND: 1000ms
   */
  setActivityTier(tier: ActivityTier): void {
    const previousTier = this.activityTier;
    if (previousTier === tier) {
      return;
    }

    const now = Date.now();
    // Debounce rapid tier changes (100ms)
    if (now - this.lastTierChangeAt < 100) {
      return;
    }

    this.activityTier = tier;
    this.lastTierChangeAt = now;

    // Handle tier changes when there's pending batch data
    if (this.batchChunks.length > 0) {
      const newDelay = this.getFlushDelay(tier);

      if (newDelay === 0) {
        if (this.batchTimer) {
          clearTimeout(this.batchTimer);
          this.batchTimer = null;
        }
        this.flushBatch();
      } else if (this.batchTimer) {
        const oldDelay = this.getFlushDelay(previousTier);
        if (newDelay < oldDelay) {
          clearTimeout(this.batchTimer);
          this.batchTimer = setTimeout(() => {
            this.flushBatch();
          }, newDelay);
        }
      }
    }
  }

  getActivityTier(): ActivityTier {
    return this.activityTier;
  }

  /**
   * Check and apply flood protection.
   * Call this once per second from the manager's flood check interval.
   */
  checkFlooding(ptyProcess: pty.IPty): { flooded: boolean; resumed: boolean } {
    const now = Date.now();
    let flooded = false;
    let resumed = false;

    // Capture interval bytes then reset for next window
    const intervalBytes = this.bytesThisSecond;
    this.bytesThisSecond = 0;

    if (intervalBytes > FLOOD_THRESHOLD_BYTES) {
      if (!this.isFlooded) {
        this.isFlooded = true;
        flooded = true;
        try {
          ptyProcess.pause();
        } catch {
          // Process may already be dead
        }

        const mbPerSecond = (intervalBytes / 1024 / 1024).toFixed(1);
        this.emitFn(
          `\r\n\x1b[31m[CANOPY] Output flood detected (${mbPerSecond} MB/s). Process paused to prevent crash.\x1b[0m\r\n`
        );

        events.emit("ui:notify", {
          type: "error",
          message: `Terminal ${this.title || this.terminalId} paused due to excessive output.`,
        });
      }
    } else if (this.isFlooded && intervalBytes < FLOOD_RESUME_THRESHOLD) {
      const timeSinceResume = now - this.lastResumedAt;
      if (timeSinceResume > 2000) {
        this.isFlooded = false;
        this.lastResumedAt = now;
        resumed = true;
        try {
          ptyProcess.resume();
        } catch {
          // Process may already be dead
        }

        this.emitFn(`\r\n\x1b[32m[CANOPY] Output rate normalized. Process resumed.\x1b[0m\r\n`);
      }
    }

    return { flooded, resumed };
  }

  isCurrentlyFlooded(): boolean {
    return this.isFlooded;
  }

  /**
   * Get buffering mode state.
   */
  isBuffering(): boolean {
    return this.bufferingMode;
  }

  /**
   * Get current queue state info.
   */
  getQueueState(): QueueState {
    return this.queueState;
  }

  getQueuedBytes(): number {
    return this.queuedBytes;
  }

  getBatchBytes(): number {
    return this.batchBytes;
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.chunkQueue = [];
    this.batchChunks = [];
  }

  /**
   * Clear all queued output buffers.
   * Used when terminal receives a clear command to prevent ghost text.
   */
  clear(): void {
    this.chunkQueue = [];
    this.queuedBytes = 0;
    this.batchChunks = [];
    this.batchBytes = 0;
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.queueState = "normal";
    this.lastQueueStateChange = Date.now();
  }

  private getFlushDelay(tier: ActivityTier): number {
    // Bulk data mode: if buffer is large (MCP dump, large output), wait longer
    // to coalesce into atomic frame updates and prevent tearing.
    if (this.batchBytes > BULK_DATA_THRESHOLD_BYTES) {
      return 16; // One frame - allows more data to arrive
    }

    switch (tier) {
      case "focused":
        // Small delay to coalesce PTY output (e.g., "clear + draw" sequences)
        // into single IPC packets, reducing TUI tearing in the renderer.
        // 4ms is well under frame time (16ms) so latency is imperceptible.
        return 4;
      case "visible":
        return 100;
      case "background":
        return 1000;
      default:
        return 100;
    }
  }

  private scheduleBatchFlush(): void {
    let delay: number;
    if (this.queueState === "hard") {
      delay = 0;
    } else if (this.queueState === "soft") {
      delay = AGGRESSIVE_FLUSH_INTERVAL_MS;
    } else {
      delay = this.getFlushDelay(this.activityTier);
    }

    // If timer exists and new delay is shorter, reschedule for faster flush
    if (this.batchTimer && delay === 0) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.batchTimer) {
      return;
    }

    if (delay === 0) {
      this.flushBatch();
    } else {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, delay);
    }
  }

  /**
   * Efficiently concatenate Uint8Array chunks.
   * Uses Buffer.concat in Node.js (C++ optimized) or manual copy in browser.
   */
  private concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
    if (chunks.length === 1) {
      return chunks[0];
    }

    // Node.js: use optimized C++ Buffer.concat
    if (typeof Buffer !== "undefined") {
      return Buffer.concat(chunks, totalLength);
    }

    // Browser fallback: manual concatenation
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  private enforceQueueLimits(incomingData: Uint8Array): number {
    const incomingBytes = incomingData.length;
    const totalBytes = this.batchBytes + incomingBytes;
    const now = Date.now();

    if (totalBytes > HARD_QUEUE_LIMIT_BYTES) {
      const previousState = this.queueState;
      this.queueState = "hard";
      this.lastQueueStateChange = now;

      const toDrop = totalBytes - HARD_QUEUE_LIMIT_BYTES;
      let droppedBytes = 0;
      let droppedChunks = 0;

      while (droppedBytes < toDrop && this.batchChunks.length > 0) {
        const chunk = this.batchChunks.shift()!;
        droppedBytes += chunk.length;
        this.batchBytes -= chunk.length;
        droppedChunks++;
      }

      if (incomingBytes > HARD_QUEUE_LIMIT_BYTES) {
        const previousBufferedBytes = this.batchBytes;
        this.batchChunks = [];
        this.batchBytes = 0;
        droppedBytes += previousBufferedBytes;
        const mbOversize = (incomingBytes / 1024 / 1024).toFixed(2);
        console.warn(
          `[OutputThrottler] Single chunk (${mbOversize} MB) exceeds hard limit for ${this.terminalId}. ` +
            `Discarding all buffered data.`
        );
      }

      if (droppedBytes > 0) {
        const mbDropped = (droppedBytes / 1024 / 1024).toFixed(2);
        console.warn(
          `[OutputThrottler] Hard queue limit reached for ${this.terminalId}. ` +
            `Dropped ${droppedChunks} chunks (${mbDropped} MB)`
        );

        if (previousState !== "hard") {
          events.emit("ui:notify", {
            type: "warning",
            message: `Terminal ${this.title || this.terminalId} output overflow. Older data dropped.`,
          });
        }
      }
    } else if (totalBytes > SOFT_QUEUE_LIMIT_BYTES) {
      if (this.queueState === "normal") {
        this.queueState = "soft";
        this.lastQueueStateChange = now;
      }
    } else {
      const timeSinceStateChange = now - this.lastQueueStateChange;
      if (this.queueState !== "normal" && timeSinceStateChange > QUEUE_STATE_HYSTERESIS_MS) {
        this.queueState = "normal";
        this.lastQueueStateChange = now;
      }
    }

    return incomingBytes;
  }
}
