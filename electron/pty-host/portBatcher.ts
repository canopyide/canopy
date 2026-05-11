import {
  PORT_BATCH_THRESHOLD_BYTES,
  PORT_BATCH_THROUGHPUT_DELAY_MS,
} from "../services/pty/types.js";
import type { PortQueueManager } from "./portQueue.js";

export interface PortBatcherDeps {
  portQueueManager: PortQueueManager;
  postMessage: (id: string, data: Uint8Array, bytes: number) => void;
  onError: (error: unknown, failedBatches: PortBatcherFailedBatch[]) => void;
}

interface PendingTerminal {
  chunks: Uint8Array[];
  bytes: number;
  mode: FlushMode;
  immediateHandle: ReturnType<typeof setImmediate> | null;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

export interface PortBatcherFailedBatch {
  id: string;
  data: Uint8Array;
  bytes: number;
}

type FlushMode = "idle" | "latency" | "throughput";

export class PortBatcher {
  private pendingChunks = new Map<string, PendingTerminal>();
  private totalPendingBytes = 0;
  private disposed = false;

  constructor(private readonly deps: PortBatcherDeps) {}

  write(id: string, data: Uint8Array, byteCount: number): boolean {
    if (this.disposed) return false;

    const terminalPending = this.pendingChunks.get(id)?.bytes ?? 0;
    if (this.deps.portQueueManager.isAtCapacity(id, terminalPending + byteCount)) {
      // Flush any pending data for this terminal before rejecting to prevent
      // split-channel delivery (buffered data on MessagePort + rejected data on SAB/IPC)
      if (terminalPending > 0) {
        this.flushTerminal(id);
      }
      return false;
    }

    let entry = this.pendingChunks.get(id);
    if (!entry) {
      entry = {
        chunks: [],
        bytes: 0,
        mode: "idle",
        immediateHandle: null,
        timeoutHandle: null,
      };
      this.pendingChunks.set(id, entry);
    }
    entry.chunks.push(data);
    entry.bytes += byteCount;
    this.totalPendingBytes += byteCount;

    if (this.totalPendingBytes >= PORT_BATCH_THRESHOLD_BYTES) {
      this.flush();
      return true;
    }

    // Per-terminal flush cadence: each terminal owns its own (mode, immediate, timeout)
    // so a quiet terminal's first write isn't stalled by a busy sibling's throughput timer.
    if (entry.mode === "idle") {
      entry.immediateHandle = setImmediate(() => this.flush());
      entry.mode = "latency";
    } else if (entry.mode === "latency") {
      if (entry.immediateHandle !== null) {
        clearImmediate(entry.immediateHandle);
        entry.immediateHandle = null;
      }
      entry.timeoutHandle = setTimeout(() => this.flush(), PORT_BATCH_THROUGHPUT_DELAY_MS);
      entry.mode = "throughput";
    }
    // throughput mode: timer already scheduled, nothing to do

    return true;
  }

  flush(): void {
    const snapshot = this.pendingChunks;
    this.pendingChunks = new Map();
    this.totalPendingBytes = 0;

    // Cancel each entry's per-terminal handles before processing so callbacks
    // already-queued can't fire after the snapshot is drained.
    for (const entry of snapshot.values()) {
      this.cancelEntryTimers(entry);
    }

    const entries = Array.from(snapshot.entries());
    for (let i = 0; i < entries.length; i++) {
      const [id, { chunks, bytes }] = entries[i];
      let data: Uint8Array = new Uint8Array(0);
      try {
        data = mergeChunks(chunks, bytes);
        this.deps.postMessage(id, data, bytes);
        this.deps.portQueueManager.addBytes(id, bytes);
        this.deps.portQueueManager.applyBackpressure(
          id,
          this.deps.portQueueManager.getUtilization(id)
        );
      } catch (error) {
        const failedBatches: PortBatcherFailedBatch[] = [{ id, data, bytes }];
        for (const [failedId, pending] of entries.slice(i + 1)) {
          failedBatches.push({
            id: failedId,
            data: mergeChunks(pending.chunks, pending.bytes),
            bytes: pending.bytes,
          });
        }
        this.deps.onError(error, failedBatches);
        return;
      }
    }
  }

  flushTerminal(id: string): void {
    const entry = this.pendingChunks.get(id);
    if (!entry) return;

    this.cancelEntryTimers(entry);
    this.pendingChunks.delete(id);
    this.totalPendingBytes -= entry.bytes;

    let data: Uint8Array = new Uint8Array(0);
    try {
      data = mergeChunks(entry.chunks, entry.bytes);
      this.deps.postMessage(id, data, entry.bytes);
      this.deps.portQueueManager.addBytes(id, entry.bytes);
      this.deps.portQueueManager.applyBackpressure(
        id,
        this.deps.portQueueManager.getUtilization(id)
      );
    } catch (error) {
      this.deps.onError(error, [{ id, data, bytes: entry.bytes }]);
    }
  }

  dispose(): void {
    for (const entry of this.pendingChunks.values()) {
      this.cancelEntryTimers(entry);
    }
    this.pendingChunks.clear();
    this.totalPendingBytes = 0;
    this.disposed = true;
  }

  private cancelEntryTimers(entry: PendingTerminal): void {
    if (entry.immediateHandle !== null) {
      clearImmediate(entry.immediateHandle);
      entry.immediateHandle = null;
    }
    if (entry.timeoutHandle !== null) {
      clearTimeout(entry.timeoutHandle);
      entry.timeoutHandle = null;
    }
  }
}

// Concatenate chunks into a freshly-allocated Uint8Array whose ArrayBuffer is
// not aliased by any other Buffer. This is required so the caller can place
// `merged.buffer` in a postMessage transfer list — node-pty Buffers under 4KB
// share an 8KB pool slab, and transferring a slab-backed buffer would detach
// the slab and corrupt every other Buffer that aliases it (PR #4639).
function mergeChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}
