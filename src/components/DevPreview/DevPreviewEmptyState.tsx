import { useState, useCallback, type KeyboardEvent } from "react";
import { Settings, WandSparkles, ChevronDown, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { SHELL_CONTROL_RE } from "@/utils/devServerDetection";
import type { RunCommand } from "@shared/types";

interface DevPreviewEmptyStateProps {
  /** True when the project has no dev command configured (first-run). */
  isUnconfigured: boolean;
  /** The inferred dev-server candidate (priority script or devcontainer fallback). */
  detectedCandidate: RunCommand | undefined;
  /** Full list of detected runners, surfaced behind the picker. */
  allDetectedRunners: RunCommand[] | undefined;
  isAutoDetecting: boolean;
  isSettingsLoading: boolean;
  isSavingManual: boolean;
  /** Primary CTA — re-detects and saves with autoDetected=true. */
  onAutoDetect: () => void;
  /** Picker selection — saves the chosen runner with autoDetected=false. */
  onSelectRunner: (runner: RunCommand) => void;
  /** No-candidate branch — saves the typed command with autoDetected=false. */
  onManualSubmit: (command: string) => void;
  onOpenSettings: () => void;
}

export function DevPreviewEmptyState({
  isUnconfigured,
  detectedCandidate,
  allDetectedRunners,
  isAutoDetecting,
  isSettingsLoading,
  isSavingManual,
  onAutoDetect,
  onSelectRunner,
  onManualSubmit,
  onOpenSettings,
}: DevPreviewEmptyStateProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [manualCommand, setManualCommand] = useState("");

  const trimmedManual = manualCommand.trim();
  const isManualInvalid =
    trimmedManual.length === 0 || SHELL_CONTROL_RE.test(trimmedManual) || isSavingManual;

  const handleSelect = useCallback(
    (runner: RunCommand) => {
      setIsPickerOpen(false);
      onSelectRunner(runner);
    },
    [onSelectRunner]
  );

  const submitManual = useCallback(() => {
    if (trimmedManual.length === 0 || SHELL_CONTROL_RE.test(trimmedManual) || isSavingManual) {
      return;
    }
    onManualSubmit(trimmedManual);
  }, [trimmedManual, isSavingManual, onManualSubmit]);

  const handleManualKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitManual();
      }
    },
    [submitManual]
  );

  if (!isUnconfigured) {
    return (
      <div className="flex flex-col items-center text-center max-w-md">
        <h3 className="text-sm font-medium text-daintree-text/70 mb-1">Waiting for dev server</h3>
        <p className="text-xs text-daintree-text/50 leading-relaxed">
          The dev server will appear here once it starts and a URL is detected
        </p>
      </div>
    );
  }

  if (detectedCandidate) {
    const pickerRunners = allDetectedRunners ?? [];
    return (
      <div className="flex flex-col items-center text-center max-w-md">
        <h3 className="text-sm font-medium text-daintree-text/70 mb-1">Start the dev server</h3>
        <p className="text-xs text-daintree-text/50 mb-4 leading-relaxed">
          No dev command is set for this project yet
        </p>

        <div className="mb-4 inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-daintree-border bg-overlay-subtle px-2.5 py-1.5">
          <span className="font-mono text-xs text-daintree-text/80">
            {detectedCandidate.command}
          </span>
          {/* TODO(#8266): render detected port here once port extraction lands */}
        </div>

        <div className="flex flex-col items-center gap-2">
          <Button
            onClick={onAutoDetect}
            disabled={isAutoDetecting || isSettingsLoading}
            size="sm"
            className="gap-1.5"
          >
            <WandSparkles className="h-3.5 w-3.5" />
            <span className="text-xs">
              {isAutoDetecting ? "Starting…" : "Start the dev server"}
            </span>
          </Button>

          {pickerRunners.length > 1 && (
            <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-daintree-text/50 hover:text-daintree-text/70 transition-colors"
                >
                  Use a different script…
                  <ChevronDown className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" className="w-64 p-1">
                <div className="max-h-48 overflow-y-auto">
                  {pickerRunners.map((runner) => (
                    <button
                      key={runner.id}
                      type="button"
                      onClick={() => handleSelect(runner)}
                      className="flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left hover:bg-overlay-subtle transition-colors"
                    >
                      <span className="text-xs text-daintree-text/80">{runner.name}</span>
                      <span className="font-mono text-[11px] text-daintree-text/50">
                        {runner.command}
                      </span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          <Button
            onClick={onOpenSettings}
            variant="ghost"
            size="sm"
            className="gap-1.5 px-2.5 py-1.5 group text-daintree-text/40 hover:text-daintree-text/60"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="text-xs">Open project settings</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center max-w-md">
      <h3 className="text-sm font-medium text-daintree-text/70 mb-1">Set a dev command</h3>
      <p className="text-xs text-daintree-text/50 mb-4 leading-relaxed">
        Enter the command that starts your dev server
      </p>

      <div className="flex w-full max-w-xs items-center gap-2">
        <input
          type="text"
          value={manualCommand}
          onChange={(e) => setManualCommand(e.target.value)}
          onKeyDown={handleManualKeyDown}
          placeholder="npm run dev"
          spellCheck={false}
          autoComplete="off"
          aria-label="Dev server command"
          className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-daintree-border bg-surface-canvas px-3 py-1.5 font-mono text-xs text-daintree-text placeholder:text-daintree-text/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent focus-visible:outline-offset-1"
        />
        <Button
          onClick={submitManual}
          disabled={isManualInvalid}
          size="sm"
          className="gap-1.5 shrink-0"
          title={
            trimmedManual.length > 0 && SHELL_CONTROL_RE.test(trimmedManual)
              ? "Command contains shell control characters"
              : undefined
          }
        >
          <Play className="h-3.5 w-3.5" />
          <span className="text-xs">{isSavingManual ? "Starting…" : "Start server"}</span>
        </Button>
      </div>

      <Button
        onClick={onOpenSettings}
        variant="ghost"
        size="sm"
        className="mt-3 gap-1.5 px-2.5 py-1.5 group text-daintree-text/40 hover:text-daintree-text/60"
      >
        <Settings className="h-3.5 w-3.5" />
        <span className="text-xs">Open project settings</span>
      </Button>
    </div>
  );
}
