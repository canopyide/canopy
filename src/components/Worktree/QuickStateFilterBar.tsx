import { cn } from "@/lib/utils";
import type { QuickStateFilter } from "@/lib/worktreeFilters";
import { STATE_ICONS, STATE_COLORS } from "./terminalStateConfig";

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
  working: { Icon: STATE_ICONS.working, color: STATE_COLORS.working },
  waiting: { Icon: STATE_ICONS.waiting, color: STATE_COLORS.waiting },
  finished: { Icon: STATE_ICONS.completed, color: STATE_COLORS.completed },
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
      className="flex items-center gap-1 px-4 py-1.5 border-b border-border-default"
      role="toolbar"
      aria-label="Quick state filter"
    >
      {FILTER_OPTIONS.map((option) => {
        const isActive = option.value === value;
        const count = counts && option.value !== "all" ? counts[option.value] : undefined;
        const visual = option.value === "all" ? null : FILTER_VISUALS[option.value];
        const Icon = visual?.Icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(isActive ? "all" : option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full transition-colors",
              isActive
                ? "bg-filter-selected-bg-soft ring-1 ring-inset ring-border-strong text-daintree-text font-medium"
                : "text-daintree-text/60 hover:text-daintree-text hover:bg-tint/[0.04]"
            )}
          >
            {Icon && visual && (
              <Icon
                className={cn(
                  "w-3.5 h-3.5",
                  visual.color,
                  option.value === "working" &&
                    workingActive &&
                    "animate-spin-slow motion-reduce:animate-none"
                )}
              />
            )}
            {option.label}
            {/* "All" has no count — quickStateCounts excludes main/integration worktrees, so the sum != the sidebar header's (N) total. */}
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
