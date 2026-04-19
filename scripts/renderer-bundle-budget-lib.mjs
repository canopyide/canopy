// Pure helpers for the renderer bundle size budget CI gate. Split from the CLI
// so comparison and formatting logic can be exercised by unit tests without
// needing a Vite build.

/**
 * Compare current report against baseline with configurable threshold.
 * Gated metrics: entry chunk gzip, total JS gzip, total CSS gzip.
 * All three must stay within (baseline * (1 + threshold)) to pass.
 *
 * @param {Object} current - Current build report
 * @param {Object} baseline - Baseline report
 * @param {number} threshold - Allowed growth fraction (0.05 = 5%)
 * @returns {Object} { ok, failures, improvements, chunkDeltas, summary }
 */
export function compareReports(current, baseline, threshold) {
  const failures = [];
  const improvements = [];
  const chunkDeltas = [];

  const entryName = current.entryChunk || baseline.entryChunk;

  // Entry chunk gzip
  if (entryName) {
    const cur = current.chunks?.[entryName];
    const base = baseline.chunks?.[entryName];
    if (cur && base) {
      const delta = cur.gzip - base.gzip;
      const pct = base.gzip > 0 ? delta / base.gzip : 0;
      chunkDeltas.push({
        name: entryName,
        isEntry: true,
        baseline: base.gzip,
        current: cur.gzip,
        delta,
        pct,
      });
      if (pct > threshold) {
        failures.push({
          metric: "entry chunk gzip",
          name: entryName,
          baseline: base.gzip,
          current: cur.gzip,
          delta,
          pct,
        });
      } else if (delta < 0) {
        improvements.push({
          metric: "entry chunk gzip",
          name: entryName,
          baseline: base.gzip,
          current: cur.gzip,
          delta,
          pct,
        });
      }
    }
  }

  // Total JS gzip
  const jsBase = baseline.totals?.js?.gzip ?? 0;
  const jsCur = current.totals?.js?.gzip ?? 0;
  const jsDelta = jsCur - jsBase;
  const jsPct = jsBase > 0 ? jsDelta / jsBase : jsCur > 0 ? Infinity : 0;
  if (jsPct > threshold) {
    failures.push({
      metric: "total JS gzip",
      baseline: jsBase,
      current: jsCur,
      delta: jsDelta,
      pct: jsPct,
    });
  } else if (jsDelta < 0) {
    improvements.push({
      metric: "total JS gzip",
      baseline: jsBase,
      current: jsCur,
      delta: jsDelta,
      pct: jsPct,
    });
  }

  // Total CSS gzip
  const cssBase = baseline.totals?.css?.gzip ?? 0;
  const cssCur = current.totals?.css?.gzip ?? 0;
  const cssDelta = cssCur - cssBase;
  const cssPct = cssBase > 0 ? cssDelta / cssBase : cssCur > 0 ? Infinity : 0;
  if (cssPct > threshold) {
    failures.push({
      metric: "total CSS gzip",
      baseline: cssBase,
      current: cssCur,
      delta: cssDelta,
      pct: cssPct,
    });
  } else if (cssDelta < 0) {
    improvements.push({
      metric: "total CSS gzip",
      baseline: cssBase,
      current: cssCur,
      delta: cssDelta,
      pct: cssPct,
    });
  }

  // Per-chunk deltas (informational, not gating)
  const allNames = new Set([
    ...Object.keys(current.chunks ?? {}),
    ...Object.keys(baseline.chunks ?? {}),
  ]);
  for (const name of allNames) {
    if (name === entryName) continue;
    const cur = current.chunks?.[name]?.gzip ?? 0;
    const base = baseline.chunks?.[name]?.gzip ?? 0;
    const delta = cur - base;
    const pct = base > 0 ? delta / base : cur > 0 ? 1 : 0;
    chunkDeltas.push({ name, isEntry: false, baseline: base, current: cur, delta, pct });
  }
  chunkDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    ok: failures.length === 0,
    failures,
    improvements,
    chunkDeltas,
    summary: {
      entryChunk: entryName,
      js: { baseline: jsBase, current: jsCur, delta: jsDelta, pct: jsPct },
      css: { baseline: cssBase, current: cssCur, delta: cssDelta, pct: cssPct },
    },
  };
}

function fmtBytes(bytes) {
  if (bytes === 0) return "0 B";
  const kb = bytes / 1024;
  return kb < 1 ? `${bytes} B` : `${kb.toFixed(1)} KB`;
}

function fmtDelta(delta, pct) {
  if (delta === 0) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${fmtBytes(delta)} (${sign}${(pct * 100).toFixed(1)}%)`;
}

function statusLabel(pct, threshold) {
  if (pct > threshold) return "FAIL";
  if (pct > 0) return "warn";
  if (pct < 0) return "improved";
  return "ok";
}

/**
 * Format comparison result as a markdown table for PR comments.
 */
export function formatMarkdown(comparison, threshold) {
  const lines = [
    "### Renderer Bundle Size Report",
    "",
    `**Threshold**: +${(threshold * 100).toFixed(0)}% | **Result**: ${comparison.ok ? "PASS" : "FAIL"}`,
    "",
    "| Chunk | Baseline (gzip) | Current (gzip) | Delta | Status |",
    "|-------|-----------------|----------------|-------|--------|",
  ];

  for (const d of comparison.chunkDeltas) {
    const label = d.isEntry ? `${d.name} (entry)` : d.name;
    lines.push(
      `| ${label} | ${fmtBytes(d.baseline)} | ${fmtBytes(d.current)} | ${fmtDelta(d.delta, d.pct)} | ${statusLabel(d.pct, threshold)} |`
    );
  }

  const s = comparison.summary;
  lines.push("| | | | | |");
  lines.push(
    `| **Total JS** | **${fmtBytes(s.js.baseline)}** | **${fmtBytes(s.js.current)}** | **${fmtDelta(s.js.delta, s.js.pct)}** | **${statusLabel(s.js.pct, threshold)}** |`
  );
  lines.push(
    `| **Total CSS** | **${fmtBytes(s.css.baseline)}** | **${fmtBytes(s.css.current)}** | **${fmtDelta(s.css.delta, s.css.pct)}** | **${statusLabel(s.css.pct, threshold)}** |`
  );

  if (comparison.failures.length > 0) {
    lines.push("", "**Regressions**:");
    for (const f of comparison.failures) {
      const name = f.name ? ` \`${f.name}\`` : "";
      lines.push(
        `- ${f.metric}${name}: ${fmtDelta(f.delta, f.pct)} exceeds +${(threshold * 100).toFixed(0)}% threshold`
      );
    }
  }

  if (comparison.improvements.length > 0) {
    lines.push("", "**Improvements**:");
    for (const i of comparison.improvements) {
      const name = i.name ? ` \`${i.name}\`` : "";
      lines.push(`- ${i.metric}${name}: ${fmtDelta(i.delta, i.pct)}`);
    }
    lines.push("", "_Consider `npm run renderer-bundle-budget:update` to lock in improvements._");
  }

  return lines.join("\n");
}

/**
 * Validate the shape of a bundle size report or baseline.
 * Returns an array of error strings (empty if valid).
 */
export function validateReport(data) {
  const errs = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    errs.push("must be a JSON object");
    return errs;
  }
  if (data.entryChunk !== undefined && typeof data.entryChunk !== "string") {
    errs.push("`entryChunk` must be a string if present");
  }
  if (!data.chunks || typeof data.chunks !== "object" || Array.isArray(data.chunks)) {
    errs.push("`chunks` must be an object");
  } else {
    for (const [name, entry] of Object.entries(data.chunks)) {
      if (typeof entry?.raw !== "number" || typeof entry?.gzip !== "number") {
        errs.push(`chunks["${name}"] must have numeric raw and gzip fields`);
      }
    }
  }
  if (!data.totals || typeof data.totals !== "object") {
    errs.push("`totals` must be an object");
  } else {
    for (const kind of ["js", "css"]) {
      const t = data.totals[kind];
      if (!t || typeof t.raw !== "number" || typeof t.gzip !== "number") {
        errs.push(`totals.${kind} must have numeric raw and gzip fields`);
      }
    }
  }
  return errs;
}
