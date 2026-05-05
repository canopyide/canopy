import type { FdLeakWarningPayload } from "@shared/types/pty-host";
import { notify } from "@/lib/notify";
import { DisposableStore, toDisposable } from "@/utils/disposable";

let lastWarningTimestamp = 0;
const REARM_MS = 5 * 60 * 1000; // 5 min cooldown before re-arming

export function _resetFdLeakWarningCooldown() {
  lastWarningTimestamp = 0;
}

export function setupFdLeakWarningListeners(): DisposableStore {
  const d = new DisposableStore();

  d.add(
    toDisposable(
      window.electron.terminal.onFdLeakWarning((data: FdLeakWarningPayload) => {
        const now = Date.now();
        if (now - lastWarningTimestamp < REARM_MS) return;
        lastWarningTimestamp = now;

        const fdPct =
          data.ptmxLimit != null && data.ptmxLimit > 0
            ? ` (${Math.round((data.fdCount / data.ptmxLimit) * 100)}% of limit)`
            : "";

        notify({
          type: "warning",
          title: "FD leak detected",
          message: `${data.fdCount} open file descriptors, ${data.activeTerminals} active terminals, ~${data.estimatedLeaked} leaked${fdPct}.`,
          priority: "high",
          correlationId: "terminal:fd-leak-warning",
        });
      })
    )
  );

  return d;
}
