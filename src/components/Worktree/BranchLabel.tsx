import { useMemo } from "react";
import { cn } from "../../lib/utils";
import { middleTruncate } from "../../utils/textParsing";

interface BranchLabelProps {
  label: string;
  isActive: boolean;
  isMainWorktree?: boolean;
  className?: string;
}

const PREFIX_COLORS: Record<string, string> = {
  feature: "text-teal-500",
  feat: "text-teal-500",
  bugfix: "text-red-400",
  hotfix: "text-red-400",
  fix: "text-red-400",
  chore: "text-gray-500",
  docs: "text-blue-400",
  refactor: "text-purple-400",
  test: "text-yellow-400",
};

export function BranchLabel({ label, isActive, isMainWorktree, className }: BranchLabelProps) {
  const { prefix, rest } = useMemo(() => {
    const parts = label.split("/");
    if (parts.length <= 1) {
      return { prefix: null, rest: middleTruncate(label, 40) };
    }
    const [p, ...tail] = parts;
    return {
      prefix: p,
      rest: middleTruncate(tail.join("/"), 36),
    };
  }, [label]);

  const prefixColor = prefix ? PREFIX_COLORS[prefix.toLowerCase()] ?? "text-gray-500" : undefined;

  return (
    <span className={cn("flex items-baseline gap-1 min-w-0", className)} title={label}>
      {prefix && (
        <span
          className={cn(
            "text-[10px] font-semibold tracking-wide uppercase shrink-0",
            prefixColor
          )}
        >
          {prefix}/
        </span>
      )}
      <span
        className={cn(
          "truncate font-semibold text-[14px]",
          isActive ? "text-white" : "text-gray-300",
          isMainWorktree && "font-bold tracking-wide"
        )}
      >
        {rest}
      </span>
    </span>
  );
}
