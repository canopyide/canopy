import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpIntroBannerProps {
  onDismiss: () => void;
  onLinkClick: () => void;
}

export function HelpIntroBanner({ onDismiss, onLinkClick }: HelpIntroBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 shrink-0",
        "bg-overlay-subtle border-b border-daintree-border text-[11px] text-daintree-text/50"
      )}
    >
      <span className="flex-1 min-w-0 truncate">
        New here?{" "}
        <button
          type="button"
          onClick={onLinkClick}
          className={cn(
            "text-daintree-text underline underline-offset-4",
            "decoration-daintree-border hover:decoration-daintree-text",
            "transition-colors"
          )}
        >
          See what the Daintree Assistant can do
        </button>
        .
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-daintree-text/40 hover:text-daintree-text/70 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
