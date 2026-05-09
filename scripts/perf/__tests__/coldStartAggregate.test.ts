import { describe, expect, it } from "vitest";
import { aggregate, type RunData } from "../lib/coldStartAggregate";
import { PERF_MARKS } from "../../../shared/perf/marks";

function makeRun(overrides: Partial<RunData>): RunData {
  return {
    index: 0,
    durationMs: 1000,
    marks: [],
    ...overrides,
  };
}

describe("cold-start aggregate", () => {
  it("emits null cls and osToAppBoot fields when no marks are present", () => {
    const agg = aggregate([
      makeRun({
        marks: [
          { mark: PERF_MARKS.APP_BOOT_START, timestamp: "t", elapsedMs: 0 },
          { mark: PERF_MARKS.RENDERER_READY, timestamp: "t", elapsedMs: 800 },
        ],
      }),
    ]);

    expect(agg.cls).toBeNull();
    expect(agg.osToAppBoot).toBeNull();
    expect(agg.loaf).toEqual({});
  });

  it("groups long-animation-frame blocking time by topScripts[0].sourceURL", () => {
    const agg = aggregate([
      makeRun({
        marks: [
          {
            mark: "renderer_long_animation_frame",
            timestamp: "t",
            elapsedMs: 100,
            meta: {
              blockingDurationMs: 60,
              topScripts: [{ sourceURL: "app://./assets/vendor-react-abc.js" }],
            },
          },
          {
            mark: "renderer_long_animation_frame",
            timestamp: "t",
            elapsedMs: 200,
            meta: {
              blockingDurationMs: 80,
              topScripts: [{ sourceURL: "app://./assets/vendor-react-abc.js" }],
            },
          },
          {
            mark: "renderer_long_animation_frame",
            timestamp: "t",
            elapsedMs: 300,
            meta: {
              blockingDurationMs: 30,
              topScripts: [{ sourceURL: "app://./assets/index-xyz.js" }],
            },
          },
        ],
      }),
    ]);

    expect(Object.keys(agg.loaf).sort()).toEqual([
      "app://./assets/index-xyz.js",
      "app://./assets/vendor-react-abc.js",
    ]);
    expect(agg.loaf["app://./assets/vendor-react-abc.js"].frames).toBe(2);
    expect(agg.loaf["app://./assets/vendor-react-abc.js"].totalBlockingMs).toBe(140);
    expect(agg.loaf["app://./assets/index-xyz.js"].totalBlockingMs).toBe(30);
  });

  it("treats NaN/Infinity blockingDurationMs as 0 to keep stats from being poisoned", () => {
    const agg = aggregate([
      makeRun({
        marks: [
          {
            mark: "renderer_long_animation_frame",
            timestamp: "t",
            elapsedMs: 100,
            meta: {
              blockingDurationMs: Number.NaN,
              topScripts: [{ sourceURL: "app://./assets/x.js" }],
            },
          },
          {
            mark: "renderer_long_animation_frame",
            timestamp: "t",
            elapsedMs: 200,
            meta: {
              blockingDurationMs: 50,
              topScripts: [{ sourceURL: "app://./assets/x.js" }],
            },
          },
        ],
      }),
    ]);

    const stats = agg.loaf["app://./assets/x.js"];
    expect(stats.frames).toBe(2);
    expect(Number.isFinite(stats.totalBlockingMs)).toBe(true);
    expect(stats.totalBlockingMs).toBe(50);
    expect(Number.isFinite(stats.p95BlockingMs)).toBe(true);
  });

  it("falls back to <unknown> bucket when topScripts is missing or empty", () => {
    const agg = aggregate([
      makeRun({
        marks: [
          {
            mark: "renderer_long_animation_frame",
            timestamp: "t",
            elapsedMs: 100,
            meta: { blockingDurationMs: 25, topScripts: [] },
          },
          {
            mark: "renderer_long_animation_frame",
            timestamp: "t",
            elapsedMs: 200,
            meta: { blockingDurationMs: 15 },
          },
        ],
      }),
    ]);

    expect(agg.loaf["<unknown>"].frames).toBe(2);
    expect(agg.loaf["<unknown>"].totalBlockingMs).toBe(40);
  });

  it("aggregates renderer_cls_final per run into p50/p95/mean/max", () => {
    const agg = aggregate([
      makeRun({
        index: 0,
        marks: [
          {
            mark: PERF_MARKS.RENDERER_CLS_FINAL,
            timestamp: "t",
            elapsedMs: 500,
            meta: { cumulativeCls: 0.02, sampleCount: 1 },
          },
        ],
      }),
      makeRun({
        index: 1,
        marks: [
          {
            mark: PERF_MARKS.RENDERER_CLS_FINAL,
            timestamp: "t",
            elapsedMs: 500,
            meta: { cumulativeCls: 0.06, sampleCount: 2 },
          },
        ],
      }),
      makeRun({
        index: 2,
        marks: [
          {
            mark: PERF_MARKS.RENDERER_CLS_FINAL,
            timestamp: "t",
            elapsedMs: 500,
            meta: { cumulativeCls: 0.1, sampleCount: 3 },
          },
        ],
      }),
    ]);

    expect(agg.cls).not.toBeNull();
    expect(agg.cls!.runs).toBe(3);
    expect(agg.cls!.max).toBeCloseTo(0.1, 4);
    expect(agg.cls!.p50).toBeCloseTo(0.06, 4);
  });

  it("uses the latest renderer_cls_final per run when emitted multiple times", () => {
    const agg = aggregate([
      makeRun({
        marks: [
          {
            mark: PERF_MARKS.RENDERER_CLS_FINAL,
            timestamp: "t",
            elapsedMs: 400,
            meta: { cumulativeCls: 0.03 },
          },
          {
            mark: PERF_MARKS.RENDERER_CLS_FINAL,
            timestamp: "t",
            elapsedMs: 600,
            meta: { cumulativeCls: 0.07 },
          },
        ],
      }),
    ]);

    expect(agg.cls!.max).toBeCloseTo(0.07, 4);
  });

  it("collects osToAppBootMs from APP_BOOT_START meta", () => {
    const agg = aggregate([
      makeRun({
        marks: [
          {
            mark: PERF_MARKS.APP_BOOT_START,
            timestamp: "t",
            elapsedMs: 0,
            meta: { osToAppBootMs: 850 },
          },
        ],
      }),
      makeRun({
        marks: [
          {
            mark: PERF_MARKS.APP_BOOT_START,
            timestamp: "t",
            elapsedMs: 0,
            meta: { osToAppBootMs: 1200 },
          },
        ],
      }),
    ]);

    expect(agg.osToAppBoot).not.toBeNull();
    expect(agg.osToAppBoot!.runs).toBe(2);
    expect(agg.osToAppBoot!.maxMs).toBe(1200);
  });

  it("ignores APP_BOOT_START marks without osToAppBootMs meta (no spawn anchor)", () => {
    const agg = aggregate([
      makeRun({
        marks: [{ mark: PERF_MARKS.APP_BOOT_START, timestamp: "t", elapsedMs: 0 }],
      }),
      makeRun({
        marks: [
          {
            mark: PERF_MARKS.APP_BOOT_START,
            timestamp: "t",
            elapsedMs: 0,
            meta: { osToAppBootMs: 0 },
          },
        ],
      }),
    ]);

    expect(agg.osToAppBoot).toBeNull();
  });

  it("excludes degraded runs from mark/phase aggregates but includes ipc samples", () => {
    const agg = aggregate([
      makeRun({
        index: 0,
        degraded: true,
        marks: [
          {
            mark: "ipc_request_sample",
            timestamp: "t",
            elapsedMs: 100,
            meta: { channel: "test", durationMs: 5 },
          },
          {
            mark: PERF_MARKS.APP_BOOT_START,
            timestamp: "t",
            elapsedMs: 0,
            meta: { osToAppBootMs: 999 },
          },
        ],
      }),
      makeRun({
        index: 1,
        marks: [
          { mark: PERF_MARKS.APP_BOOT_START, timestamp: "t", elapsedMs: 0 },
          { mark: PERF_MARKS.RENDERER_READY, timestamp: "t", elapsedMs: 500 },
        ],
      }),
    ]);

    expect(agg.ipc.test.samples).toBe(1);
    // Degraded run's APP_BOOT_START is not visited for marks/osToAppBoot.
    expect(agg.osToAppBoot).toBeNull();
    expect(agg.marks[PERF_MARKS.RENDERER_READY]).toBeDefined();
  });
});
