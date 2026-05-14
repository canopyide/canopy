#!/usr/bin/env node

// Walks dist/.vite/manifest.json from the renderer entry chunk, following ONLY
// the sync `imports[]` graph (skipping `dynamicImports[]`). The result is the
// set of chunks the renderer pulls in eagerly before any lazy boundary
// (React.lazy() / dynamic import) is hydrated. Compares that set against the
// checked-in renderer-import-baseline.json to catch silent growth — the
// renderer counterpart to scripts/check-import-budget.mjs.
//
// Why chunk-keys (not source files): Vite's manifest tracks compiled chunks,
// and `imports[]` entries are manifest keys, not source paths. BFS-by-key
// avoids double-counting chunks shared via Rolldown codeSplitting groups
// (vendor-react, vendor-xterm, ...). The trade-off vs. source-module counts is
// stability — the chunk graph is what actually loads at runtime.
//
// Usage:
//   node scripts/check-renderer-import-budget.mjs                    # check (CI)
//   node scripts/check-renderer-import-budget.mjs --update           # rewrite baseline
//   node scripts/check-renderer-import-budget.mjs --update --force   # bypass 10% shrink guard

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const MANIFEST_FILE = path.join(ROOT, "dist", ".vite", "manifest.json");
const BASELINE_FILE = path.join(ROOT, "renderer-import-baseline.json");

// Refuse to overwrite the baseline in --update mode if the eager chunk count
// shrinks by more than this fraction. Mirrors check-import-budget.mjs.
const UPDATE_SHRINKAGE_THRESHOLD = 0.1;

function parseArgs(argv) {
  return {
    isUpdate: argv.includes("--update"),
    force: argv.includes("--force"),
  };
}

function readManifest() {
  if (!existsSync(MANIFEST_FILE)) {
    console.error(`::error::renderer manifest not found at ${path.relative(ROOT, MANIFEST_FILE)}`);
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

function findEntryKey(manifest) {
  for (const [key, chunk] of Object.entries(manifest)) {
    if (chunk?.isEntry) return key;
  }
  return null;
}

// BFS only `imports[]`. Skipping `dynamicImports[]` is the whole point — those
// are React.lazy() / dynamic-import boundaries that should NOT load eagerly.
// Identity is the manifest key so chunks shared via codeSplitting groups are
// visited once. Keys that don't exist in the manifest are skipped, not
// counted — the gate measures real on-disk chunks.
export function collectEagerChunks(manifest, entryKey) {
  const visited = new Set();
  if (!manifest[entryKey]) return visited;

  const queue = [entryKey];
  while (queue.length > 0) {
    const key = queue.shift();
    if (visited.has(key)) continue;

    const chunk = manifest[key];
    if (!chunk) continue;
    visited.add(key);

    for (const dep of chunk.imports ?? []) queue.push(dep);
    // Intentionally NOT walking dynamicImports — those are lazy by design.
  }
  return visited;
}

// Map a manifest key (which carries Rolldown's build-hash, e.g.
// `_vendor-react-CSdVl0cc.js`) to its stable `chunk.name` (e.g. `vendor-react`).
// The hash changes on every build; the name is stable. Falls back to the
// manifest key when `name` is absent so the baseline always has *some*
// identity to compare against.
export function stableChunkId(manifest, key) {
  const chunk = manifest[key];
  if (chunk?.name && typeof chunk.name === "string") return chunk.name;
  return key;
}

function buildReport() {
  const manifest = readManifest();
  const entryKey = findEntryKey(manifest);
  if (!entryKey) {
    console.error("::error::no entry chunk found in manifest (no chunk has isEntry: true)");
    process.exit(1);
  }

  const closure = collectEagerChunks(manifest, entryKey);
  const chunkIds = [...new Set([...closure].map((k) => stableChunkId(manifest, k)))].sort();

  return {
    entryName: stableChunkId(manifest, entryKey),
    eagerChunkCount: chunkIds.length,
    eagerChunks: chunkIds,
  };
}

// Pure helper — exported for tests. Mirrors check-import-budget.mjs shrinkage
// guard. Returns null when the update is safe, or an error message when the
// drop exceeds the threshold (caller exits unless --force).
export function shrinkageGuardError(priorCount, nextCount, threshold) {
  if (typeof priorCount !== "number" || priorCount <= 0) return null;
  const drop = (priorCount - nextCount) / priorCount;
  if (drop <= threshold) return null;
  return (
    `refusing to update baseline — eager chunk count would drop from ${priorCount} to ${nextCount} ` +
    `(${(drop * 100).toFixed(1)}% shrinkage > ${(threshold * 100).toFixed(0)}% threshold).`
  );
}

function writeBaseline(report, { force }) {
  if (existsSync(BASELINE_FILE) && !force) {
    try {
      const prior = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
      const guardError = shrinkageGuardError(
        prior?.eagerChunkCount,
        report.eagerChunkCount,
        UPDATE_SHRINKAGE_THRESHOLD
      );
      if (guardError) {
        console.error(`::error::${guardError}`);
        console.error(
          "   This usually means the build was produced with a different config (renamed entry, split removed)."
        );
        console.error("   If the shrinkage is intentional, re-run with --force.");
        process.exit(1);
      }
    } catch {
      // Unparseable prior baseline — let the update proceed.
    }
  }

  const out = {
    entryName: report.entryName,
    eagerChunkCount: report.eagerChunkCount,
    eagerChunks: report.eagerChunks,
  };
  writeFileSync(BASELINE_FILE, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `[check-renderer-import-budget] baseline updated: entry=${report.entryName}, eagerChunkCount=${report.eagerChunkCount}`
  );
}

// Pure helper — exported for tests. Returns the comparison result without
// performing I/O or side effects.
export function compareReport(report, baseline) {
  const baselineCount = baseline?.eagerChunkCount;
  if (typeof baselineCount !== "number" || baselineCount < 0) {
    return {
      ok: false,
      error: "baseline.eagerChunkCount missing or invalid",
    };
  }

  // Guard against hand-edited or corrupted baselines that swap the array for
  // some other shape (e.g. `{}` or `null`) — without this, `new Set(nonArray)`
  // raises a raw TypeError that escapes the structured error reporting.
  const baselineChunks = baseline?.eagerChunks;
  if (baselineChunks != null && !Array.isArray(baselineChunks)) {
    return {
      ok: false,
      error: "baseline.eagerChunks must be an array of chunk names",
    };
  }

  const currentCount = report.eagerChunkCount;
  const baselineKeys = new Set(baselineChunks ?? []);
  const currentKeys = new Set(report.eagerChunks);

  const added = report.eagerChunks.filter((k) => !baselineKeys.has(k));
  const removed = (baselineChunks ?? []).filter((k) => !currentKeys.has(k));

  if (currentCount > baselineCount) {
    return {
      ok: false,
      grew: true,
      baselineCount,
      currentCount,
      added,
      removed,
    };
  }

  return {
    ok: true,
    shrank: currentCount < baselineCount,
    baselineCount,
    currentCount,
    added,
    removed,
  };
}

function readBaseline() {
  if (!existsSync(BASELINE_FILE)) {
    console.error(
      `::error::renderer-import baseline not found at ${path.relative(ROOT, BASELINE_FILE)}`
    );
    console.error("   Run `npm run renderer-import-budget:update` to create it.");
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  } catch (err) {
    console.error(`::error::failed to parse baseline: ${err.message}`);
    process.exit(1);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const report = buildReport();

  if (args.isUpdate) {
    writeBaseline(report, { force: args.force });
    return;
  }

  const baseline = readBaseline();
  const result = compareReport(report, baseline);

  if (result.error) {
    console.error(`::error::${result.error}`);
    process.exit(1);
  }

  if (result.ok) {
    if (result.shrank) {
      console.log(
        `::notice::renderer eager chunk count dropped from ${result.baselineCount} to ${result.currentCount} — consider running \`npm run renderer-import-budget:update\` to ratchet the baseline.`
      );
    }
    console.log(
      `[check-renderer-import-budget] OK — ${result.currentCount} eager chunk(s) (baseline=${result.baselineCount}).`
    );
    return;
  }

  console.error(
    `::error::renderer eager chunk count grew from ${result.baselineCount} to ${result.currentCount}`
  );
  if (result.added.length > 0) {
    console.error("   New eager chunks:");
    for (const key of result.added) console.error(`     + ${key}`);
  }
  if (result.removed.length > 0) {
    console.error("   Removed eager chunks (counted against budget but still worth noting):");
    for (const key of result.removed) console.error(`     - ${key}`);
  }
  console.error(
    "   If the regression is intentional (a new boot-critical module), run `npm run renderer-import-budget:update` to refresh the baseline."
  );
  process.exit(1);
}

// Only run main when invoked directly (not when imported by tests).
// Uses pathToFileURL to percent-encode paths that contain spaces or other
// non-URL characters — `file://${process.argv[1]}` would silently mismatch
// import.meta.url (which is already percent-encoded) on such paths, causing
// the script to no-op without running the check.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
