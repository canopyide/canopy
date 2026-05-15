/**
 * Dedicated scratch folder for the Daintree Assistant.
 *
 * Each agent help session (Claude, Codex, Gemini, Copilot) gets a private
 * directory under `userData/assistant-scratch/<instanceId>/<sessionId>/` that
 * it can write to without polluting the project workspace or persisting
 * across launches. Two design choices keep this safe for concurrent app
 * instances (smoke tests, e2e harness) and crash recovery:
 *
 *   1. **Per-instance subdir** — every main-process boot generates a fresh
 *      `instanceId` at module load. All scratch dirs from this run live
 *      under that ID; the boot-time cleanup leaves it alone and removes
 *      every other top-level entry.
 *   2. **Filesystem listing IS the ledger** — no DB tracking. Anything on
 *      disk under the scratch root that doesn't match the current instance
 *      ID is a stale orphan from a prior boot (or a crashed sibling instance)
 *      and is eligible for removal.
 *
 * Cleanup mirrors the fire-and-forget pattern of `initializeScratchCleanup`:
 * called once at app boot from `main.ts`, never awaited, never throws — a
 * locked file from a still-running concurrent instance (`EBUSY`/`EPERM`)
 * must not block startup. The `fs.rm` retry options
 * (`maxRetries: 5, retryDelay: 100`) handle transient locks; per-entry
 * failures are logged and skipped.
 */
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import { logError, logInfo } from "../utils/logger.js";

const SCRATCH_DIR_NAME = "assistant-scratch";

/** Env var injected into the assistant PTY spawn pointing at its scratch dir. */
export const ASSISTANT_SCRATCH_ENV_VAR = "DAINTREE_ASSISTANT_SCRATCH_DIR";

/**
 * Stable for the lifetime of the main process. Generated at module load so
 * any service that imports this module sees the same value and the cleanup
 * sweep can identify "our" dir without needing it to exist yet.
 */
const instanceId = randomUUID();

/** Lazy because `app.getPath('userData')` is only valid once Electron's app module is initialized. */
export function getAssistantScratchRoot(): string {
  return path.join(app.getPath("userData"), SCRATCH_DIR_NAME);
}

/** The current-instance container, parent of every per-session subdir. */
export function getCurrentInstanceScratchRoot(): string {
  return path.join(getAssistantScratchRoot(), instanceId);
}

/**
 * Path the assistant should write to for a given help-session id. Caller is
 * responsible for `fs.mkdir({ recursive: true })`-ing this before handing
 * the path to the agent — the directory does not exist until provisioned.
 */
export function getScratchDirForSession(sessionId: string): string {
  return path.join(getCurrentInstanceScratchRoot(), sessionId);
}

/** Exposed for the in-process injection helper in `HelpSessionService`. */
export function getAssistantScratchInstanceId(): string {
  return instanceId;
}

interface CleanupResult {
  /** Top-level entries under the scratch root that were considered. */
  candidates: number;
  /** Entries successfully removed (or already absent). */
  removed: number;
  /** Entries that failed to remove (logged, not rethrown). */
  failed: number;
}

/**
 * Sweep stale per-instance subdirs from the scratch root. Anything that
 * isn't the current `instanceId` is considered stale — either a crashed
 * prior instance, or a concurrent instance that hasn't started its own
 * sweep yet. The retry options on `fs.rm` (`maxRetries: 5, retryDelay: 100`)
 * cover the transient-lock case; if a concurrent instance still holds a
 * file open, the per-entry failure is logged and skipped so the next boot
 * picks it up.
 *
 * Exported for tests. Production callers use {@link startAssistantScratchCleanup}
 * which discards the result and never throws.
 */
export async function runAssistantScratchCleanup(): Promise<CleanupResult> {
  const result: CleanupResult = { candidates: 0, removed: 0, failed: 0 };
  const root = getAssistantScratchRoot();

  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return result;
    logError("[AssistantScratchCleanup] Failed to read scratch root", err);
    return result;
  }

  result.candidates = entries.length;
  for (const entry of entries) {
    if (entry === instanceId) continue;
    const target = path.join(root, entry);
    try {
      await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      result.removed += 1;
    } catch (err) {
      result.failed += 1;
      logError(`[AssistantScratchCleanup] Failed to remove ${target}`, err);
    }
  }

  if (result.removed > 0 || result.failed > 0) {
    logInfo(
      `[AssistantScratchCleanup] sweep complete: ${result.removed} removed, ${result.failed} failed`
    );
  }

  return result;
}

/**
 * Fire-and-forget entry point invoked from `electron/main.ts` at startup.
 * Errors are caught and logged; never propagate to the boot path. Also
 * ensures the current-instance dir exists so callers don't have to race
 * the first `mkdir` with the cleanup sweep. Returns a Promise that resolves
 * once both operations complete — production callers can safely discard it;
 * tests can await it to observe the post-cleanup filesystem state.
 */
export function startAssistantScratchCleanup(): Promise<void> {
  const currentRoot = getCurrentInstanceScratchRoot();
  const mkdir = fs.mkdir(currentRoot, { recursive: true }).catch((err) => {
    logError("[AssistantScratchCleanup] Failed to create instance scratch root", err);
  });
  const sweep = runAssistantScratchCleanup().catch((err) => {
    logError("[AssistantScratchCleanup] sweep threw", err);
  });
  return Promise.all([mkdir, sweep]).then(() => undefined);
}
