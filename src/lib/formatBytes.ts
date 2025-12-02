/**
 * Format bytes to human-readable size string
 * @param bytes - Number of bytes to format
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number): string {
  // Handle non-positive values
  if (bytes <= 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];

  // Calculate unit index and clamp to valid range
  let i = Math.floor(Math.log(bytes) / Math.log(k));
  i = Math.max(0, Math.min(i, sizes.length - 1));

  // Calculate the value in the selected unit
  const value = bytes / Math.pow(k, i);
  const rounded = parseFloat(value.toFixed(1));

  // Handle rounding up to next unit (e.g., 1023.95 KB → 1 MB)
  if (rounded >= k && i < sizes.length - 1) {
    return `${parseFloat((rounded / k).toFixed(1))} ${sizes[i + 1]}`;
  }

  return `${rounded} ${sizes[i]}`;
}
