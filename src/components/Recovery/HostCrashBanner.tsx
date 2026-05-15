import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { CrashType } from "@shared/types/pty-host";
import { usePanelStore } from "@/store/panelStore";
import { actionService } from "@/services/ActionService";
import { logError } from "@/utils/logger";
import { useDeferredLoading } from "@/hooks/useDeferredLoading";
import { UI_DOHERTY_THRESHOLD } from "@/lib/animationUtils";

interface CrashCopy {
  title: string;
  body: string;
}

function copyForCrash(crashType: CrashType | null): CrashCopy {
  switch (crashType) {
    case "OUT_OF_MEMORY":
      return {
        title: "Terminal service ran out of memory",
        body: "The terminal backend exhausted memory and gave up after three auto-restart attempts. Close unused terminals before restarting.",
      };
    case "SIGNAL_TERMINATED":
      return {
        title: "Terminal service was terminated",
        body: "The OS or a watchdog ended the terminal backend three times in a row. Restart the service to continue.",
      };
    case "ASSERTION_FAILURE":
      return {
        title: "Terminal service hit an assertion failure",
        body: "The terminal backend crashed three times in a row. Restart the service to continue.",
      };
    case "CLEAN_EXIT":
      return {
        title: "Terminal service stopped unexpectedly",
        body: "The terminal backend exited without an error but wasn't asked to. Restart the service to continue.",
      };
    case "UNKNOWN_CRASH":
    default:
      return {
        title: "Terminal service crashed",
        body: "The terminal backend stopped after three auto-restart attempts. Restart the service to continue.",
      };
  }
}

export function HostCrashBanner() {
  const backendStatus = usePanelStore((s) => s.backendStatus);
  const lastCrashType = usePanelStore((s) => s.lastCrashType);
  const [isRestarting, setIsRestarting] = useState(false);
  const recoveringShown = useDeferredLoading(backendStatus === "recovering", UI_DOHERTY_THRESHOLD);

  if (backendStatus === "connected") return null;

  if (backendStatus === "recovering") {
    if (!recoveringShown) return null;

    return (
      <div
        role="alert"
        className="flex items-start gap-3 px-4 py-2 bg-[var(--color-status-warning)]/10 border-b border-[var(--color-status-warning)]/25 text-[var(--color-status-warning)] text-sm shrink-0"
      >
        <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" aria-hidden="true" />
        <div className="flex-1 flex flex-col gap-0.5">
          <p className="font-medium">Terminal service restarting</p>
          <p>The terminal backend stopped and is restarting automatically.</p>
        </div>
      </div>
    );
  }

  const { title, body } = copyForCrash(lastCrashType);

  const handleRestart = async () => {
    if (isRestarting) return;
    setIsRestarting(true);
    const result = await actionService.dispatch("terminal.restartService", undefined, {
      source: "user",
    });
    if (!result.ok) {
      logError("Failed to restart terminal service from host crash banner", result.error);
      setIsRestarting(false);
    }
  };

  return (
    <div
      role="alert"
      className="flex items-start gap-3 px-4 py-2 bg-[var(--color-status-error)]/15 border-b border-[var(--color-status-error)]/30 text-[var(--color-status-error)] text-sm shrink-0"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 flex flex-col gap-0.5">
        <p className="font-medium">{title}</p>
        <p>{body}</p>
      </div>
      <button
        type="button"
        onClick={handleRestart}
        disabled={isRestarting}
        className="text-xs px-2 py-1 rounded border border-[var(--color-status-error)]/30 hover:bg-[var(--color-status-error)]/10 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed mt-0.5"
      >
        {isRestarting ? "Restarting…" : "Restart service"}
      </button>
    </div>
  );
}
