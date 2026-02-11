# Performance Harness

This directory contains the benchmark harness for app-level performance regression tracking.

## Modes

- `smoke`: fast PR guardrails
- `ci`: broader merge validation
- `nightly`: full matrix + soak coverage
- `soak`: long-run stress focus

## Commands

```bash
npm run perf:smoke
npm run perf:ci
npm run perf:nightly
npm run perf:soak
```

## Outputs

Artifacts are written to `.tmp/perf-results/`:

- `*.raw.jsonl` - per-iteration raw samples
- `*.summary.json` - aggregate stats + budget results
- `*.report.md` - human-readable report
- `latest-<mode>.summary.json` / `latest-<mode>.report.md`

## Baselines

Baselines are read from `scripts/perf/config/baseline.<mode>.json`.

Update baseline after accepted optimization work:

```bash
npm run perf:smoke -- --update-baseline
npm run perf:ci -- --update-baseline
```
