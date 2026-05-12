import { cn } from "@/lib/utils";
import type { QuickStateFilter } from "@/lib/worktreeFilters";
import { HollowCircle, SpinnerCircle } from "@/components/icons";
import { STATE_COLORS } from "./terminalStateConfig";

const FILTER_OPTIONS: { value: QuickStateFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "working", label: "Working" },
  { value: "waiting", label: "Waiting" },
  { value: "finished", label: "Finished" },
];

const FILTER_VISUALS: Record<
  Exclude<QuickStateFilter, "all">,
  { Icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  working: { Icon: HollowCircle, color: STATE_COLORS.working },
  waiting: { Icon: HollowCircle, color: STATE_COLORS.waiting },
  finished: { Icon: HollowCircle, color: STATE_COLORS.completed },
};

interface QuickStateFilterBarProps {
  value: QuickStateFilter;
  onChange: (value: QuickStateFilter) => void;
  counts?: Record<"working" | "waiting" | "finished", number>;
}

export function QuickStateFilterBar({ value, onChange, counts }: QuickStateFilterBarProps) {
  const workingActive = counts !== undefined && counts.working > 0;
  return (
    <div
      className="flex items-center gap-0.5 px-4 py-1.5 border-b border-border-default"
      role="toolbar"
      aria-label="Quick state filter"
    >
      {FILTER_OPTIONS.map((option) => {
        const isActive = option.value === value;
        const count = counts && option.value !== "all" ? counts[option.value] : undefined;
        const visual = option.value === "all" ? null : FILTER_VISUALS[option.value];
        const isSpinningWorking = option.value === "working" && workingActive;
        const Icon = isSpinningWorking ? SpinnerCircle : visual?.Icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(isActive ? "all" : option.value)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-full transition-colors",
              isActive
                ? "bg-filter-selected-bg-soft ring-1 ring-inset ring-border-strong text-daintree-text font-medium"
                : "text-daintree-text/60 hover:text-daintree-text hover:bg-tint/[0.04]"
            )}
          >
            {Icon && visual && (
              <Icon
                className={cn(
                  "w-3 h-3",
                  visual.color,
                  isSpinningWorking && "animate-spin-slow motion-reduce:animate-none"
                )}
              />
            )}
            {option.label}
            {count !== undefined && (
              <>
                <span aria-hidden="true">{` (${count})`}</span>
                <span className="sr-only">{`, ${count} ${count === 1 ? "worktree" : "worktrees"}`}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
