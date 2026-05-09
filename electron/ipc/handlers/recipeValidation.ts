const USAGE_HISTORY_LIMIT = 20;

export function assertRecipeUsageFields(value: {
  lastUsedAt?: unknown;
  usageHistory?: unknown;
}): void {
  if (value.lastUsedAt !== undefined && !Number.isFinite(value.lastUsedAt)) {
    throw new Error("Recipe lastUsedAt must be a finite number");
  }
  if (value.usageHistory !== undefined) {
    if (!Array.isArray(value.usageHistory)) {
      throw new Error("Recipe usageHistory must be an array");
    }
    if (value.usageHistory.length > USAGE_HISTORY_LIMIT) {
      throw new Error(`Recipe usageHistory must not exceed ${USAGE_HISTORY_LIMIT} entries`);
    }
    for (const entry of value.usageHistory) {
      if (!Number.isFinite(entry)) {
        throw new Error("Recipe usageHistory entries must be finite numbers");
      }
    }
  }
}
