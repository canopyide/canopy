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
  counts?: Record<QuickStateFilter, number>;
  /**
   * Optional affordance pinned to the trailing edge of the filter row, past a
   * divider — currently the compact "arm matching terminals" icon button. Kept
   * as an opaque slot so this stays a pure presentational component.
   */
  trailing?: React.ReactNode;
}

export function QuickStateFilterBar({
  value,
  onChange,
  counts,
  trailing,
}: QuickStateFilterBarProps) {
  const workingActive = counts !== undefined && counts.working > 0;
  return (
    <div
      className="flex border-b border-border-default"
      role="toolbar"
      aria-label="Quick state filter"
    >
      {FILTER_OPTIONS.map((option, idx) => {
        const isActive = option.value === value;
        const rawCount = counts ? counts[option.value] : undefined;
        const showCount = rawCount !== undefined && rawCount > 0;
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
              "inline-flex items-center justify-center gap-1 min-w-0 px-2 py-1.5 text-[11px] transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-daintree-accent",
              option.value !== "all" && "flex-1",
              idx > 0 && "border-l border-border-default",
              isActive
                ? "text-daintree-text font-medium shadow-[inset_0_-2px_0_0_var(--color-text-secondary)]"
                : "text-daintree-text/60 hover:text-daintree-text hover:bg-tint/[0.04]"
            )}
          >
            {Icon && visual && (
              <Icon
                className={cn(
                  "w-3 h-3 shrink-0",
                  visual.color,
                  isSpinningWorking && "animate-spin-slow motion-reduce:animate-none"
                )}
              />
            )}
            <span className="truncate">{option.label}</span>
            {showCount && (
              <>
                <span aria-hidden="true">{` (${rawCount})`}</span>
                <span className="sr-only">{`, ${rawCount} ${rawCount === 1 ? "worktree" : "worktrees"}`}</span>
              </>
            )}
          </button>
        );
      })}
      {trailing && <div className="flex shrink-0 border-l border-border-default">{trailing}</div>}
    </div>
  );
}
