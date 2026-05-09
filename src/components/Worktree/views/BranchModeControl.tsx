import { cn } from "@/lib/utils";

type BranchMode = "new" | "existing";

interface BranchModeControlProps {
  branchMode: BranchMode;
  onChange: (mode: BranchMode) => void;
  disabled?: boolean;
}

export function BranchModeControl({ branchMode, onChange, disabled }: BranchModeControlProps) {
  return (
    <div
      className="inline-flex rounded-[var(--radius-md)] bg-daintree-border/50 p-0.5"
      role="radiogroup"
      aria-label="Branch mode"
    >
      <button
        type="button"
        role="radio"
        aria-checked={branchMode === "new"}
        onClick={() => onChange("new")}
        disabled={disabled}
        className={cn(
          "px-3 py-1 text-sm font-medium rounded-[var(--radius-sm)] transition-colors",
          branchMode === "new"
            ? "bg-daintree-bg text-daintree-text shadow-sm"
            : "text-daintree-text/60 hover:text-daintree-text"
        )}
      >
        New Branch
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={branchMode === "existing"}
        onClick={() => onChange("existing")}
        disabled={disabled}
        className={cn(
          "px-3 py-1 text-sm font-medium rounded-[var(--radius-sm)] transition-colors",
          branchMode === "existing"
            ? "bg-daintree-bg text-daintree-text shadow-sm"
            : "text-daintree-text/60 hover:text-daintree-text"
        )}
      >
        Existing Branch
      </button>
    </div>
  );
}
