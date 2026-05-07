let mcpSpawnFocusSuppressionDepth = 0;

export function isMcpSpawnFocusSuppressed(): boolean {
  return mcpSpawnFocusSuppressionDepth > 0;
}

export async function runWithMcpSpawnFocusSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  mcpSpawnFocusSuppressionDepth += 1;
  try {
    return await fn();
  } finally {
    mcpSpawnFocusSuppressionDepth = Math.max(0, mcpSpawnFocusSuppressionDepth - 1);
  }
}
