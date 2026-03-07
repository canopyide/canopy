import { useCallback } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { actionService } from "@/services/ActionService";
import { useVoiceRecordingStore } from "@/store/voiceRecordingStore";
import { voiceRecordingService } from "@/services/VoiceRecordingService";

interface VoiceInputButtonProps {
  panelId: string;
  panelTitle?: string;
  projectId?: string;
  projectName?: string;
  worktreeId?: string;
  worktreeLabel?: string;
  disabled?: boolean;
}

export function VoiceInputButton({
  panelId,
  panelTitle,
  projectId,
  projectName,
  worktreeId,
  worktreeLabel,
  disabled = false,
}: VoiceInputButtonProps) {
  const status = useVoiceRecordingStore((state) => state.status);
  const isConfigured = useVoiceRecordingStore((state) => state.isConfigured);
  const errorMessage = useVoiceRecordingStore((state) => state.errorMessage);
  const elapsedSeconds = useVoiceRecordingStore((state) => state.elapsedSeconds);
  const activePanelId = useVoiceRecordingStore((state) => state.activeTarget?.panelId ?? null);

  const isRecording = activePanelId === panelId && status === "recording";
  const isConnecting = activePanelId === panelId && status === "connecting";

  const handleClick = useCallback(async () => {
    if (disabled && !isRecording && !isConnecting) return;

    if (!isConfigured && !isRecording && !isConnecting) {
      const fresh = await window.electron?.voiceInput?.getSettings();
      if (fresh?.enabled && fresh.apiKey) {
        void voiceRecordingService.toggle({
          panelId,
          panelTitle,
          projectId,
          projectName,
          worktreeId,
          worktreeLabel,
        });
        return;
      }

      void actionService.dispatch("app.settings.openTab", { tab: "voice" }, { source: "user" });
      return;
    }

    void voiceRecordingService.toggle({
      panelId,
      panelTitle,
      projectId,
      projectName,
      worktreeId,
      worktreeLabel,
    });
  }, [
    disabled,
    isConfigured,
    isConnecting,
    isRecording,
    panelId,
    panelTitle,
    projectId,
    projectName,
    worktreeId,
    worktreeLabel,
  ]);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled && !isRecording && !isConnecting}
        title={
          !isConfigured
            ? "Configure voice input"
            : status === "error"
              ? (errorMessage ?? "Voice input error")
              : isRecording
                ? "Stop recording"
                : "Start voice input"
        }
        className={cn(
          "flex items-center justify-center rounded p-1 transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent focus-visible:outline-offset-1",
          isRecording
            ? "text-red-400 hover:text-red-300"
            : isConnecting
              ? "text-canopy-text/40"
              : status === "error"
                ? "text-yellow-400 hover:text-yellow-300"
                : "text-canopy-text/40 hover:text-canopy-text/70",
          disabled && !isRecording && "pointer-events-none opacity-40"
        )}
        aria-label={
          !isConfigured
            ? "Set up voice input"
            : isRecording
              ? "Stop voice recording"
              : "Start voice recording"
        }
        aria-pressed={isConfigured ? isRecording : undefined}
      >
        {isConnecting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isRecording ? (
          <div className="relative">
            <Mic className="h-3.5 w-3.5" />
            <span className="absolute -right-1 -top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
          </div>
        ) : isConfigured ? (
          <Mic className="h-3.5 w-3.5" />
        ) : (
          <MicOff className="h-3.5 w-3.5" />
        )}
      </button>

      {isRecording && (
        <span className="ml-1 font-mono text-[10px] tabular-nums text-red-400/80">
          {formatDuration(elapsedSeconds)}
        </span>
      )}
    </div>
  );
}
