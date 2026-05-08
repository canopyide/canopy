import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSharedBuffersMock } = vi.hoisted(() => ({
  getSharedBuffersMock: vi.fn(),
}));

vi.mock("@/clients", () => ({
  terminalClient: {
    getSharedBuffers: getSharedBuffersMock,
  },
}));

import { TerminalOutputIngestService } from "../TerminalOutputIngestService";

type WorkerMessage = { type: string };

class MockWorker {
  static instances: MockWorker[] = [];

  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public postMessage = vi.fn((_message: WorkerMessage) => {});
  public terminate = vi.fn(() => {});

  constructor() {
    MockWorker.instances.push(this);
  }
}

// HIGH_WATERMARK          = 128 * 1024 = 131072 bytes
// LOW_WATERMARK           =  32 * 1024 =  32768 bytes
// COALESCE_BATCH_CAP      = 256 * 1024 = 262144 bytes
// WRITE_CHUNK_BYTES       =  32 * 1024 =  32768 bytes
// chunkByteSize for strings = data.length

const WRITE_CHUNK = 32 * 1024;

type WriteCall = [string, string | Uint8Array];

const callsFor = (mock: ReturnType<typeof vi.fn>, terminalId: string): Array<string | Uint8Array> =>
  (mock.mock.calls as WriteCall[]).filter((c) => c[0] === terminalId).map((c) => c[1]);

const concatStringWrites = (mock: ReturnType<typeof vi.fn>, terminalId: string): string => {
  const out: string[] = [];
  for (const data of callsFor(mock, terminalId)) {
    if (typeof data !== "string") {
      throw new Error("expected string write");
    }
    out.push(data);
  }
  return out.join("");
};

const expectAllSlicesUnderCap = (mock: ReturnType<typeof vi.fn>, terminalId: string): void => {
  for (const data of callsFor(mock, terminalId)) {
    const size = typeof data === "string" ? data.length : data.byteLength;
    expect(size).toBeLessThanOrEqual(WRITE_CHUNK);
  }
};

// ceil(140000 / 32768) = 5
const SLICES_140K = Math.ceil(140_000 / WRITE_CHUNK);

describe("TerminalOutputIngestService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockWorker.instances = [];
    (globalThis as unknown as { Worker: typeof Worker }).Worker = MockWorker as never;
    (globalThis as unknown as { window: Window & typeof globalThis }).window = {
      ...(globalThis as unknown as { window?: Window & typeof globalThis }).window,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    } as Window & typeof globalThis;
  });

  it("does not enable SAB polling (intentionally disabled due to multi-view race)", async () => {
    const service = new TerminalOutputIngestService(() => {});

    await service.initialize();
    expect(service.isEnabled()).toBe(false);
    expect(service.isPolling()).toBe(false);

    await service.initialize();
    expect(service.isEnabled()).toBe(false);
    expect(service.isPolling()).toBe(false);
  });

  it("stopPolling clears buffered data without affecting reinitialization", async () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const largeData = "x".repeat(140_000);
    service.bufferData("term-1", largeData);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);
    expect(concatStringWrites(writeToTerminal, "term-1")).toBe(largeData);

    service.bufferData("term-1", "buffered");
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // stopPolling flushes buffered data
    service.stopPolling();
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K + 1);
    expect(concatStringWrites(writeToTerminal, "term-1")).toBe(largeData + "buffered");

    // Can reinitialize
    await service.initialize();
    expect(service.isEnabled()).toBe(false);
    expect(service.isPolling()).toBe(false);
  });

  it("writes immediately when idle and under watermark", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    service.bufferData("term-1", "hello");

    expect(writeToTerminal).toHaveBeenCalledTimes(1);
    expect(writeToTerminal).toHaveBeenCalledWith("term-1", "hello");
  });

  it("buffers when inFlightBytes exceed high watermark and drains on acknowledgment", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const largeData = "x".repeat(140_000);
    service.bufferData("term-1", largeData);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // Second write should be buffered (inFlightBytes = 140,000 > HIGH_WATERMARK)
    service.bufferData("term-1", "buffered");
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // Acknowledge enough bytes to drop below LOW_WATERMARK (32,768)
    service.notifyWriteComplete("term-1", 140_000);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K + 1);
    expect(concatStringWrites(writeToTerminal, "term-1")).toBe(largeData + "buffered");
  });

  it("coalesces queued string chunks into a single write on drain", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const largeData = "x".repeat(140_000);
    service.bufferData("term-1", largeData);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    service.bufferData("term-1", "a");
    service.bufferData("term-1", "b");
    service.bufferData("term-1", "c");
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // Coalesced "abc" is small (< WRITE_CHUNK) so it's emitted as a single write.
    service.notifyWriteComplete("term-1", 140_000);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K + 1);
    expect(writeToTerminal).toHaveBeenLastCalledWith("term-1", "abc");
  });

  it("caps coalesced batch at 256 KB and drains remainder on next acknowledgment", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const largeData = "x".repeat(140_000);
    service.bufferData("term-1", largeData);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // Queue 3 chunks of 150 KB each = 450 KB total, exceeds 256 KB cap
    const chunk150k = "a".repeat(150_000);
    service.bufferData("term-1", chunk150k);
    service.bufferData("term-1", chunk150k);
    service.bufferData("term-1", chunk150k);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    const slicesPer150k = Math.ceil(150_000 / WRITE_CHUNK);

    // Acknowledge first write to trigger drain.
    // First batch: do-while takes the first 150k chunk, second chunk would push past 256K cap.
    service.notifyWriteComplete("term-1", 140_000);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K + slicesPer150k);
    expectAllSlicesUnderCap(writeToTerminal, "term-1");

    // Acknowledge to drain the next batch (next 150k chunk).
    service.notifyWriteComplete("term-1", 150_000);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K + 2 * slicesPer150k);

    // Acknowledge to drain the last 150k chunk.
    service.notifyWriteComplete("term-1", 150_000);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K + 3 * slicesPer150k);

    expect(concatStringWrites(writeToTerminal, "term-1")).toBe(
      largeData + chunk150k + chunk150k + chunk150k
    );
    expectAllSlicesUnderCap(writeToTerminal, "term-1");
  });

  it("slices a single oversized chunk into ≤32 KiB writes", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const largeData = "x".repeat(140_000);
    service.bufferData("term-1", largeData);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // Queue a single chunk > 256 KB
    const oversized = "z".repeat(400_000);
    service.bufferData("term-1", oversized);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    const slicesOversized = Math.ceil(400_000 / WRITE_CHUNK);

    // Acknowledge to drain — single chunk takes the length===1 fast path in coalesceBatch
    // but is sliced to ≤32 KiB inside writeSliced.
    service.notifyWriteComplete("term-1", 140_000);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K + slicesOversized);
    expectAllSlicesUnderCap(writeToTerminal, "term-1");
    expect(concatStringWrites(writeToTerminal, "term-1")).toBe(largeData + oversized);
  });

  it("slices a coalesced 256 KiB batch into eight 32 KiB writes", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const largeData = "x".repeat(140_000);
    service.bufferData("term-1", largeData);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // Queue chunks totaling exactly 262144 bytes (COALESCE_BATCH_CAP_BYTES)
    const chunkA = "a".repeat(131_072);
    const chunkB = "b".repeat(131_072);
    service.bufferData("term-1", chunkA);
    service.bufferData("term-1", chunkB);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // 262144 / 32768 = 8 slices exactly.
    service.notifyWriteComplete("term-1", 140_000);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K + 8);
    expectAllSlicesUnderCap(writeToTerminal, "term-1");

    // Each slice from the 256 KiB batch should be exactly 32 KiB.
    for (let i = SLICES_140K; i < SLICES_140K + 8; i++) {
      const slice = (writeToTerminal.mock.calls[i]![1] as string).length;
      expect(slice).toBe(WRITE_CHUNK);
    }

    expect(concatStringWrites(writeToTerminal, "term-1")).toBe(largeData + chunkA + chunkB);
  });

  it("caps coalesced batch correctly with many small chunks", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const largeData = "x".repeat(140_000);
    service.bufferData("term-1", largeData);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // Queue 500 chunks of 1024 bytes each = 512 KB total (> 256 KB cap)
    for (let i = 0; i < 500; i++) {
      service.bufferData("term-1", "a".repeat(1024));
    }
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // First batch: 256 KB capped, sliced into 8 × 32 KiB writes.
    service.notifyWriteComplete("term-1", 140_000);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K + 8);
    expectAllSlicesUnderCap(writeToTerminal, "term-1");

    // Acknowledge to drain remainder (244 KiB → ceil(244/32) = 8 slices).
    service.notifyWriteComplete("term-1", 256 * 1024);
    expect(writeToTerminal).toHaveBeenCalledTimes(
      SLICES_140K + 8 + Math.ceil((244 * 1024) / WRITE_CHUNK)
    );

    // Each call from the small-chunks batch must be ≤ 32 KiB.
    expectAllSlicesUnderCap(writeToTerminal, "term-1");

    // Total bytes preserved: 140k + 500 × 1024.
    const totalCharsWritten = callsFor(writeToTerminal, "term-1").reduce(
      (sum, data) => sum + (data as string).length,
      0
    );
    expect(totalCharsWritten).toBe(140_000 + 500 * 1024);
  });

  it("forceDrain bypasses cap but still slices writes ≤ WRITE_CHUNK_BYTES", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const largeData = "x".repeat(140_000);
    service.bufferData("term-1", largeData);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // Queue 400 KB across multiple chunks (exceeds 256 KB cap)
    const chunk200k = "b".repeat(200_000);
    service.bufferData("term-1", chunk200k);
    service.bufferData("term-1", chunk200k);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // forceDrain joins all queued strings (400k) and slices to ≤ WRITE_CHUNK each.
    service.flushForTerminal("term-1");
    const flushSlices = Math.ceil(400_000 / WRITE_CHUNK);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K + flushSlices);
    expectAllSlicesUnderCap(writeToTerminal, "term-1");
    expect(concatStringWrites(writeToTerminal, "term-1")).toBe(largeData + chunk200k + chunk200k);
  });

  it("defers drain via setTimeout for ink erase-line sequences", () => {
    vi.useFakeTimers();
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    service.bufferData("term-1", "\x1b[2K");
    expect(writeToTerminal).toHaveBeenCalledTimes(1);
    expect(writeToTerminal).toHaveBeenCalledWith("term-1", "\x1b[2K");

    // Acknowledge previous write
    service.notifyWriteComplete("term-1", 100);

    // Second half completes the ink pattern — drain deferred via setTimeout(0)
    service.bufferData("term-1", "\x1b[1Acontent");
    expect(writeToTerminal).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(0);
    expect(writeToTerminal).toHaveBeenCalledTimes(2);
    expect(writeToTerminal).toHaveBeenCalledWith("term-1", "\x1b[1Acontent");

    vi.useRealTimers();
  });

  it("notifyParsed triggers drain when buffered data exists and under high watermark", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const largeData = "x".repeat(140_000);
    service.bufferData("term-1", largeData);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    service.bufferData("term-1", "residual");
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // Partially acknowledge — drops inFlightBytes to 40,000 (above LOW but below HIGH)
    service.notifyWriteComplete("term-1", 100_000);
    // notifyWriteComplete should NOT drain because 40,000 > LOW_WATERMARK (32,768)
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    // notifyParsed should drain because inFlightBytes (40,000) < HIGH_WATERMARK
    service.notifyParsed("term-1");
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K + 1);
    expect(writeToTerminal).toHaveBeenLastCalledWith("term-1", "residual");
  });

  it("flushForTerminal writes pending buffer immediately regardless of watermark", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const largeData = "x".repeat(140_000);
    service.bufferData("term-1", largeData);
    service.bufferData("term-1", "a");
    service.bufferData("term-1", "b");
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    service.flushForTerminal("term-1");
    expect(writeToTerminal).toHaveBeenLastCalledWith("term-1", "ab");
  });

  it("resetForTerminal drops pending buffer without writing", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const largeData = "x".repeat(140_000);
    service.bufferData("term-1", largeData);
    service.bufferData("term-1", "pending");
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);

    service.resetForTerminal("term-1");

    // Acknowledge won't cause drain since queue was cleared
    service.notifyWriteComplete("term-1", 200_000);
    expect(writeToTerminal).toHaveBeenCalledTimes(SLICES_140K);
  });

  it("handles Uint8Array data correctly", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const data = new Uint8Array([72, 101, 108, 108, 111]);
    service.bufferData("term-1", data);

    expect(writeToTerminal).toHaveBeenCalledTimes(1);
    expect(writeToTerminal).toHaveBeenCalledWith("term-1", data);
  });

  it("slices oversized Uint8Array via subarray (zero-copy) into ≤32 KiB writes", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const oversized = new Uint8Array(100_000);
    for (let i = 0; i < oversized.byteLength; i++) {
      oversized[i] = i & 0xff;
    }
    service.bufferData("term-1", oversized);

    const expectedSlices = Math.ceil(oversized.byteLength / WRITE_CHUNK);
    expect(writeToTerminal).toHaveBeenCalledTimes(expectedSlices);

    const slices = callsFor(writeToTerminal, "term-1");
    let totalBytes = 0;
    const reconstructed = new Uint8Array(oversized.byteLength);
    let offset = 0;
    for (const slice of slices) {
      if (typeof slice === "string") {
        throw new Error("expected Uint8Array");
      }
      expect(slice.byteLength).toBeLessThanOrEqual(WRITE_CHUNK);
      // subarray() shares the underlying ArrayBuffer (zero-copy).
      expect(slice.buffer).toBe(oversized.buffer);
      reconstructed.set(slice, offset);
      offset += slice.byteLength;
      totalBytes += slice.byteLength;
    }
    expect(totalBytes).toBe(oversized.byteLength);
    expect(reconstructed).toEqual(oversized);
  });

  it("does not split surrogate pairs at slice boundaries", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    // Build a 33 KiB string where a surrogate pair (U+1F600 😀 = D83D DE00) straddles
    // the natural 32 KiB cut point (positions 32767 and 32768 in UTF-16).
    const filler = "a".repeat(WRITE_CHUNK - 1); // 32767 'a's
    const surrogate = String.fromCodePoint(0x1f600); // 2 UTF-16 code units
    const tail = "b".repeat(100);
    const data = filler + surrogate + tail;
    expect(data.length).toBe(WRITE_CHUNK - 1 + 2 + 100);
    expect(data.charCodeAt(WRITE_CHUNK - 1)).toBeGreaterThanOrEqual(0xd800);
    expect(data.charCodeAt(WRITE_CHUNK - 1)).toBeLessThanOrEqual(0xdbff);

    service.bufferData("term-1", data);

    const calls = callsFor(writeToTerminal, "term-1");
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // First slice should include the full surrogate pair (advanced by 1 char).
    const firstSlice = calls[0] as string;
    expect(firstSlice.length).toBe(WRITE_CHUNK + 1);
    // Last char of first slice should be the low surrogate.
    const lastCode = firstSlice.charCodeAt(firstSlice.length - 1);
    expect(lastCode).toBeGreaterThanOrEqual(0xdc00);
    expect(lastCode).toBeLessThanOrEqual(0xdfff);
    // Total content preserved.
    expect(concatStringWrites(writeToTerminal, "term-1")).toBe(data);
  });

  it("emits all slices from one batch unconditionally even when crossing high watermark mid-batch", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    // Single 200 KB chunk: coalesceBatch returns it via the length===1 fast path,
    // then writeSliced emits 7 × 32 KiB slices. Even though inFlightBytes climbs past
    // HIGH_WATERMARK (128 KB) after the 5th slice, all slices must still fire — otherwise
    // already-dequeued data is lost.
    const oversized = "z".repeat(200_000);
    service.bufferData("term-1", oversized);

    const expectedSlices = Math.ceil(200_000 / WRITE_CHUNK);
    expect(writeToTerminal).toHaveBeenCalledTimes(expectedSlices);
    expectAllSlicesUnderCap(writeToTerminal, "term-1");
    expect(concatStringWrites(writeToTerminal, "term-1")).toBe(oversized);
  });

  it("isolates queues per terminal", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const largeData = "x".repeat(140_000);
    service.bufferData("term-1", largeData);
    service.bufferData("term-1", "buffered-1");

    // term-2 should still write immediately (separate queue)
    service.bufferData("term-2", "hello-2");

    expect(callsFor(writeToTerminal, "term-1").length).toBe(SLICES_140K);
    expect(callsFor(writeToTerminal, "term-2").length).toBe(1);
    expect(concatStringWrites(writeToTerminal, "term-1")).toBe(largeData);
    expect(writeToTerminal).toHaveBeenCalledWith("term-2", "hello-2");
  });

  it("respects watermark bounds during rapid sequential data delivery", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    const largeData = "x".repeat(140_000);
    service.bufferData("term-1", largeData);
    expect(callsFor(writeToTerminal, "term-1").length).toBe(SLICES_140K);

    // Rapid data on term-1 while above watermark
    service.bufferData("term-1", "batch-1");
    service.bufferData("term-1", "batch-2");
    service.bufferData("term-1", "batch-3");
    expect(callsFor(writeToTerminal, "term-1").length).toBe(SLICES_140K);

    // Rapid data on term-2 (separate queue, should write immediately)
    service.bufferData("term-2", "immediate");
    expect(writeToTerminal).toHaveBeenCalledWith("term-2", "immediate");

    // Acknowledge to drain term-1's batch — coalesces "batch-1batch-2batch-3" (small) into 1 write.
    service.notifyWriteComplete("term-1", 140_000);
    expect(callsFor(writeToTerminal, "term-1").length).toBe(SLICES_140K + 1);
    expect(writeToTerminal).toHaveBeenCalledWith("term-1", "batch-1batch-2batch-3");
  });

  it("notifyWriteComplete is a no-op for unknown terminals", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    // Should not throw
    service.notifyWriteComplete("unknown", 1000);
    expect(writeToTerminal).not.toHaveBeenCalled();
  });

  it("notifyParsed is a no-op when no buffered data exists", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    service.bufferData("term-1", "hello");
    expect(writeToTerminal).toHaveBeenCalledTimes(1);

    // No buffered data — notifyParsed should be a no-op
    service.notifyParsed("term-1");
    expect(writeToTerminal).toHaveBeenCalledTimes(1);
  });

  it("per-slice notifyWriteComplete keeps inFlightBytes balanced and resumes drain", () => {
    const writeToTerminal = vi.fn();
    const service = new TerminalOutputIngestService(writeToTerminal);

    // First batch: 200k → 7 slices, inFlightBytes climbs to 200k.
    const first = "x".repeat(200_000);
    service.bufferData("term-1", first);
    const firstSlices = Math.ceil(200_000 / WRITE_CHUNK);
    expect(callsFor(writeToTerminal, "term-1").length).toBe(firstSlices);

    // Now buffer additional data — should NOT drain since inFlightBytes (200k) > HIGH (128k).
    service.bufferData("term-1", "second");
    expect(callsFor(writeToTerminal, "term-1").length).toBe(firstSlices);

    // Ack each slice's bytes individually (mirrors how TerminalWriteController fires
    // the callback per `terminal.write()` call).
    const sliceSizes = (callsFor(writeToTerminal, "term-1") as string[]).map((s) => s.length);
    let totalAcked = 0;
    let drained = false;
    for (const size of sliceSizes) {
      service.notifyWriteComplete("term-1", size);
      totalAcked += size;
      if (callsFor(writeToTerminal, "term-1").length === firstSlices + 1) {
        drained = true;
        break;
      }
    }
    expect(drained).toBe(true);
    expect(totalAcked).toBeLessThanOrEqual(200_000);
    expect(writeToTerminal).toHaveBeenCalledWith("term-1", "second");
  });
});
