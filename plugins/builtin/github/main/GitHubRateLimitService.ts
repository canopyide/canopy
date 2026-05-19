import type {
  GitHubRateLimitKind,
  GitHubRateLimitPayload,
} from "../../../../shared/types/ipc/github.js";
import { logDebug, logInfo, logWarn } from "../../../../electron/utils/logger.js";
import { formatErrorMessage } from "../../../../shared/utils/errorMessage.js";

// Buffer applied to GitHub's `x-ratelimit-reset` to absorb clock skew between
// the local host and api.github.com, and to avoid a poll slipping in a tick
// before the server clears the quota. Aligns with lesson #4629 guidance.
export const PRIMARY_RESET_BUFFER_MS = 7_000;

// Fallback pause when a 403/429 response carries no `retry-after` header and
// no primary-quota signal, matching GitHub's documented minimum.
const SECONDARY_FALLBACK_PAUSE_MS = 60_000;

// Ceiling on the jittered exponential backoff applied after repeated
// secondary-limit hits. Keeps the wait bounded even if the limit persists.
const SECONDARY_BACKOFF_MAX_MS = 5 * 60 * 1000;

// Sentinel key used for blocks that aren't tied to a specific
// `x-ratelimit-resource` bucket — secondary (abuse-detection) blocks and
// primary blocks where the response header is absent.
const GLOBAL_RESOURCE_KEY = "__global__";

interface BlockState {
  kind: GitHubRateLimitKind;
  resumeAt: number;
  resource: string;
  requestId?: string;
}

export interface ShouldBlockResult {
  blocked: boolean;
  reason: GitHubRateLimitKind | null;
  resumeAt?: number;
}

type StateChangeListener = (state: GitHubRateLimitPayload) => void;

class GitHubRateLimitServiceImpl {
  private readonly states = new Map<string, BlockState>();
  private readonly listeners = new Set<StateChangeListener>();
  // Consecutive secondary-limit hits since the last `clear()` or 2xx response.
  // Drives jittered exponential backoff when GitHub returns a 403/429 without
  // an explicit `retry-after` header.
  private consecutiveSecondaryHits = 0;

  /**
   * Register a subscriber that fires on every state transition (entering a
   * block, changing resume time, or clearing). Transports (main-process
   * broadcast to renderer, utility-process relay to main) hook in here.
   */
  onStateChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Apply a state snapshot observed in another process (utility host →
   * main) without re-emitting transport-level events on this side beyond
   * the local subscriber notification. The main-process transport in turn
   * rebroadcasts to all renderers, so a utility-observed limit ends up on
   * the toolbar even though the utility process can't call BrowserWindow.
   */
  applyRemoteState(payload: GitHubRateLimitPayload): void {
    if (payload.blocked && payload.kind && payload.resetAt) {
      this.markBlocked(payload.kind, payload.resetAt, payload.resource ?? GLOBAL_RESOURCE_KEY);
      return;
    }
    this.clear();
  }

  /**
   * Inspect a GitHub HTTP response's headers/status and update internal
   * state. Called from the custom fetch wrapper installed in
   * {@link GitHubAuth.createClient} on every response.
   * @param requestId Optional x-github-request-id header value for
   *   correlating blocks with GitHub Support tickets.
   */
  update(headers: HeadersLike, status: number, bodyText?: string, requestId?: string): void {
    const retryAfter = parseRetryAfter(headers.get("retry-after"));
    if (retryAfter !== null) {
      this.consecutiveSecondaryHits++;
      this.markBlocked("secondary", Date.now() + retryAfter * 1000, GLOBAL_RESOURCE_KEY, requestId);
      return;
    }

    const remainingRaw = headers.get("x-ratelimit-remaining");
    const resetRaw = headers.get("x-ratelimit-reset");
    const remaining = parseIntOrNull(remainingRaw);
    const resetSeconds = parseIntOrNull(resetRaw);
    const resource = headers.get("x-ratelimit-resource") ?? GLOBAL_RESOURCE_KEY;

    if (remaining === 0 && resetSeconds !== null) {
      this.markBlocked(
        "primary",
        resetSeconds * 1000 + PRIMARY_RESET_BUFFER_MS,
        resource,
        requestId
      );
      return;
    }

    if ((status === 403 || status === 429) && looksLikeSecondaryLimit(bodyText)) {
      this.consecutiveSecondaryHits++;
      this.markBlocked(
        "secondary",
        Date.now() + this.computeSecondaryFallbackDelay(),
        GLOBAL_RESOURCE_KEY,
        requestId
      );
      return;
    }

    if (status >= 200 && status < 300 && remaining !== null && remaining > 0) {
      this.consecutiveSecondaryHits = 0;
      if (headers.get("x-ratelimit-resource") !== null) {
        this.clearResource(resource);
      }
    }
  }

  /**
   * Compute the wait duration for a fallback secondary-limit block (the
   * 403/429 + body-classified path where GitHub gave us no `retry-after`).
   * Applies full jitter on top of an exponential schedule that doubles per
   * consecutive hit and caps at {@link SECONDARY_BACKOFF_MAX_MS}.
   *
   * Schedule: hit 1 → 60–120s, hit 2 → 120–180s, hit 3 → 240–300s,
   * hit 4+ → capped at 5 min. The lower bound of 60s matches GitHub's
   * documented minimum wait for headerless secondary blocks.
   */
  private computeSecondaryFallbackDelay(): number {
    const k = Math.max(1, this.consecutiveSecondaryHits);
    const base = Math.min(
      SECONDARY_BACKOFF_MAX_MS,
      SECONDARY_FALLBACK_PAUSE_MS * Math.pow(2, k - 1)
    );
    const jitter = Math.random() * SECONDARY_FALLBACK_PAUSE_MS;
    return Math.min(SECONDARY_BACKOFF_MAX_MS, base + jitter);
  }

  /**
   * Check whether a request should be blocked.
   *
   * When `resource` is passed, only the matching bucket (plus any global
   * secondary block) is considered. GraphQL-only callers can pass `"graphql"`
   * to proceed past a `core` exhaustion, and vice versa.
   *
   * When `resource` is omitted, the check is conservative: any active block
   * gates the request. This is the safe default for callers whose next
   * outbound call type isn't known statically.
   *
   * Auto-clears expired state so the caller sees the service as unblocked as
   * soon as the reset has passed.
   */
  shouldBlockRequest(resource?: string): ShouldBlockResult {
    this.autoClearExpired();

    const global = this.states.get(GLOBAL_RESOURCE_KEY);
    if (global && global.kind === "secondary") {
      return { blocked: true, reason: "secondary", resumeAt: global.resumeAt };
    }

    if (resource) {
      const entry = this.states.get(resource);
      if (entry) {
        return { blocked: true, reason: entry.kind, resumeAt: entry.resumeAt };
      }
      if (global && global.kind === "primary") {
        return { blocked: true, reason: "primary", resumeAt: global.resumeAt };
      }
      return { blocked: false, reason: null };
    }

    if (global && global.kind === "primary") {
      return { blocked: true, reason: "primary", resumeAt: global.resumeAt };
    }
    for (const [key, state] of this.states) {
      if (key !== GLOBAL_RESOURCE_KEY) {
        return { blocked: true, reason: state.kind, resumeAt: state.resumeAt };
      }
    }

    return { blocked: false, reason: null };
  }

  /**
   * Feed GraphQL `rateLimit { cost remaining resetAt }` data into the
   * service. When `remaining` is 0 the service marks a `"primary"` block
   * under the `"graphql"` resource key. Ignores missing or malformed
   * rateLimit objects silently.
   */
  updateFromGraphQL(data: Record<string, unknown>): void {
    const rateLimit = data?.rateLimit as
      | { cost?: number; remaining?: number; resetAt?: string }
      | undefined;
    if (!rateLimit) return;

    const remaining = rateLimit.remaining;
    const resetAt = rateLimit.resetAt;
    if (typeof remaining !== "number" || typeof resetAt !== "string") return;

    if (remaining === 0) {
      const resetMs = Date.parse(resetAt);
      if (Number.isFinite(resetMs)) {
        this.markBlocked("primary", resetMs + PRIMARY_RESET_BUFFER_MS, "graphql");
      }
    }
  }

  /** Snapshot for push/pull consumers. Collapses multi-resource state to a single payload. */
  getState(): GitHubRateLimitPayload {
    this.autoClearExpired();
    if (this.states.size === 0) {
      return { blocked: false, kind: null };
    }

    const global = this.states.get(GLOBAL_RESOURCE_KEY);
    if (global && global.kind === "secondary") {
      return { blocked: true, kind: "secondary", resetAt: global.resumeAt };
    }

    let best: BlockState | null = global && global.kind === "primary" ? global : null;
    for (const [key, state] of this.states) {
      if (key === GLOBAL_RESOURCE_KEY) continue;
      if (!best || state.resumeAt < best.resumeAt) {
        best = state;
      }
    }
    if (best) {
      return { blocked: true, kind: best.kind, resetAt: best.resumeAt, resource: best.resource };
    }
    return { blocked: false, kind: null };
  }

  /** Drop any active block (token change, fresh 2xx, manual reset). */
  clear(): void {
    this.consecutiveSecondaryHits = 0;
    if (this.states.size === 0) return;
    this.states.clear();
    logInfo("GitHub rate limit cleared");
    this.notifyListeners();
  }

  /** Test-only helper. */
  _resetForTests(): void {
    this.states.clear();
    this.consecutiveSecondaryHits = 0;
  }

  /** Test-only inspector. */
  _getConsecutiveSecondaryHitsForTests(): number {
    return this.consecutiveSecondaryHits;
  }

  private clearResource(resource: string): void {
    if (!this.states.has(resource)) return;
    this.states.delete(resource);
    logInfo("GitHub rate limit cleared for resource", { resource });
    this.notifyListeners();
  }

  private markBlocked(
    kind: GitHubRateLimitKind,
    resumeAt: number,
    resource: string,
    requestId?: string
  ): void {
    const previous = this.states.get(resource);
    const changed =
      !previous || previous.kind !== kind || Math.abs(previous.resumeAt - resumeAt) > 1_000;
    this.states.set(resource, { kind, resumeAt, resource, requestId });
    if (changed) {
      const logPayload: Record<string, unknown> = {
        resource,
        resumeAt,
        waitMs: resumeAt - Date.now(),
      };
      if (requestId) {
        logPayload.requestId = requestId;
      }
      if (kind === "secondary") {
        logWarn("GitHub secondary rate limit — pausing until resume", logPayload);
      } else {
        logInfo("GitHub primary rate limit — pausing until reset", logPayload);
      }
      this.notifyListeners();
    } else {
      logDebug("GitHub rate limit refreshed", { kind, resumeAt, resource });
    }
  }

  private autoClearExpired(): void {
    let anyCleared = false;
    for (const [key, state] of this.states) {
      if (state.resumeAt <= Date.now()) {
        this.states.delete(key);
        anyCleared = true;
      }
    }
    if (anyCleared) {
      logInfo("GitHub rate limit block(s) expired");
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        // A misbehaving transport must not break rate-limit bookkeeping.
        logWarn("GitHub rate-limit listener threw", {
          error: formatErrorMessage(err, "Rate-limit listener failed"),
        });
      }
    }
  }
}

export interface HeadersLike {
  get(name: string): string | null;
}

function parseIntOrNull(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Numeric seconds form — the only shape GitHub uses in practice.
  const seconds = Number.parseInt(trimmed, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }
  // HTTP-date form (rare) — best-effort parse.
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    const delta = Math.ceil((dateMs - Date.now()) / 1000);
    return delta > 0 ? delta : 0;
  }
  return null;
}

function looksLikeSecondaryLimit(bodyText: string | undefined): boolean {
  if (!bodyText) return false;
  const lower = bodyText.toLowerCase();
  return lower.includes("secondary rate limit") || lower.includes("abuse detection");
}

/**
 * `GitHubRateLimitError` lets callers distinguish a preflight rate-limit block
 * from ordinary network/API errors and lets the UI render a proper countdown.
 */
export class GitHubRateLimitError extends Error {
  readonly kind: GitHubRateLimitKind;
  readonly resumeAt: number;

  constructor(kind: GitHubRateLimitKind, resumeAt: number) {
    super(
      kind === "primary"
        ? "GitHub rate limit exceeded. Waiting for quota reset."
        : "GitHub secondary rate limit triggered. Pausing requests."
    );
    this.name = "GitHubRateLimitError";
    this.kind = kind;
    this.resumeAt = resumeAt;
  }
}

export const gitHubRateLimitService = new GitHubRateLimitServiceImpl();
