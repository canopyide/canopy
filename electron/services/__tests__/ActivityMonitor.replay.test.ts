import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadExpected,
  matchTransitions,
  replayCast,
  type ReplayCastOpts,
} from "./replay/castReplayHarness.js";
import type { ProcessStateValidator } from "../ActivityMonitor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "fixtures", "activity-monitor");

function fixture(name: string) {
  return {
    cast: path.join(FIXTURE_DIR, `${name}.cast`),
    expected: path.join(FIXTURE_DIR, `${name}.expected.json`),
  };
}

interface ReplayCase {
  name: string;
  agentId?: string;
  pollingMaxBootMs?: number;
}

const REPLAY_CASES: ReplayCase[] = [
  { name: "claude-normal-turn", agentId: "claude" },
  { name: "gemini-working-to-idle", agentId: "gemini" },
  { name: "codex-completion", agentId: "codex" },
  { name: "general-silence-timeout", agentId: undefined, pollingMaxBootMs: 100 },
];

describe("ActivityMonitor replay harness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  describe.each(REPLAY_CASES)("$name (no fragmentation)", ({ name, agentId, pollingMaxBootMs }) => {
    it("produces the expected transition sequence", async () => {
      const { cast, expected } = fixture(name);
      const expectedFile = loadExpected(expected);
      const opts: ReplayCastOpts = {
        agentId: expectedFile.agentId ?? agentId,
        settleMs: expectedFile.settleMs,
        pollingMaxBootMs: expectedFile.pollingMaxBootMs ?? pollingMaxBootMs,
        maxWorkingSilenceMs: expectedFile.maxWorkingSilenceMs,
        idleDebounceMs: expectedFile.idleDebounceMs,
        promptFastPathMinQuietMs: expectedFile.promptFastPathMinQuietMs,
      };
      const recorded = await replayCast(cast, opts);
      const failures = matchTransitions(recorded, expectedFile.transitions, {
        toleranceMs: expectedFile.toleranceMs ?? 200,
      });
      expect(failures, formatFailures(failures, recorded)).toHaveLength(0);
    });
  });

  describe.each([
    { name: "claude-normal-turn", agentId: "claude", seed: 12345 },
    { name: "claude-normal-turn", agentId: "claude", seed: 99999 },
    { name: "gemini-working-to-idle", agentId: "gemini", seed: 42 },
  ])("$name fragmented (seed=$seed)", ({ name, agentId, seed }) => {
    it("still produces the expected transition sequence", async () => {
      const { cast, expected } = fixture(name);
      const expectedFile = loadExpected(expected);
      const recorded = await replayCast(cast, {
        agentId: expectedFile.agentId ?? agentId,
        settleMs: expectedFile.settleMs,
        pollingMaxBootMs: expectedFile.pollingMaxBootMs,
        maxWorkingSilenceMs: expectedFile.maxWorkingSilenceMs,
        idleDebounceMs: expectedFile.idleDebounceMs,
        promptFastPathMinQuietMs: expectedFile.promptFastPathMinQuietMs,
        fragmentation: { seed, maxSplits: 4 },
      });
      // Fragmented playback exercises chunk-boundary parsing. Working-signal
      // detection is intentionally sensitive to byte boundaries (\r-prefixed
      // status rewrites can land in separate chunks), so timing of the state
      // machine drifts a few hundred ms compared to whole-chunk playback. The
      // sequence of states is the load-bearing invariant — exact timing isn't.
      const failures = matchTransitions(recorded, expectedFile.transitions, {
        toleranceMs: expectedFile.toleranceMs ?? 1500,
      });
      expect(failures, formatFailures(failures, recorded)).toHaveLength(0);
    });
  });

  it("dispose-mid-cycle emits final idle with trigger=dispose", async () => {
    // Tiny synthetic cast: one short busy burst, then we let dispose fire.
    const { cast } = fixture("claude-normal-turn");
    const recorded = await replayCast(cast, {
      agentId: "claude",
      settleMs: 0,
    });
    const last = recorded[recorded.length - 1];
    // Last recorded transition should be the dispose-emitted idle.
    expect(last.state).toBe("idle");
    expect(last.trigger).toBe("dispose");
  });

  it("CPU-high process state validator blocks idle until CPU drops", async () => {
    const cpuSwitchAtMs = 4000;
    const validator: ProcessStateValidator = {
      hasActiveChildren: () => true,
      getDescendantsCpuUsage: () => (Date.now() < cpuSwitchAtMs ? 50 : 0),
    };
    const { cast, expected } = fixture("cpu-high-blocks-idle");
    const expectedFile = loadExpected(expected);
    const recorded = await replayCast(cast, {
      agentId: expectedFile.agentId ?? "claude",
      settleMs: expectedFile.settleMs,
      pollingMaxBootMs: expectedFile.pollingMaxBootMs,
      maxWorkingSilenceMs: expectedFile.maxWorkingSilenceMs,
      idleDebounceMs: expectedFile.idleDebounceMs,
      processStateValidator: validator,
    });
    const failures = matchTransitions(recorded, expectedFile.transitions, {
      toleranceMs: expectedFile.toleranceMs ?? 250,
    });
    expect(failures, formatFailures(failures, recorded)).toHaveLength(0);
  });
});

function formatFailures(
  failures: ReturnType<typeof matchTransitions>,
  recorded: { replayMs: number; state: string; trigger?: string }[]
): string {
  if (failures.length === 0) return "";
  const fail = failures
    .map((f) => `  - [${f.index}] ${f.kind}: expected ${JSON.stringify(f.expected)}`)
    .join("\n");
  const got = recorded.map((r) => `  ${r.replayMs}ms ${r.state}/${r.trigger ?? "-"}`).join("\n");
  return `Match failures:\n${fail}\nRecorded transitions:\n${got}`;
}
