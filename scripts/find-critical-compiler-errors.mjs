#!/usr/bin/env node
// Enumerates React Compiler critical errors (ErrorSeverity.Error) across src/.
// These are what `panicThreshold: "critical_errors"` would panic on in dev.
// Usage: node scripts/find-critical-compiler-errors.mjs

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";
import * as babel from "@babel/core";
import reactCompilerPkg from "babel-plugin-react-compiler";
const reactCompilerPlugin = reactCompilerPkg.default ?? reactCompilerPkg;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = globSync("src/**/*.{ts,tsx}", {
  cwd: ROOT,
  ignore: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**", "**/*.d.ts"],
});

const errorsByFile = new Map();

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  let source;
  try {
    source = await readFile(abs, "utf8");
  } catch {
    continue;
  }

  const logger = {
    logEvent(filename, event) {
      if (event.kind !== "CompileError") return;
      const detail = event.detail;
      if (!detail) return;
      // Normalize to a single-element array. At runtime, both
      // CompilerErrorDetail and CompilerDiagnostic carry severity on the
      // parent object; CompilerDiagnostic stores child entries in
      // this.options.details, not this.details, so the fallback path
      // [detail] is what executes in practice for both shapes.
      const details = Array.isArray(detail.details) ? detail.details : [detail];
      for (const d of details) {
        if (!d || d.severity !== "Error") continue;
        const loc = d.loc ?? event.fnLoc;
        const line = loc?.start?.line ?? "?";
        const reason =
          d.reason ?? d.description ?? detail.reason ?? detail.description ?? "(unknown)";
        const entry = errorsByFile.get(rel) ?? [];
        entry.push({ line, reason });
        errorsByFile.set(rel, entry);
      }
    },
  };

  try {
    await babel.transformAsync(source, {
      filename: abs,
      babelrc: false,
      configFile: false,
      parserOpts: {
        plugins: ["typescript", "jsx"],
        sourceType: "module",
      },
      plugins: [
        [reactCompilerPlugin, { compilationMode: "infer", panicThreshold: "none", logger }],
      ],
    });
  } catch (err) {
    // panic-threshold "none" shouldn't throw, but guard just in case.
    const msg = (err?.message ?? String(err)).split("\n")[0];
    const entry = errorsByFile.get(rel) ?? [];
    entry.push({ line: "?", reason: `[panic] ${msg}` });
    errorsByFile.set(rel, entry);
  }
}

const sorted = [...errorsByFile.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
console.log(`\n${sorted.length} files have critical (Error-severity) compiler diagnostics:\n`);
for (const [file, entries] of sorted) {
  console.log(`  ${file}`);
  for (const { line, reason } of entries) {
    console.log(`    :${line}  ${reason}`);
  }
}
console.log(`\nTotal: ${[...errorsByFile.values()].flat().length} critical errors\n`);
