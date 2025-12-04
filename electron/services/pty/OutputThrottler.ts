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
import { events } from "../events.js";

export type QueueState = "normal" | "soft" | "hard";

export interface OutputThrottlerOptions {
  maxQueueSize?: number;
  maxQueueBytes?: number;
  title?: string;
}

/**
 * Handles output buffering, throttling, and flood protection for a terminal.
 * Manages both buffering mode (for hidden terminals) and IPC batch mode (for visible terminals).
 */
export class OutputThrottler {
  // Buffering mode state (for hidden terminals)
  private bufferingMode = false;
  private outputQueue: string[] = [];
  private queuedBytes = 0;
  private maxQueueSize: number;
  private maxQueueBytes: number;

  // IPC batching state (for visible terminals)
  private batchBuffer: string[] = [];
  private batchBytes = 0;
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
    private emitFn: (data: string) => void,
    options: OutputThrottlerOptions = {}
  ) {
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    this.maxQueueBytes = options.maxQueueBytes ?? DEFAULT_MAX_QUEUE_BYTES;
    this.lastQueueStateChange = Date.now();
    this.title = options.title;
  }

  /**
   * Process incoming data, applying buffering or batching as needed.
   * Returns true if data should be processed further, false if flooded.
   */
  write(data: string): boolean {
    // Track byte rate for flood protection
    this.bytesThisSecond += data.length;

    // Drop data if flooded
    if (this.isFlooded) {
      return false;
    }

    if (this.bufferingMode) {
      // Buffer data instead of emitting
      this.outputQueue.push(data);
      this.queuedBytes += data.length;

      // Auto-flush if buffer exceeds limits
      if (this.outputQueue.length >= this.maxQueueSize || this.queuedBytes >= this.maxQueueBytes) {
        this.flush();
      }
    } else {
      // Visible terminal: use watermark-based flow control
      const incomingBytes = this.enforceQueueLimits(data);
      this.batchBuffer.push(data);
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
   */
  flush(): void {
    if (this.outputQueue.length === 0) {
      return;
    }

    const combined = this.outputQueue.join("");
    this.outputQueue = [];
    this.queuedBytes = 0;
    this.emitFn(combined);
  }

  /**
   * Flush the batch buffer (for visible terminals).
   */
  flushBatch(): void {
    if (this.batchBuffer.length === 0) {
      return;
    }

    const combined = this.batchBuffer.join("");
    this.batchBuffer = [];
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
    if (this.batchBuffer.length > 0) {
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
    this.outputQueue = [];
    this.batchBuffer = [];
  }

  private getFlushDelay(tier: ActivityTier): number {
    switch (tier) {
      case "focused":
        return 0;
      case "visible":
        return 100;
      case "background":
        return 1000;
      default:
        return 100;
    }
  }

  private scheduleBatchFlush(): void {
    if (this.batchTimer) {
      return;
    }

    let delay: number;
    if (this.queueState === "hard") {
      delay = 0;
    } else if (this.queueState === "soft") {
      delay = AGGRESSIVE_FLUSH_INTERVAL_MS;
    } else {
      delay = this.getFlushDelay(this.activityTier);
    }

    if (delay === 0) {
      this.flushBatch();
    } else {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, delay);
    }
  }

  private enforceQueueLimits(incomingData: string): number {
    const incomingBytes = Buffer.byteLength(incomingData, "utf8");
    const totalBytes = this.batchBytes + incomingBytes;
    const now = Date.now();

    if (totalBytes > HARD_QUEUE_LIMIT_BYTES) {
      const previousState = this.queueState;
      this.queueState = "hard";
      this.lastQueueStateChange = now;

      const toDrop = totalBytes - HARD_QUEUE_LIMIT_BYTES;
      let droppedBytes = 0;
      let droppedChunks = 0;

      while (droppedBytes < toDrop && this.batchBuffer.length > 0) {
        const chunk = this.batchBuffer.shift()!;
        const chunkBytes = Buffer.byteLength(chunk, "utf8");
        droppedBytes += chunkBytes;
        this.batchBytes -= chunkBytes;
        droppedChunks++;
      }

      if (incomingBytes > HARD_QUEUE_LIMIT_BYTES) {
        this.batchBuffer = [];
        this.batchBytes = 0;
        droppedBytes += this.batchBytes;
        const mbOversize = (incomingBytes / 1024 / 1024).toFixed(2);
        console.warn(
          `[OutputThrottler] Single chunk (${mbOversize} MB) exceeds hard limit for ${this.terminalId}. ` +
            `Discarding all buffered data.`
        );
      }

      if (droppedBytes > 0 || previousState !== "hard") {
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
