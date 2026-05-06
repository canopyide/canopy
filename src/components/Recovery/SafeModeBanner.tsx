import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useSafeModeStore } from "@/store/safeModeStore";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { logError } from "@/utils/logger";

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function SafeModeBanner() {
  const safeMode = useSafeModeStore((s) => s.safeMode);
  const dismissed = useSafeModeStore((s) => s.dismissed);
  const crashCount = useSafeModeStore((s) => s.crashCount);
  const skippedPanelCount = useSafeModeStore((s) => s.skippedPanelCount);
  const lastCrashAt = useSafeModeStore((s) => s.lastCrashAt);
  const dismiss = useSafeModeStore((s) => s.dismiss);
  const [isRestarting, setIsRestarting] = useState(false);

  if (!safeMode || dismissed) return null;

  const handleRestart = async () => {
    if (isRestarting) return;
    setIsRestarting(true);
    try {
      await window.electron.app.resetAndRelaunch();
    } catch (error) {
      logError("Failed to restart from safe mode", error);
      setIsRestarting(false);
    }
  };

  const skipped =
    Number.isFinite(skippedPanelCount) && (skippedPanelCount as number) > 0
      ? (skippedPanelCount as number)
      : 0;
  const crashes =
    Number.isFinite(crashCount) && (crashCount as number) > 0 ? (crashCount as number) : 0;
  const hasTimestamp = Number.isFinite(lastCrashAt);
  const hasCrashMeta = crashes > 0 || hasTimestamp;
  const hasDetails = skipped > 0 || hasCrashMeta;

  let crashMetaText: string | null = null;
  if (crashes > 0 && hasTimestamp) {
    crashMetaText = `${crashes} ${crashes === 1 ? "crash" : "crashes"} detected, last ${formatRelativeTime(lastCrashAt as number)}`;
  } else if (crashes > 0) {
    crashMetaText = `${crashes} ${crashes === 1 ? "crash" : "crashes"} detected`;
  } else if (hasTimestamp) {
    crashMetaText = `Last crash ${formatRelativeTime(lastCrashAt as number)}`;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 px-4 py-2 bg-[var(--color-status-warning)]/15 border-b border-[var(--color-status-warning)]/30 text-[var(--color-status-warning)] text-sm shrink-0"
    >
      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">Safe mode — panels weren't restored</span>
      {hasDetails && (
        <Popover>
          <PopoverTrigger
            type="button"
            className="text-xs px-2 py-1 rounded border border-[var(--color-status-warning)]/30 hover:bg-[var(--color-status-warning)]/10 transition-colors shrink-0"
          >
            Show details
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="p-3 text-xs max-w-xs space-y-2 text-daintree-text"
          >
            {crashMetaText && <p className="font-medium">{crashMetaText}</p>}
            {skipped > 0 && (
              <p className="text-daintree-text/70">
                {skipped} {skipped === 1 ? "panel was" : "panels were"} skipped so you can recover
                the app. Restart normally to reload them.
              </p>
            )}
          </PopoverContent>
        </Popover>
      )}
      <button
        type="button"
        onClick={handleRestart}
        disabled={isRestarting}
        className="text-xs px-2 py-1 rounded border border-[var(--color-status-warning)]/30 hover:bg-[var(--color-status-warning)]/10 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRestarting ? "Restarting…" : "Restart normally"}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss safe mode banner"
        className="p-1 rounded hover:bg-[var(--color-status-warning)]/10 transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
