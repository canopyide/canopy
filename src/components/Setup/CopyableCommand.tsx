import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopyWithFeedback } from "@/hooks/useCopyWithFeedback";

export function CopyableCommand({ command }: { command: string }) {
  const { copied, copy } = useCopyWithFeedback();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] bg-overlay-subtle border border-daintree-border font-mono text-xs select-text group">
      <span className="flex-1 truncate text-daintree-text/70">{command}</span>
      <button
        type="button"
        onClick={() => void copy(command)}
        className="shrink-0 p-0.5 rounded hover:bg-overlay transition-colors duration-150 text-daintree-text/30 hover:text-daintree-text/60"
        aria-label="Copy command to clipboard"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check key="check" className={cn("w-3.5 h-3.5 text-status-success animate-badge-bump")} />
        ) : (
          <Copy key="copy" className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
