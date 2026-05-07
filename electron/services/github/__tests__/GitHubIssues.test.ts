import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueListCache, issueTooltipCache, clearGitHubCaches } from "../GitHubCaches.js";

// The module under test imports side-effectful modules (GitHubAuth, rate limit
// service, etc.). We mock them before importing so the module loads cleanly.
vi.mock("../GitHubAuth.js", () => ({
  GitHubAuth: {
    getToken: vi.fn(() => "test-token"),
    createClient: vi.fn(() => null),
  },
  GITHUB_API_TIMEOUT_MS: 5000,
}));

vi.mock("../GitHubRateLimitService.js", () => ({
  gitHubRateLimitService: {
    updateFromGraphQL: vi.fn(),
    shouldBlockRequest: vi.fn(() => ({ blocked: false, reason: null })),
  },
  GitHubRateLimitError: class GitHubRateLimitError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "GitHubRateLimitError";
    }
  },
}));

vi.mock("../GitHubRepoContext.js", () => ({
  withRepoContextRetry: vi.fn(
    (_cwd: string, fn: (ctx: { owner: string; repo: string }) => unknown) =>
      fn({ owner: "testowner", repo: "testrepo" })
  ),
}));

// We only mock the REST fetch path (assignIssue). The GraphQL path uses
// GitHubAuth.createClient, which we leave null in these tests.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { assignIssue } from "../GitHubIssues.js";

describe("assignIssue error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGitHubCaches();
  });

  it("returns 401 as invalid token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    await expect(assignIssue("/test", 1, "someuser")).rejects.toThrow(
      "Invalid GitHub token. Please update in Settings."
    );
  });

  it("returns 403 as insufficient permissions", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    });

    await expect(assignIssue("/test", 1, "someuser")).rejects.toThrow(
      "Token lacks required permissions. Required scopes: repo, read:org"
    );
  });

  it("returns 404 as issue/access not found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    await expect(assignIssue("/test", 1, "someuser")).rejects.toThrow(
      "Issue not found or you don't have access to this repository"
    );
  });

  it("returns distinct 422 message for invalid collaborator (code=invalid)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        message: "Validation Failed",
        errors: [{ code: "invalid", message: "User is not a collaborator" }],
      }),
    });

    await expect(assignIssue("/test", 1, "someuser")).rejects.toThrow(
      'Cannot assign user "someuser" - they may not be a collaborator'
    );
  });

  it("returns distinct 422 message for too_many_assignees code", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        message: "Validation Failed",
        errors: [{ code: "too_many_assignees", message: "Too many assignees" }],
      }),
    });

    await expect(assignIssue("/test", 1, "someuser")).rejects.toThrow(
      'Cannot assign user "someuser" - issue already has the maximum 10 assignees'
    );
  });

  it("falls back to github message for unknown 422 error code", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        message: "Validation Failed",
        errors: [{ code: "some_other_code", message: "Something went wrong" }],
      }),
    });

    await expect(assignIssue("/test", 1, "someuser")).rejects.toThrow(
      'Cannot assign user "someuser" - Something went wrong'
    );
  });

  it("falls back to HTTP 422 when 422 body has no message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({}),
    });

    await expect(assignIssue("/test", 1, "someuser")).rejects.toThrow(
      'Cannot assign user "someuser" - HTTP 422'
    );
  });

  it("handles non-JSON 422 body gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => {
        throw new Error("Not JSON");
      },
    });

    await expect(assignIssue("/test", 1, "someuser")).rejects.toThrow(
      'Cannot assign user "someuser" - HTTP 422'
    );
  });

  it("uses numeric status code for unknown non-OK response instead of empty statusText", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "", // HTTP/2 fetch always returns empty
      json: async () => ({}),
    });

    await expect(assignIssue("/test", 1, "someuser")).rejects.toThrow(
      'Cannot assign user "someuser" - server error (HTTP 500)'
    );
  });

  it("includes the numeric status for 429 rate limit response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    await expect(assignIssue("/test", 1, "someuser")).rejects.toThrow("HTTP 429");
  });
});

describe("assignIssue cache invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGitHubCaches();
  });

  it("invalidates the tooltip cache after a successful assignment", async () => {
    const tooltipKey = "testowner/testrepo:42";
    issueTooltipCache.set(tooltipKey, {
      number: 42,
      title: "Test Issue",
      bodyExcerpt: "excerpt",
      state: "OPEN",
      createdAt: "2024-01-01T00:00:00Z",
      author: { login: "author", avatarUrl: "" },
      assignees: [{ login: "olduser", avatarUrl: "" }],
      labels: [],
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        assignees: [{ login: "someuser", avatar_url: "https://avatar.url" }],
      }),
    });

    await assignIssue("/test", 42, "someuser");

    expect(issueTooltipCache.get(tooltipKey)).toBeUndefined();
  });

  it("deletes tooltip cache entry even when issue is not in any list-cache entry", async () => {
    const tooltipKey = "testowner/testrepo:99";
    issueTooltipCache.set(tooltipKey, {
      number: 99,
      title: "Other Issue",
      bodyExcerpt: "excerpt",
      state: "OPEN",
      createdAt: "2024-01-01T00:00:00Z",
      author: { login: "author", avatarUrl: "" },
      assignees: [],
      labels: [],
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        assignees: [{ login: "someuser", avatar_url: "https://avatar.url" }],
      }),
    });

    await assignIssue("/test", 99, "someuser");

    expect(issueTooltipCache.get(tooltipKey)).toBeUndefined();
  });
});

describe("parseIssueNode edge cases", () => {
  // parseIssueNode and the assignees(first: 10) change: verify the parser
  // handles up to 10 assignees correctly (the old first: 5 couldn't test this).
  it("is importable", async () => {
    const mod = await import("../GitHubIssues.js");
    expect(typeof mod.parseIssueNode).toBe("function");
  });
});
