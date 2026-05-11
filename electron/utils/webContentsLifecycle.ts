/**
 * webContentsLifecycle — Shared CDP freeze/unfreeze for WebContents.
 *
 * Wraps `Page.setWebLifecycleState` so callers don't need to know about
 * `debugger.attach`, `Page.enable`, or the swallow-list of expected CDP errors
 * that surface during teardown/navigation races.
 *
 * Chromium 146 does NOT auto-resume a frozen renderer on focus or re-attach —
 * an explicit `"active"` call is required. Callers that activate a previously
 * deactivated view must call `unfreezeWebContents` before relying on the
 * renderer's event loop.
 *
 * Audit: electron/main.ts and electron/bootstrap.ts checked — no
 * `disable-renderer-backgrounding` or `disable-background-timer-throttling`
 * appendSwitch calls. If either is reintroduced, CDP freeze silently no-ops
 * (lesson #4683).
 */

import { formatErrorMessage } from "../../shared/utils/errorMessage.js";

const EXPECTED_CDP_ERRORS = [
  "Target closed",
  "Inspected target navigated",
  "Cannot attach",
  "debugger is already attached",
  "No debugger attached",
];

function ensureAttached(wc: Electron.WebContents): void {
  if (!wc.debugger.isAttached()) {
    wc.debugger.attach("1.3");
  }
}

async function setLifecycleState(
  wc: Electron.WebContents,
  state: "frozen" | "active"
): Promise<void> {
  if (wc.isDestroyed()) return;
  try {
    ensureAttached(wc);
    await wc.debugger.sendCommand("Page.enable");
    await wc.debugger.sendCommand("Page.setWebLifecycleState", { state });
  } catch (err) {
    const message = formatErrorMessage(err, "CDP lifecycle state failed");
    if (EXPECTED_CDP_ERRORS.some((s) => message.includes(s))) return;
    console.warn(`[webContentsLifecycle] setWebLifecycleState(${state}) failed:`, message);
  }
}

export function freezeWebContents(wc: Electron.WebContents): Promise<void> {
  return setLifecycleState(wc, "frozen");
}

export function unfreezeWebContents(wc: Electron.WebContents): Promise<void> {
  return setLifecycleState(wc, "active");
}
