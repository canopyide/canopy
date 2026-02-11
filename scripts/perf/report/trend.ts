import path from "node:path";
import { readJson, writeText } from "../lib/io";
import type { BaselineSummary, PerfMode, PerfRunSummary } from "../types";

const MODES = new Set<PerfMode>(["smoke", "ci", "nightly", "soak"]);

function parseMode(): PerfMode {
  const modeArgIndex = process.argv.indexOf("--mode");
  const raw = modeArgIndex >= 0 ? process.argv[modeArgIndex + 1] : "ci";
  if (!raw || !MODES.has(raw as PerfMode)) {
    throw new Error(`Invalid mode: ${raw}`);
  }
  return raw as PerfMode;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function main(): void {
  const mode = parseMode();
  const outDir = path.resolve(process.cwd(), ".tmp/perf-results");
  const summaryPath = path.join(outDir, `latest-${mode}.summary.json`);
  const baselinePath = path.resolve(process.cwd(), `scripts/perf/config/baseline.${mode}.json`);

  const summary = readJson<PerfRunSummary>(summaryPath);
  const baseline = readJson<BaselineSummary>(baselinePath);

  if (!summary) {
    throw new Error(`Missing summary: ${summaryPath}`);
  }

  if (!baseline) {
    throw new Error(`Missing baseline: ${baselinePath}`);
  }

  const lines = [
    `# Perf Trend (${mode})`,
    "",
    `- Summary: ${summary.generatedAt}`,
    `- Baseline: ${baseline.generatedAt}`,
    "",
    "Scenario | Baseline p95 | Latest p95 | Delta %",
    "--- | ---: | ---: | ---:",
  ];

  for (const aggregate of summary.aggregates) {
    const baselineP95 = baseline.p95ByScenario[aggregate.id];
    if (baselineP95 === undefined || baselineP95 <= 0) {
      lines.push(`${aggregate.id} | n/a | ${aggregate.p95Ms} | n/a`);
      continue;
    }

    const deltaPct = ((aggregate.p95Ms - baselineP95) / baselineP95) * 100;
    lines.push(`${aggregate.id} | ${baselineP95} | ${aggregate.p95Ms} | ${round(deltaPct)}%`);
  }

  lines.push("");

  const reportPath = path.join(outDir, `trend-${mode}.md`);
  writeText(reportPath, lines.join("\n"));
  console.log(`[perf:trend] wrote ${reportPath}`);
}

main();
