import { useMemo } from "react";
import { cn } from "../../lib/utils";
import { middleTruncate } from "../../utils/textParsing";

interface BranchLabelProps {
  label: string;
  isActive: boolean;
  isMainWorktree?: boolean;
  className?: string;
}

// Color schemes for prefix types
const COLORS = {
  teal: { bg: "bg-teal-500/10", border: "border-teal-500/30", text: "text-teal-400" },
  red: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400" },
  gray: { bg: "bg-canopy-border/20", border: "border-canopy-border", text: "text-canopy-text/60" },
  blue: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400" },
  purple: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400" },
  yellow: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400" },
  orange: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400" },
} as const;

// Prefix configuration: maps raw prefix to display name and color
// Supports both long forms ("feature" → "Feature") and short forms ("feat" → "FEAT")
const PREFIX_CONFIG: Record<
  string,
  { displayName: string; colors: (typeof COLORS)[keyof typeof COLORS] }
> = {
  // Feature branches
  feature: { displayName: "Feature", colors: COLORS.teal },
  feat: { displayName: "FEAT", colors: COLORS.teal },
  // Bug fixes
  bugfix: { displayName: "Bugfix", colors: COLORS.red },
  hotfix: { displayName: "Hotfix", colors: COLORS.red },
  fix: { displayName: "FIX", colors: COLORS.red },
  // Maintenance
  chore: { displayName: "Chore", colors: COLORS.gray },
  // Documentation
  docs: { displayName: "Docs", colors: COLORS.blue },
  doc: { displayName: "DOC", colors: COLORS.blue },
  // Refactoring
  refactor: { displayName: "Refactor", colors: COLORS.purple },
  refact: { displayName: "REFACT", colors: COLORS.purple },
  // Testing
  test: { displayName: "Test", colors: COLORS.yellow },
  tests: { displayName: "Tests", colors: COLORS.yellow },
  // Release
  release: { displayName: "Release", colors: COLORS.orange },
  rel: { displayName: "REL", colors: COLORS.orange },
  // Dependency updates
  deps: { displayName: "DEPS", colors: COLORS.gray },
  dependabot: { displayName: "Dependabot", colors: COLORS.gray },
  // CI/Build
  ci: { displayName: "CI", colors: COLORS.blue },
  build: { displayName: "Build", colors: COLORS.blue },
  // Performance
  perf: { displayName: "PERF", colors: COLORS.purple },
  // Styling
  style: { displayName: "Style", colors: COLORS.blue },
  // Work in progress
  wip: { displayName: "WIP", colors: COLORS.yellow },
};

// Default styling for unknown prefixes
const DEFAULT_CONFIG = { colors: COLORS.gray };

export function BranchLabel({ label, isActive, isMainWorktree, className }: BranchLabelProps) {
  const { displayName, colors, rest } = useMemo(() => {
    const parts = label.split("/");
    if (parts.length <= 1) {
      // No prefix - just show the branch name
      return { prefix: null, displayName: null, colors: null, rest: middleTruncate(label, 40) };
    }
    const [p, ...tail] = parts;
    const config = PREFIX_CONFIG[p.toLowerCase()];

    if (config) {
      // Known prefix - use configured display name
      return {
        prefix: p,
        displayName: config.displayName,
        colors: config.colors,
        rest: middleTruncate(tail.join("/"), 36),
      };
    } else {
      // Unknown prefix - show as-is with gray styling
      return {
        prefix: p,
        displayName:
          p.length <= 4 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
        colors: DEFAULT_CONFIG.colors,
        rest: middleTruncate(tail.join("/"), 36),
      };
    }
  }, [label]);

  return (
    <span className={cn("flex items-center gap-1.5 min-w-0", className)} title={label}>
      {displayName && colors && (
        <span
          className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0",
            colors.bg,
            colors.border,
            colors.text
          )}
        >
          {displayName}
        </span>
      )}
      <span
        className={cn(
          "truncate font-semibold text-[13px]",
          isActive ? "text-white" : "text-canopy-text",
          isMainWorktree && "font-bold tracking-wide"
        )}
      >
        {rest}
      </span>
    </span>
  );
}
