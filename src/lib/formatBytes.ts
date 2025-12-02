export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];

  let i = Math.floor(Math.log(bytes) / Math.log(k));
  i = Math.max(0, Math.min(i, sizes.length - 1));

  const value = bytes / Math.pow(k, i);
  const rounded = parseFloat(value.toFixed(1));

  // Handle rounding up to next unit (e.g., 1023.95 KB → 1 MB)
  if (rounded >= k && i < sizes.length - 1) {
    return `${parseFloat((rounded / k).toFixed(1))} ${sizes[i + 1]}`;
  }

  return `${rounded} ${sizes[i]}`;
}
