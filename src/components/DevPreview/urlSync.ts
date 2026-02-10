export function shouldAdoptDetectedDevServerUrl(detectedUrl: string, currentUrl: string): boolean {
  if (!detectedUrl) return false;
  if (!currentUrl) return true;
  if (detectedUrl === currentUrl) return false;

  try {
    return new URL(detectedUrl).origin !== new URL(currentUrl).origin;
  } catch {
    // Fallback to detected URL if either URL cannot be parsed.
    return true;
  }
}
