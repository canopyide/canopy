#!/usr/bin/env node

// Walks dist/.vite/manifest.json from a fixed seed list (the renderer entry
// chunk plus the React.lazy() dynamic imports rendered on the first-paint
// path) and sums the gzipped bytes of every reachable chunk. The closure is
// "what the user actually downloads before they can interact" — eager imports
// plus the lazy chunks for any panel restored from the previous session.
//
// Compares against the checked-in first-render-chunk-baseline.json. Warn-only
// for the first nightly week per #7576 — use --override in CI until the
// staged-rollout window expires.
//
// Usage:
//   node scripts/check-first-render-chunk-budget.mjs                   # check (CI)
//   node scripts/check-first-render-chunk-budget.mjs --update          # write baseline
//   node scripts/check-first-render-chunk-budget.mjs --update --force  # bypass shrink guard
//   node scripts/check-first-render-chunk-budget.mjs --override        # don't fail exit code
//   node scripts/check-first-render-chunk-budget.mjs --threshold 0.10  # 10% growth allowed

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { gzipSync } from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const DIST = path.join(ROOT, "dist");
const MANIFEST_FILE = path.join(DIST, ".vite", "manifest.json");
const BASELINE_FILE = path.join(ROOT, "first-render-chunk-baseline.json");
const SUMMARY_FILE = path.join(DIST, "first-render-chunk-summary.md");

// Seed list: every source path that is part of the renderer's first-paint
// bundle. The renderer entry chunk is auto-detected via `isEntry`. The lazy
// entries below are React.lazy boundaries in src/panels/registry.tsx that
// resolve immediately when a persisted browser/dev-preview panel is restored
// — i.e. on the first-render path even though they're nominally "lazy".
const LAZY_FIRST_RENDER_SEEDS = [
  "src/components/Browser/BrowserPane.tsx",
  "src/components/DevPreview/DevPreviewPane.tsx",
];

const DEFAULT_THRESHOLD = 0.05;
const UPDATE_SHRINKAGE_THRESHOLD = 0.1;

function parseArgs(argv) {
  const args = { isUpdate: false, force: false, override: false, threshold: DEFAULT_THRESHOLD };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--update") args.isUpdate = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--override") args.override = true;
    else if (arg === "--threshold" && argv[i + 1]) {
      const val = argv[i + 1];
      args.threshold = parseFloat(val);
      if (!Number.isFinite(args.threshold) || args.threshold < 0 || args.threshold > 1) {
        console.error(`::error::invalid threshold: ${val} (must be 0–1)`);
        process.exit(1);
      }
      i++;
    }
  }
  return args;
}

function readManifest() {
  if (!existsSync(MANIFEST_FILE)) {
    console.error(
      `::error::first-render-chunk manifest not found at ${path.relative(ROOT, MANIFEST_FILE)}`
    );
    console.error(
      "   Run `vite build` first (manifest emission is enabled via build.manifest in vite.config.ts)."
    );
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(MANIFEST_FILE, "utf8"));
  } catch (err) {
    console.error(`::error::failed to parse manifest: ${err.message}`);
    process.exit(1);
  }
}

// BFS the manifest graph. `imports[]` and `dynamicImports[]` reference other
// manifest keys (source paths). Both contribute to the closure because once
// any seed is hydrated the lazy panels load synchronously on the first paint.
// Visiting by manifest key (not file name) avoids double-counting chunks
// shared via Rolldown's `codeSplitting.groups` (vendor-react, vendor-xterm…).
function collectClosure(manifest, seedKeys) {
  const visited = new Set();
  const queue = [];

  for (const seed of seedKeys) {
    if (manifest[seed]) {
      queue.push(seed);
    }
  }

  while (queue.length > 0) {
    const key = queue.shift();
    if (visited.has(key)) continue;
    visited.add(key);

    const chunk = manifest[key];
    if (!chunk) continue;

    for (const dep of chunk.imports ?? []) queue.push(dep);
    for (const dep of chunk.dynamicImports ?? []) queue.push(dep);
  }

  return visited;
}

function findEntryKey(manifest) {
  for (const [key, chunk] of Object.entries(manifest)) {
    if (chunk?.isEntry) return key;
  }
  return null;
}

function gzipBytesFor(file) {
  const filePath = path.join(DIST, file);
  if (!existsSync(filePath)) {
    return { ok: false, error: `missing chunk file: ${path.relative(ROOT, filePath)}` };
  }
  const stat = statSync(filePath);
  if (!stat.isFile()) {
    return { ok: false, error: `not a file: ${path.relative(ROOT, filePath)}` };
  }
  const buf = readFileSync(filePath);
  const gz = gzipSync(buf, { level: 9 }).byteLength;
  return { ok: true, raw: buf.byteLength, gzip: gz };
}

function buildReport(manifest) {
  const entryKey = findEntryKey(manifest);
  if (!entryKey) {
    console.error("::error::no entry chunk found in manifest (no chunk has isEntry: true)");
    process.exit(1);
  }

  const seedKeys = [entryKey, ...LAZY_FIRST_RENDER_SEEDS];
  const closure = collectClosure(manifest, seedKeys);

  const chunks = {};
  let totalRaw = 0;
  let totalGzip = 0;
  const missing = [];

  for (const key of [...closure].sort()) {
    const chunk = manifest[key];
    if (!chunk?.file) continue;
    const sized = gzipBytesFor(chunk.file);
    if (!sized.ok) {
      missing.push(sized.error);
      continue;
    }
    chunks[key] = { file: chunk.file, raw: sized.raw, gzip: sized.gzip };
    totalRaw += sized.raw;
    totalGzip += sized.gzip;
  }

  if (missing.length > 0) {
    for (const m of missing) console.warn(`::warning::${m}`);
  }

  const seedsResolved = LAZY_FIRST_RENDER_SEEDS.filter((s) => Boolean(manifest[s]));
  const seedsMissing = LAZY_FIRST_RENDER_SEEDS.filter((s) => !manifest[s]);
  for (const s of seedsMissing) {
    console.warn(
      `::warning::seed ${s} not present in manifest — closure may be undercounted (rename or refactor?)`
    );
  }

  return {
    entryKey,
    seeds: { resolved: seedsResolved, missing: seedsMissing },
    chunkCount: Object.keys(chunks).length,
    chunks,
    totals: { raw: totalRaw, gzip: totalGzip },
  };
}

function writeBaseline(report, { force }) {
  if (existsSync(BASELINE_FILE) && !force) {
    try {
      const prior = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
      const priorGzip = prior?.totals?.gzip ?? 0;
      if (priorGzip > 0) {
        const drop = (priorGzip - report.totals.gzip) / priorGzip;
        if (drop > UPDATE_SHRINKAGE_THRESHOLD) {
          console.error(
            `::error::refusing to update baseline — first-render gzip would drop from ${priorGzip} to ${report.totals.gzip} (${(drop * 100).toFixed(1)}% shrinkage > ${(UPDATE_SHRINKAGE_THRESHOLD * 100).toFixed(0)}% threshold).`
          );
          console.error("   If the shrinkage is intentional, re-run with --force.");
          process.exit(1);
        }
      }
    } catch {
      // Unparseable prior — let the update proceed.
    }
  }

  const sortedChunks = Object.keys(report.chunks)
    .sort()
    .reduce((acc, k) => {
      acc[k] = report.chunks[k];
      return acc;
    }, {});

  const out = {
    entryKey: report.entryKey,
    seeds: report.seeds,
    chunkCount: report.chunkCount,
    chunks: sortedChunks,
    totals: report.totals,
  };

  writeFileSync(BASELINE_FILE, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `[check-first-render-chunk-budget] baseline updated: ${report.chunkCount} chunks, total gzip=${report.totals.gzip}`
  );
}

function compareToBaseline(report, threshold) {
  if (!existsSync(BASELINE_FILE)) {
    console.error(
      `::error::baseline not found at ${path.relative(ROOT, BASELINE_FILE)}. Run \`npm run first-render-chunk-budget:update\`.`
    );
    process.exit(1);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  const baselineGzip = baseline?.totals?.gzip ?? 0;
  const currentGzip = report.totals.gzip;
  const delta = currentGzip - baselineGzip;
  const ratio = baselineGzip > 0 ? delta / baselineGzip : 0;
  const overBudget = ratio > threshold;

  const lines = [];
  lines.push("# First-render chunk gzip budget");
  lines.push("");
  lines.push(`- baseline gzip: ${baselineGzip} bytes`);
  lines.push(`- current gzip:  ${currentGzip} bytes`);
  lines.push(
    `- delta:         ${delta >= 0 ? "+" : ""}${delta} bytes (${(ratio * 100).toFixed(2)}%)`
  );
  lines.push(`- threshold:     +${(threshold * 100).toFixed(1)}%`);
  lines.push(`- chunks:        ${report.chunkCount}`);
  lines.push(`- result:        ${overBudget ? "OVER BUDGET" : "OK"}`);

  mkdirSync(path.dirname(SUMMARY_FILE), { recursive: true });
  writeFileSync(SUMMARY_FILE, lines.join("\n") + "\n");

  return { ok: !overBudget, delta, ratio, baselineGzip, currentGzip };
}

function main() {
  const args = parseArgs(process.argv);
  const manifest = readManifest();
  const report = buildReport(manifest);

  if (args.isUpdate) {
    writeBaseline(report, { force: args.force });
    return;
  }

  const result = compareToBaseline(report, args.threshold);

  if (result.ok) {
    console.log(
      `[check-first-render-chunk-budget] OK — ${report.chunkCount} chunks, total gzip=${result.currentGzip} (baseline=${result.baselineGzip}, ${(result.ratio * 100).toFixed(2)}%)`
    );
    return;
  }

  console.error(
    `::error::first-render chunk gzip grew from ${result.baselineGzip} to ${result.currentGzip} (+${result.delta}, ${(result.ratio * 100).toFixed(2)}%, threshold +${(args.threshold * 100).toFixed(1)}%)`
  );
  console.error(
    `   If the change is intentional, run \`npm run first-render-chunk-budget:update\` to refresh the baseline.`
  );
  if (args.override) {
    console.log(
      "[check-first-render-chunk-budget] override active — exiting successfully despite regression"
    );
    return;
  }
  process.exit(1);
}

main();
