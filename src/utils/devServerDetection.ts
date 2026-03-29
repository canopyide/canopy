import type { RunCommand } from "@shared/types";

const DEV_SCRIPT_PRIORITY = ["dev", "start", "serve"];

const NEXT_DEV_RE = /\bnext\s+dev\b/;
const TURBOPACK_FLAG_RE = /--turbo(?:pack)?\b/;

/**
 * If a runner's underlying script is `next dev` without --turbopack,
 * returns a copy with `-- --turbopack` appended to the command.
 * Turbopack is required for Canopy's integrated browser because webpack's
 * style-loader CSS injection fails in Electron webviews.
 */
function applyNextjsTurbopack(runner: RunCommand): RunCommand {
  const desc = runner.description ?? "";
  if (!NEXT_DEV_RE.test(desc) || TURBOPACK_FLAG_RE.test(desc)) {
    return runner;
  }
  return { ...runner, command: `${runner.command} -- --turbopack` };
}

/**
 * Find the best dev server candidate from detected runners
 * Priority: dev > start > serve
 */
export function findDevServerCandidate(
  allDetectedRunners: RunCommand[] | undefined
): RunCommand | undefined {
  if (!allDetectedRunners) {
    return undefined;
  }

  const candidate = DEV_SCRIPT_PRIORITY.map((name) =>
    allDetectedRunners.find((runner) => runner.name === name)
  ).find((runner) => runner !== undefined);

  return candidate ? applyNextjsTurbopack(candidate) : undefined;
}
