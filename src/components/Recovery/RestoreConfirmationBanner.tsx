import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useRestoreConfirmationStore } from "@/store/restoreConfirmationStore";

const AUTO_DISMISS_MS = 10_000;

export function RestoreConfirmationBanner() {
  const visible = useRestoreConfirmationStore((s) => s.visible);
  const suspectCount = useRestoreConfirmationStore((s) => s.suspectCount);
  const dismiss = useRestoreConfirmationStore((s) => s.dismiss);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible || suspectCount > 0) return;

    timerRef.current = setTimeout(() => {
      dismiss();
    }, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, suspectCount, dismiss]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-3 px-4 py-2 bg-[var(--color-status-warning)]/15 border-b border-[var(--color-status-warning)]/30 text-[var(--color-status-warning)] text-sm shrink-0"
    >
      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        {suspectCount > 0
          ? `Session recovered after unexpected exit — ${suspectCount} ${suspectCount === 1 ? "panel" : "panels"} created near the crash may be affected.`
          : "Session recovered after unexpected exit."}
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss recovery confirmation"
        className="p-1 rounded hover:bg-[var(--color-status-warning)]/10 transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
