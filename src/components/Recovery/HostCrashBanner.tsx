import { useState, type CSSProperties } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { CrashType } from "@shared/types/pty-host";
import { cn } from "@/lib/utils";
import { usePanelStore } from "@/store/panelStore";
import { actionService } from "@/services/ActionService";
import { InlineStatusBanner } from "@/components/Terminal/InlineStatusBanner";
import { logError } from "@/utils/logger";
import { useDeferredLoading } from "@/hooks/useDeferredLoading";
import { UI_DOHERTY_THRESHOLD } from "@/lib/animationUtils";

function SpinnerIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <Loader2
      className={cn("animate-spin motion-reduce:animate-none", className)}
      style={style}
      aria-hidden="true"
    />
  );
}

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
      <InlineStatusBanner
        icon={SpinnerIcon}
        title="Terminal service restarting"
        description="The terminal backend stopped and is restarting automatically."
        severity="warning"
        role="alert"
        animated={false}
        actions={[]}
      />
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
    <InlineStatusBanner
      icon={AlertTriangle}
      title={title}
      description={body}
      severity="error"
      role="alert"
      animated={false}
      actions={[
        {
          id: "restart",
          label: isRestarting ? "Restarting…" : "Restart service",
          variant: "dangerFilled",
          onClick: handleRestart,
          disabled: isRestarting,
        },
      ]}
    />
  );
}
