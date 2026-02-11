/* eslint-disable no-control-regex */
const ALLOWED_HOSTS = ["localhost", "127.0.0.1", "::1"];
const ALLOWED_PROTOCOLS = ["http:", "https:"];
const LOCALHOST_HINTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1"] as const;
const LOCALHOST_URL_REGEX =
  /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)(:\d+)?([^\s"'<>)]*)?/gi;

export interface NormalizeResult {
  url?: string;
  error?: string;
}

export function normalizeBrowserUrl(input: string): NormalizeResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "URL cannot be empty" };
  }

  let urlString = trimmed;

  urlString = urlString.replace(/\b0\.0\.0\.0\b/g, "localhost");

  if (!urlString.includes("://")) {
    urlString = `http://${urlString}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { error: "Invalid URL format" };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { error: `Protocol "${parsed.protocol}" not allowed. Use http: or https:` };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.includes(hostname)) {
    return { error: `Only localhost URLs are allowed (got "${hostname}")` };
  }

  parsed.username = "";
  parsed.password = "";

  return { url: parsed.toString() };
}

export function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_HOSTS.includes(hostname) && ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function stripAnsiAndOscCodes(text: string): string {
  return text
    .replace(/\x1b\[\d+m/g, "")
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\x1b\]8;;[^\x07]*\x07([^\x1b]*)\x1b\]8;;\x07/g, "$1");
}

function hasLocalhostHint(text: string): boolean {
  const lower = text.toLowerCase();
  for (const hint of LOCALHOST_HINTS) {
    if (lower.includes(hint)) {
      return true;
    }
  }
  return false;
}

function matchLocalhostUrls(text: string): string[] {
  LOCALHOST_URL_REGEX.lastIndex = 0;
  return Array.from(text.matchAll(LOCALHOST_URL_REGEX), (match) => match[0]);
}

export function extractLocalhostUrls(text: string): string[] {
  if (!text || !hasLocalhostHint(text)) {
    return [];
  }

  const matches = matchLocalhostUrls(text);
  const cleanMatches = text.includes("\x1b") ? matchLocalhostUrls(stripAnsiAndOscCodes(text)) : [];
  const allMatches = [...new Set([...matches, ...cleanMatches])];

  const normalized: string[] = [];
  for (const match of allMatches) {
    const result = normalizeBrowserUrl(match);
    if (result.url) {
      normalized.push(result.url);
    }
  }

  return [...new Set(normalized)];
}
