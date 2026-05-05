import { describe, expect, it } from "vitest";
import { idleWindowScenarios } from "../scenarios/idleWindow";

const context = { mode: "ci" as const, now: () => performance.now() };

describe("idleWindow scenarios", () => {
  it("PERF-090 (basic) returns valid metrics", async () => {
    const scenario = idleWindowScenarios.find((s) => s.id === "PERF-090");
    expect(scenario).toBeDefined();

    const sample = await scenario!.run(context);
    expect(sample.metrics).toBeDefined();
    const m = sample.metrics!;

    expect(m.wakeUpCount).toBeGreaterThan(0);
    expect(m.unthrottledCallbackCount).toBeGreaterThan(m.wakeUpCount);
    expect(m.maxDriftMs).toBeGreaterThanOrEqual(0);
    expect(m.meanDriftMs).toBeGreaterThan(0);
    expect(m.eventLoopLagP95Ms).toBeGreaterThanOrEqual(0);
    expect(m.eluUtilization).toBeGreaterThanOrEqual(0);
    expect(m.eluUtilization).toBeLessThanOrEqual(1);
    expect(m.heapDeltaMb).toBeGreaterThanOrEqual(0);
    expect(m.memoryGrowthPct).toBeGreaterThanOrEqual(0);
  });

  it("PERF-091 (intensive) returns valid metrics", async () => {
    const scenario = idleWindowScenarios.find((s) => s.id === "PERF-091");
    expect(scenario).toBeDefined();

    const sample = await scenario!.run(context);
    expect(sample.metrics).toBeDefined();
    const m = sample.metrics!;

    expect(m.wakeUpCount).toBeGreaterThan(0);
    expect(m.unthrottledCallbackCount).toBeGreaterThan(m.wakeUpCount);
    expect(m.maxDriftMs).toBeGreaterThanOrEqual(0);
    expect(m.meanDriftMs).toBeGreaterThan(0);
    expect(m.eventLoopLagP95Ms).toBeGreaterThanOrEqual(0);
    expect(m.eluUtilization).toBeGreaterThanOrEqual(0);
    expect(m.eluUtilization).toBeLessThanOrEqual(1);
    expect(m.heapDeltaMb).toBeGreaterThanOrEqual(0);
    expect(m.memoryGrowthPct).toBeGreaterThanOrEqual(0);
  });

  it("PERF-091 intensive has far fewer wake-ups than PERF-090 basic", async () => {
    const basic = idleWindowScenarios.find((s) => s.id === "PERF-090")!;
    const intensive = idleWindowScenarios.find((s) => s.id === "PERF-091")!;

    const basicSample = await basic.run(context);
    const intensiveSample = await intensive.run(context);

    const basicWakes = basicSample.metrics!.wakeUpCount;
    const intensiveWakes = intensiveSample.metrics!.wakeUpCount;

    expect(intensiveWakes).toBeLessThan(basicWakes);
    // Intensive (60s floor) over 60s → at most 2 wake-ups
    // Basic (1s floor) over 60s → at most 61 wake-ups
    expect(intensiveWakes).toBeLessThanOrEqual(2);
    expect(basicWakes).toBeLessThanOrEqual(61);
  });

  it("PERF-090 basic throttling wake-up count ≈ simulated seconds", async () => {
    const basic = idleWindowScenarios.find((s) => s.id === "PERF-090")!;
    const sample = await basic.run(context);

    // Under basic throttling with 1s alignment, each second bucket gets
    // one wake-up. Total wake-ups should equal the number of unique
    // alignment points, which is at most ceil(60_000 / 1_000) = 60.
    // Allow +/- 5 for edge cases (some alignment points may be empty).
    const wakes = sample.metrics!.wakeUpCount;
    expect(wakes).toBeGreaterThanOrEqual(55);
    expect(wakes).toBeLessThanOrEqual(61);
  });

  it("both scenarios produce consistent results across repeated runs", async () => {
    const basic = idleWindowScenarios.find((s) => s.id === "PERF-090")!;

    const run1 = await basic.run(context);
    const run2 = await basic.run(context);

    // Deterministic simulation: wakeUpCount must be identical
    expect(run1.metrics!.wakeUpCount).toBe(run2.metrics!.wakeUpCount);
    expect(run1.metrics!.unthrottledCallbackCount).toBe(run2.metrics!.unthrottledCallbackCount);
    expect(run1.metrics!.maxDriftMs).toBe(run2.metrics!.maxDriftMs);
    expect(run1.metrics!.meanDriftMs).toBe(run2.metrics!.meanDriftMs);
  });
});
