const GIB = 1024 ** 3;

export function computeDefaultCachedViews(totalMemBytes: number): number {
  if (!Number.isFinite(totalMemBytes) || totalMemBytes <= 0) return 1;
  if (totalMemBytes >= 64 * GIB) return 3;
  if (totalMemBytes >= 32 * GIB) return 2;
  return 1;
}

export function isValidCachedProjectViews(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}
