import { Loader2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useKeybindingDisplay } from "@/hooks";
import { useVoiceRecordingStore } from "@/store/voiceRecordingStore";
import { voiceRecordingService } from "@/services/VoiceRecordingService";

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function VoiceRecordingToolbarButton() {
  const activeTarget = useVoiceRecordingStore((state) => state.activeTarget);
  const status = useVoiceRecordingStore((state) => state.status);
  const elapsedSeconds = useVoiceRecordingStore((state) => state.elapsedSeconds);
  const shortcut = useKeybindingDisplay("voiceInput.toggle");

  if (!activeTarget || (status !== "connecting" && status !== "recording")) {
    return null;
  }

  const contextLabel = [activeTarget.projectName, activeTarget.worktreeLabel]
    .filter(Boolean)
    .join(" / ");
  const title =
    status === "connecting"
      ? "Preparing dictation"
      : contextLabel
        ? `Recording: ${contextLabel}`
        : "Recording in another panel";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div role="status" aria-live="polite" aria-label={title}>
            <Button
              variant="ghost"
              onClick={() => {
                void voiceRecordingService.focusActiveTarget();
              }}
              className={cn(
                "h-8 gap-2 rounded-full border border-red-400/25 bg-red-500/10 px-3 text-red-100",
                "hover:border-red-300/40 hover:bg-red-500/15 hover:text-white"
              )}
            >
              {status === "connecting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="relative flex items-center">
                  <Mic className="h-4 w-4" />
                  <span className="absolute -right-1 -top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                </span>
              )}
              <span className="max-w-44 truncate text-xs font-medium">{title}</span>
              {status === "recording" && (
                <span className="font-mono text-[11px] tabular-nums text-red-100/80">
                  {formatDuration(elapsedSeconds)}
                </span>
              )}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">{shortcut ? `${title} (${shortcut})` : title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
