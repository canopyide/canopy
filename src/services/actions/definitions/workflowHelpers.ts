const PARTIAL_SUCCESS_PREFIX = "PARTIAL_SUCCESS:";

export function partialSuccessError(message: string, partial: Record<string, unknown>): Error {
  const payload = JSON.stringify({ message, partialResult: partial });
  return new Error(`${PARTIAL_SUCCESS_PREFIX} ${payload}`);
}

export function slugifyForBranch(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "work"
  );
}
