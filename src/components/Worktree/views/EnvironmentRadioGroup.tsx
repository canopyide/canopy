import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface EnvironmentRadioGroupProps {
  worktreeMode: string;
  onChange: (mode: string) => void;
  resourceEnvironments: Record<string, unknown> | undefined;
  hasAnyEnvironments: boolean;
  disabled?: boolean;
}

export function EnvironmentRadioGroup({
  worktreeMode,
  onChange,
  resourceEnvironments,
  hasAnyEnvironments,
  disabled,
}: EnvironmentRadioGroupProps) {
  if (!hasAnyEnvironments) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="block text-sm font-medium text-daintree-text">Environment</label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-daintree-text/40 hover:text-daintree-text/60 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-daintree-accent focus-visible:ring-offset-2"
              aria-label="Help for Environment field"
              disabled={disabled}
            >
              <Info className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>
              Choose where this worktree runs. Non-local environments provision remote compute from
              project environment settings.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div
        className="inline-flex rounded-[var(--radius-md)] bg-daintree-border/50 p-0.5"
        role="radiogroup"
        aria-label="Worktree environment mode"
      >
        <button
          type="button"
          role="radio"
          aria-checked={worktreeMode === "local"}
          onClick={() => onChange("local")}
          disabled={disabled}
          className={cn(
            "px-3 py-1 text-sm font-medium rounded-[var(--radius-sm)] transition-colors",
            worktreeMode === "local"
              ? "bg-daintree-bg text-daintree-text shadow-sm"
              : "text-daintree-text/60 hover:text-daintree-text"
          )}
        >
          Local
        </button>
        {Object.entries(resourceEnvironments ?? {}).map(([key]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={worktreeMode === key}
            onClick={() => onChange(key)}
            disabled={disabled}
            className={cn(
              "px-3 py-1 text-sm font-medium rounded-[var(--radius-sm)] transition-colors",
              worktreeMode === key
                ? "bg-daintree-bg text-daintree-text shadow-sm"
                : "text-daintree-text/60 hover:text-daintree-text"
            )}
          >
            {key}
          </button>
        ))}
      </div>
      {worktreeMode !== "local" && (
        <p className="text-xs text-daintree-text/50">
          Provisions {worktreeMode} environment after worktree setup
        </p>
      )}
    </div>
  );
}
