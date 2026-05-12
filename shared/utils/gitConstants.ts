export const PROTECTED_BRANCHES = ["main", "master", "develop", "development"] as const;

export type ProtectedBranch = (typeof PROTECTED_BRANCHES)[number];

export function isProtectedBranch(branch: string | null | undefined): boolean {
  if (!branch) return false;
  return (PROTECTED_BRANCHES as readonly string[]).includes(branch);
}
