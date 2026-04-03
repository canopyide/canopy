import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PortBatcher, type PortBatcherDeps } from "../portBatcher.js";
import type { PortQueueManager } from "../portQueue.js";

const PORT_BATCH_THRESHOLD_BYTES = 64 * 1024;

function createMockQueueManager() {
  return {
    isAtCapacity: vi.fn(() => false),
    addBytes: vi.fn(),
    getUtilization: vi.fn(() => 0),
    applyBackpressure: vi.fn(),
  } as unknown as PortQueueManager;
}

function createDeps(overrides?: Partial<PortBatcherDeps>): PortBatcherDeps {
  return {
    portQueueManager: createMockQueueManager(),
    postMessage: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

describe("PortBatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("latency mode: flushes on setImmediate with correct data", () => {
    const deps = createDeps();
    const batcher = new PortBatcher(deps);

    const result = batcher.write("t1", "hello", 5);
    expect(result).toBe(true);
    expect(deps.postMessage).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(deps.postMessage).toHaveBeenCalledOnce();
    expect(deps.postMessage).toHaveBeenCalledWith("t1", "hello", 5);
    expect(deps.portQueueManager.addBytes).toHaveBeenCalledWith("t1", 5);
  });

  it("throughput upgrade: second chunk before immediate switches to setTimeout(16)", () => {
    const deps = createDeps();
    const batcher = new PortBatcher(deps);

    batcher.write("t1", "aaa", 3);
    batcher.write("t1", "bbb", 3);

    // Advance less than 16ms — should not flush yet
    vi.advanceTimersByTime(10);
    expect(deps.postMessage).not.toHaveBeenCalled();

    // Advance to 16ms — should flush
    vi.advanceTimersByTime(6);
    expect(deps.postMessage).toHaveBeenCalledOnce();
    expect(deps.postMessage).toHaveBeenCalledWith("t1", "aaabbb", 6);
  });

  it("no double-upgrade: third chunk in throughput mode does not reschedule", () => {
    const deps = createDeps();
    const batcher = new PortBatcher(deps);

    batcher.write("t1", "a", 1);
    batcher.write("t1", "b", 1); // upgrade to throughput
    batcher.write("t1", "c", 1); // no reschedule

    vi.advanceTimersByTime(16);
    expect(deps.postMessage).toHaveBeenCalledOnce();
    expect(deps.postMessage).toHaveBeenCalledWith("t1", "abc", 3);
  });

  it("threshold bypass: sync flush when bytes exceed 64KB", () => {
    const deps = createDeps();
    const batcher = new PortBatcher(deps);

    const bigData = "x".repeat(PORT_BATCH_THRESHOLD_BYTES);
    batcher.write("t1", bigData, PORT_BATCH_THRESHOLD_BYTES);

    // Should have flushed synchronously — no timer needed
    expect(deps.postMessage).toHaveBeenCalledOnce();
    expect(deps.postMessage).toHaveBeenCalledWith("t1", bigData, PORT_BATCH_THRESHOLD_BYTES);

    // No pending timers
    expect(vi.getTimerCount()).toBe(0);
  });

  it("multi-terminal grouping: interleaved writes produce separate postMessages", () => {
    const deps = createDeps();
    const batcher = new PortBatcher(deps);

    batcher.write("t1", "a1", 2);
    batcher.write("t2", "b1", 2);
    batcher.write("t1", "a2", 2);

    vi.runAllTimers();

    expect(deps.postMessage).toHaveBeenCalledTimes(2);
    expect(deps.postMessage).toHaveBeenCalledWith("t1", "a1a2", 4);
    expect(deps.postMessage).toHaveBeenCalledWith("t2", "b1", 2);
  });

  it("capacity gating: returns false when portQueueManager is at capacity", () => {
    const qm = createMockQueueManager();
    (qm.isAtCapacity as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const deps = createDeps({ portQueueManager: qm });
    const batcher = new PortBatcher(deps);

    const result = batcher.write("t1", "data", 4);
    expect(result).toBe(false);
    expect(deps.postMessage).not.toHaveBeenCalled();
  });

  it("pending byte reservation: capacity check includes buffered bytes", () => {
    const qm = createMockQueueManager();
    (qm.isAtCapacity as ReturnType<typeof vi.fn>).mockImplementation(
      (_id: string, bytes: number) => bytes > 100
    );
    const deps = createDeps({ portQueueManager: qm });
    const batcher = new PortBatcher(deps);

    // First write of 80 bytes succeeds (80 <= 100)
    expect(batcher.write("t1", "x".repeat(80), 80)).toBe(true);
    // Second write of 30 bytes should fail (80 + 30 = 110 > 100)
    expect(batcher.write("t1", "y".repeat(30), 30)).toBe(false);
  });

  it("flushTerminal: flushes only the specified terminal", () => {
    const deps = createDeps();
    const batcher = new PortBatcher(deps);

    batcher.write("t1", "aaa", 3);
    batcher.write("t2", "bbb", 3);

    batcher.flushTerminal("t1");

    expect(deps.postMessage).toHaveBeenCalledOnce();
    expect(deps.postMessage).toHaveBeenCalledWith("t1", "aaa", 3);

    // t2 is still buffered, flushes on timer
    vi.runAllTimers();
    expect(deps.postMessage).toHaveBeenCalledTimes(2);
    expect(deps.postMessage).toHaveBeenCalledWith("t2", "bbb", 3);
  });

  it("flushTerminal on non-existent id is a no-op", () => {
    const deps = createDeps();
    const batcher = new PortBatcher(deps);

    batcher.flushTerminal("nonexistent");
    expect(deps.postMessage).not.toHaveBeenCalled();
  });

  it("postMessage error calls onError and stops flushing remaining terminals", () => {
    const deps = createDeps();
    (deps.postMessage as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("port closed");
    });
    const batcher = new PortBatcher(deps);

    batcher.write("t1", "data", 4);
    vi.runAllTimers();

    expect(deps.onError).toHaveBeenCalledOnce();
    expect(deps.onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("flush on empty buffer is a no-op", () => {
    const deps = createDeps();
    const batcher = new PortBatcher(deps);

    batcher.flush();
    expect(deps.postMessage).not.toHaveBeenCalled();
  });

  it("dispose cancels pending timers and rejects further writes", () => {
    const deps = createDeps();
    const batcher = new PortBatcher(deps);

    batcher.write("t1", "data", 4);
    batcher.dispose();

    expect(vi.getTimerCount()).toBe(0);
    expect(batcher.write("t1", "more", 4)).toBe(false);
  });

  it("dispose is safe to call twice", () => {
    const deps = createDeps();
    const batcher = new PortBatcher(deps);

    batcher.dispose();
    batcher.dispose();
    // No error thrown
  });

  it("addBytes is called only at flush time, not during write", () => {
    const deps = createDeps();
    const batcher = new PortBatcher(deps);

    batcher.write("t1", "data", 4);
    expect(deps.portQueueManager.addBytes).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(deps.portQueueManager.addBytes).toHaveBeenCalledWith("t1", 4);
  });

  it("single chunk optimization: avoids join for single-chunk flush", () => {
    const deps = createDeps();
    const batcher = new PortBatcher(deps);

    batcher.write("t1", "single", 6);
    vi.runAllTimers();

    // Verify the exact string passed (not a joined array)
    expect(deps.postMessage).toHaveBeenCalledWith("t1", "single", 6);
  });

  it("threshold accumulation: multiple small writes trigger sync flush at threshold", () => {
    const deps = createDeps();
    const batcher = new PortBatcher(deps);

    const chunkSize = 32 * 1024;
    const chunk = "x".repeat(chunkSize);

    batcher.write("t1", chunk, chunkSize); // 32KB — latency mode
    expect(deps.postMessage).not.toHaveBeenCalled();

    batcher.write("t1", chunk, chunkSize); // 64KB — triggers sync flush
    expect(deps.postMessage).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
