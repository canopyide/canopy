#!/usr/bin/env node

/**
 * ESLint Warning Ratchet
 *
 * Fails the build if ESLint warnings increase beyond the baseline.
 * This allows gradual reduction of warnings without introducing new ones.
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const BASELINE_FILE = join(ROOT, "eslint-warnings-baseline.json");
const UPDATE_SHRINKAGE_THRESHOLD = 0.1;

// Test files still get linted (editor + raw `npm run lint`), but their warnings
// don't count toward the ratchet — test patterns like `as Foo` partial mocks
// aren't product debt. Errors are still counted for all files below.
const TEST_FILE_PATTERN = /[/\\](__tests__|e2e)[/\\]|\.(?:test|spec)\.[^.]+$/;

function main() {
  const isUpdate = process.argv.includes("--update");
  const force = process.argv.includes("--force");

  // Run ESLint and capture output
  let lintOutput;
  try {
    lintOutput = execSync("npx eslint . --format json", {
      cwd: ROOT,
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large output
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    // ESLint exits with code 1 when there are warnings/errors
    // The output is still valid JSON in stdout
    if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      console.error("❌ ESLint output exceeded buffer size (10MB)");
      console.error("   Try reducing the number of files or increasing maxBuffer");
      process.exit(1);
    }

    lintOutput = error.stdout || "";

    // If stdout is empty, ESLint likely failed before producing JSON
    if (!lintOutput || lintOutput.trim() === "") {
      console.error("❌ ESLint failed to produce output");
      console.error("   Error:", error.message);
      if (error.stderr) {
        console.error("   stderr:", error.stderr);
      }
      process.exit(1);
    }
  }

  let results;
  try {
    results = JSON.parse(lintOutput);
  } catch (error) {
    console.error("❌ Failed to parse ESLint JSON output");
    console.error("First 500 chars of output:", lintOutput.substring(0, 500));
    console.error("Parse error:", error.message);
    process.exit(1);
  }

  // Warnings: exclude test files. Errors: count every file — the ratchet is
  // the only ESLint gate in CI (`npm run check` calls `lint:ratchet`), so
  // test-file errors must still block the build.
  const productionResults = results.filter((file) => !TEST_FILE_PATTERN.test(file.filePath));

  const warningCount = productionResults.reduce((sum, file) => {
    return sum + file.messages.filter((msg) => msg.severity === 1).length;
  }, 0);

  const errorCount = results.reduce((sum, file) => {
    return sum + file.messages.filter((msg) => msg.severity === 2).length;
  }, 0);

  console.log(`📊 Current ESLint warnings: ${warningCount}`);

  // Always fail if there are errors
  if (errorCount > 0) {
    console.error(`❌ ESLint errors detected: ${errorCount}`);
    console.error("   Fix all errors before proceeding");
    process.exit(1);
  }

  // Update mode: save current count as new baseline
  if (isUpdate) {
    // Shrinkage guard: if the warning count drops by more than the threshold
    // compared to the prior baseline, refuse to update. This prevents a config
    // bug (e.g. .eslintignore expansion, file-pattern narrowing) from silently
    // locking in undercounting as the new baseline.
    if (existsSync(BASELINE_FILE) && !force) {
      let priorCount = 0;
      try {
        const prior = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
        if (prior && typeof prior.count === "number" && Number.isFinite(prior.count)) {
          priorCount = prior.count;
        }
      } catch {
        // Unparseable prior baseline — let the update proceed; the previous
        // baseline is unusable anyway.
      }
      if (priorCount > 0) {
        const drop = (priorCount - warningCount) / priorCount;
        if (drop > UPDATE_SHRINKAGE_THRESHOLD) {
          console.error(
            `::error::refusing to update baseline — warning count would drop from ${priorCount} to ${warningCount} (${(drop * 100).toFixed(1)}% shrinkage > ${(UPDATE_SHRINKAGE_THRESHOLD * 100).toFixed(0)}% threshold).`
          );
          console.error(
            "   This usually means ESLint coverage shrank (config change, .eslintignore expansion, or file-pattern narrowing)."
          );
          console.error("   If the shrinkage is intentional, re-run with --force.");
          process.exit(1);
        }
      }
    }

    const baseline = { count: warningCount, updatedAt: new Date().toISOString() };
    writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2) + "\n");
    console.log(`✅ Baseline updated: ${warningCount} warnings`);
    return;
  }

  // Check mode: compare against baseline
  if (!existsSync(BASELINE_FILE)) {
    console.error(`❌ Baseline file not found: ${BASELINE_FILE}`);
    console.error(`   Run: npm run lint:ratchet -- --update`);
    process.exit(1);
  }

  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf-8"));
  } catch (error) {
    console.error(`❌ Failed to parse baseline file: ${BASELINE_FILE}`);
    console.error(`   Error: ${error.message}`);
    process.exit(1);
  }

  // Validate baseline structure
  if (typeof baseline.count !== "number" || baseline.count < 0) {
    console.error(`❌ Invalid baseline: count must be a non-negative number`);
    console.error(`   Found: ${JSON.stringify(baseline.count)}`);
    process.exit(1);
  }

  const baselineCount = baseline.count;
  const diff = warningCount - baselineCount;

  if (diff > 0) {
    console.error(`❌ ESLint warnings increased by ${diff} (baseline: ${baselineCount})`);
    console.error(`   Fix the new warnings or run: npm run lint:ratchet -- --update`);
    process.exit(1);
  } else if (diff < 0) {
    console.log(`🎉 ESLint warnings decreased by ${Math.abs(diff)}! (baseline: ${baselineCount})`);
    console.log(`   Update baseline: npm run lint:ratchet -- --update`);
  } else {
    console.log(`✅ No new warnings introduced (baseline: ${baselineCount})`);
  }
}

main();
