// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { useFleetBroadcastProgressStore } from "../fleetBroadcastProgressStore";

describe("fleetBroadcastProgressStore", () => {
  beforeEach(() => {
    useFleetBroadcastProgressStore.setState({
      completed: 0,
      total: 0,
      failed: 0,
      isActive: false,
      cancelled: false,
    });
  });

  it("init snapshots total, resets counters, and sets isActive", () => {
    useFleetBroadcastProgressStore.getState().init(15);
    const s = useFleetBroadcastProgressStore.getState();
    expect(s.total).toBe(15);
    expect(s.completed).toBe(0);
    expect(s.failed).toBe(0);
    expect(s.isActive).toBe(true);
    expect(s.cancelled).toBe(false);
  });

  it("advance accumulates completed and failed counts", () => {
    useFleetBroadcastProgressStore.getState().init(15);
    useFleetBroadcastProgressStore.getState().advance(5, 1);
    expect(useFleetBroadcastProgressStore.getState().completed).toBe(5);
    expect(useFleetBroadcastProgressStore.getState().failed).toBe(1);

    useFleetBroadcastProgressStore.getState().advance(5, 2);
    expect(useFleetBroadcastProgressStore.getState().completed).toBe(10);
    expect(useFleetBroadcastProgressStore.getState().failed).toBe(3);
  });

  it("clamps completed to total", () => {
    useFleetBroadcastProgressStore.getState().init(10);
    useFleetBroadcastProgressStore.getState().advance(12, 0);
    expect(useFleetBroadcastProgressStore.getState().completed).toBe(10);
  });

  it("clamps failed to completed", () => {
    useFleetBroadcastProgressStore.getState().init(10);
    useFleetBroadcastProgressStore.getState().advance(5, 10);
    expect(useFleetBroadcastProgressStore.getState().failed).toBe(5);
  });

  it("finish sets isActive to false", () => {
    useFleetBroadcastProgressStore.getState().init(10);
    expect(useFleetBroadcastProgressStore.getState().isActive).toBe(true);
    useFleetBroadcastProgressStore.getState().finish();
    expect(useFleetBroadcastProgressStore.getState().isActive).toBe(false);
  });

  it("back-to-back init resets state cleanly", () => {
    useFleetBroadcastProgressStore.getState().init(10);
    useFleetBroadcastProgressStore.getState().advance(5, 1);
    useFleetBroadcastProgressStore.getState().init(20);
    expect(useFleetBroadcastProgressStore.getState().total).toBe(20);
    expect(useFleetBroadcastProgressStore.getState().completed).toBe(0);
    expect(useFleetBroadcastProgressStore.getState().failed).toBe(0);
    expect(useFleetBroadcastProgressStore.getState().isActive).toBe(true);
  });

  it("cancel sets cancelled without changing isActive", () => {
    useFleetBroadcastProgressStore.getState().init(10);
    useFleetBroadcastProgressStore.getState().cancel();
    const s = useFleetBroadcastProgressStore.getState();
    expect(s.cancelled).toBe(true);
    expect(s.isActive).toBe(true);
  });

  it("finishCancelled sets isActive false and cancelled true", () => {
    useFleetBroadcastProgressStore.getState().init(10);
    useFleetBroadcastProgressStore.getState().finishCancelled();
    const s = useFleetBroadcastProgressStore.getState();
    expect(s.isActive).toBe(false);
    expect(s.cancelled).toBe(true);
  });

  it("init clears cancelled from a prior cancelled run", () => {
    useFleetBroadcastProgressStore.getState().init(10);
    useFleetBroadcastProgressStore.getState().finishCancelled();
    expect(useFleetBroadcastProgressStore.getState().cancelled).toBe(true);
    useFleetBroadcastProgressStore.getState().init(5);
    expect(useFleetBroadcastProgressStore.getState().cancelled).toBe(false);
  });
});
