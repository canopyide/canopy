export interface BranchTypeColors {
  bg: string;
  border: string;
  text: string;
}

export interface BranchType {
  id: string;
  displayName: string;
  prefix: string;
  aliases: string[];
  colors: BranchTypeColors;
}

const COLORS = {
  teal: { bg: "bg-teal-500/10", border: "border-teal-500/30", text: "text-teal-400" },
  red: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400" },
  gray: { bg: "bg-canopy-border/20", border: "border-canopy-border", text: "text-canopy-text/60" },
  amber: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" },
} as const;

export const DEFAULT_BRANCH_TYPE: BranchType = {
  id: "other",
  displayName: "Other",
  prefix: "other",
  aliases: [],
  colors: COLORS.gray,
};

export const BRANCH_TYPES: BranchType[] = [
  {
    id: "feature",
    displayName: "Feature",
    prefix: "feature",
    aliases: ["feat"],
    colors: COLORS.teal,
  },
  {
    id: "bugfix",
    displayName: "Bugfix",
    prefix: "bugfix",
    aliases: ["fix", "hotfix"],
    colors: COLORS.red,
  },
  { id: "chore", displayName: "Chore", prefix: "chore", aliases: [], colors: COLORS.gray },
  { id: "docs", displayName: "Docs", prefix: "docs", aliases: ["doc"], colors: COLORS.gray },
  {
    id: "refactor",
    displayName: "Refactor",
    prefix: "refactor",
    aliases: ["refact"],
    colors: COLORS.amber,
  },
  { id: "test", displayName: "Test", prefix: "test", aliases: ["tests"], colors: COLORS.amber },
  {
    id: "release",
    displayName: "Release",
    prefix: "release",
    aliases: ["rel"],
    colors: COLORS.amber,
  },
  { id: "ci", displayName: "CI", prefix: "ci", aliases: ["build"], colors: COLORS.gray },
  { id: "deps", displayName: "Deps", prefix: "deps", aliases: ["dependabot"], colors: COLORS.gray },
  { id: "perf", displayName: "Perf", prefix: "perf", aliases: [], colors: COLORS.teal },
  { id: "style", displayName: "Style", prefix: "style", aliases: [], colors: COLORS.gray },
  { id: "wip", displayName: "WIP", prefix: "wip", aliases: [], colors: COLORS.amber },
];

export const BRANCH_PREFIX_MAP: Record<string, BranchType> = {};

BRANCH_TYPES.forEach((type) => {
  BRANCH_PREFIX_MAP[type.prefix.toLowerCase()] = type;
  type.aliases.forEach((alias) => {
    BRANCH_PREFIX_MAP[alias.toLowerCase()] = type;
  });
});
