/**
 * Shared utilities for AI service integrations
 */

/**
 * Extract text from OpenAI Responses API output.
 * Handles multiple response formats:
 * - Legacy: response.output_text (string)
 * - Modern: content.text.value (nested object)
 * - Older: content.text (string)
 * - SDK parsed: content.parsed (for json_schema responses)
 * - Chat completions: message.content (standard format)
 */
export function extractOutputText(response: unknown): string | null {
  if (!response || typeof response !== "object") {
    return null;
  }

  const resp = response as Record<string, unknown>;

  // 1. Check for plain output_text (legacy format)
  if (typeof resp.output_text === "string" && resp.output_text.trim().length > 0) {
    return resp.output_text;
  }

  // 2. Check for chat completions format (choices[0].message.content)
  if (Array.isArray(resp.choices) && resp.choices.length > 0) {
    const choice = resp.choices[0] as Record<string, unknown>;
    const message = choice.message as Record<string, unknown> | undefined;
    if (message && typeof message.content === "string") {
      return message.content;
    }
  }

  // 3. Check for output array (responses API)
  if (Array.isArray(resp.output)) {
    for (const item of resp.output) {
      if (
        typeof item === "object" &&
        item !== null &&
        Array.isArray((item as Record<string, unknown>).content)
      ) {
        const result = extractFromContentArray(
          (item as Record<string, unknown>).content as unknown[]
        );
        if (result) return result;
      }
    }
  }

  return null;
}

/**
 * Recursively extract text from a content array.
 * Handles nested content structures.
 */
function extractFromContentArray(contentArray: unknown[]): string | null {
  for (const content of contentArray) {
    if (!content || typeof content !== "object") continue;

    const c = content as Record<string, unknown>;

    // Check for text.value (modern structured format)
    if (typeof c.text === "object" && c.text !== null) {
      const textObj = c.text as Record<string, unknown>;
      if (typeof textObj.value === "string" && textObj.value.trim().length > 0) {
        return textObj.value;
      }
    }

    // Check for text as string (older format)
    if (typeof c.text === "string" && c.text.trim().length > 0) {
      return c.text;
    }

    // Check for parsed field (SDK may populate this for JSON schemas)
    if (c.parsed) {
      return JSON.stringify(c.parsed);
    }

    // Recursively check nested content arrays
    if (Array.isArray(c.content)) {
      const nested = extractFromContentArray(c.content);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Truncate error messages for logging
 */
const ERROR_SNIPPET_MAX = 400;

export function formatErrorSnippet(raw: unknown): string {
  const asString =
    typeof raw === "string"
      ? raw
      : (() => {
          try {
            return JSON.stringify(raw);
          } catch {
            return String(raw);
          }
        })();

  if (!asString) return "";
  return asString.length > ERROR_SNIPPET_MAX
    ? `${asString.slice(0, ERROR_SNIPPET_MAX)}...`
    : asString;
}

/**
 * Resilient JSON parser that can handle malformed JSON responses.
 * Tries standard JSON.parse first, then falls back to regex extraction.
 */
export function parseResilientJSON(text: string, targetKey: string): string | null {
  // First try: standard JSON parsing
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed[targetKey] === "string") {
      return (parsed[targetKey] as string).replace(/\s+/g, " ").trim();
    }
    if (parsed && parsed[targetKey] !== undefined) {
      return String(parsed[targetKey]);
    }
  } catch {
    // Fall through to regex parsing
  }

  // Second try: regex extraction for string values
  const patterns = [
    new RegExp(`"${targetKey}"\\s*:\\s*"([^"]+)"`),
    new RegExp(`"${targetKey}"\\s*:\\s*'([^']+)'`),
    new RegExp(`'${targetKey}'\\s*:\\s*"([^"]+)"`),
    new RegExp(`'${targetKey}'\\s*:\\s*'([^']+)'`),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, " ").trim();
    }
  }

  // Third try: look for any quoted string after the key (even more lenient)
  const laxMatch = text.match(new RegExp(`"${targetKey}"[^"']*["']([^"']+)["']`));
  if (laxMatch?.[1]) {
    return laxMatch[1].replace(/\s+/g, " ").trim();
  }

  return null;
}

/**
 * Simple retry helper for AI operations
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const { maxRetries = 2, baseDelay = 300, shouldRetry = () => true } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
