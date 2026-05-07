import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  GitHubAuth,
  captureAuthMetadata,
  getLastAuthMetadata,
  parseSsoHeader,
  parseSsoKind,
} from "../GitHubAuth.js";

function createStorage() {
  let token: string | undefined;
  return {
    get: () => token,
    set: (nextToken: string) => {
      token = nextToken;
    },
    delete: () => {
      token = undefined;
    },
  };
}

describe("GitHubAuth", () => {
  beforeEach(() => {
    GitHubAuth.initializeStorage(createStorage());
    GitHubAuth.clearToken();
  });

  it("clears cached user info when memory token changes", () => {
    GitHubAuth.setToken("ghp_oldtoken0123456789012345678901234567890");
    GitHubAuth.setValidatedUserInfo("old-user", "https://example.com/avatar.png", ["repo"]);

    GitHubAuth.setMemoryToken("ghp_newtoken0123456789012345678901234567890");

    const config = GitHubAuth.getConfig();
    expect(config.username).toBeUndefined();
    expect(config.avatarUrl).toBeUndefined();
    expect(config.scopes).toBeUndefined();
  });

  it("trims memory tokens before storing", () => {
    GitHubAuth.setMemoryToken("  ghp_trimmedtoken0123456789012345678901234567  ");

    expect(GitHubAuth.getToken()).toBe("ghp_trimmedtoken0123456789012345678901234567");
  });

  it("maps connection failures to a clear network error", async () => {
    (globalThis as unknown as { fetch: Mock }).fetch = vi
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await GitHubAuth.validate("ghp_validtoken012345678901234567890123456789");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Cannot reach GitHub. Check your internet connection.");
  });

  it("maps timeout errors to a clear network error", async () => {
    const timeoutError = new DOMException("The operation timed out.", "TimeoutError");
    (globalThis as unknown as { fetch: Mock }).fetch = vi.fn().mockRejectedValue(timeoutError);

    const result = await GitHubAuth.validate("ghp_validtoken012345678901234567890123456789");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Cannot reach GitHub. Check your internet connection.");
  });

  it("returns 'Invalid or expired token' for a 401 with 'Bad credentials' in the body", async () => {
    (globalThis as unknown as { fetch: Mock }).fetch = vi
      .fn()
      .mockResolvedValue(new Response('{"message":"Bad credentials"}', { status: 401 }));

    const result = await GitHubAuth.validate("ghp_validtoken012345678901234567890123456789");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid or expired token");
  });

  it("returns the transient message for a 401 without 'Bad credentials' so a brief auth-service incident isn't reported as an invalid token", async () => {
    (globalThis as unknown as { fetch: Mock }).fetch = vi
      .fn()
      .mockResolvedValue(new Response("<html>Service Disrupted</html>", { status: 401 }));

    const result = await GitHubAuth.validate("ghp_validtoken012345678901234567890123456789");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("GitHub is temporarily unavailable. Please retry.");
  });

  it("returns the transient message for a 5xx response", async () => {
    (globalThis as unknown as { fetch: Mock }).fetch = vi
      .fn()
      .mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

    const result = await GitHubAuth.validate("ghp_validtoken012345678901234567890123456789");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("GitHub is temporarily unavailable. Please retry.");
  });

  describe("parseSsoHeader", () => {
    it("extracts the url= URL from a required-form header", () => {
      const url = parseSsoHeader(
        "required; url=https://github.com/orgs/acme/sso?authorization_request=abc123"
      );
      expect(url).toBe("https://github.com/orgs/acme/sso?authorization_request=abc123");
    });

    it("returns null for the partial-results form (no url)", () => {
      const url = parseSsoHeader("partial-results; organizations=123456,789012");
      expect(url).toBeNull();
    });

    it("returns null for malformed input", () => {
      expect(parseSsoHeader(null)).toBeNull();
      expect(parseSsoHeader("")).toBeNull();
      expect(parseSsoHeader("gibberish")).toBeNull();
    });

    it("rejects non-https urls to avoid phishing via a spoofed header", () => {
      expect(parseSsoHeader("required; url=http://evil.example/")).toBeNull();
    });

    it("rejects urls outside the github.com domain", () => {
      expect(
        parseSsoHeader("required; url=https://github.com.attacker.example/orgs/acme/sso")
      ).toBeNull();
      expect(parseSsoHeader("required; url=https://evil.example/orgs/acme/sso")).toBeNull();
    });

    it("accepts github.com subdomains", () => {
      expect(
        parseSsoHeader("required; url=https://www.github.com/orgs/acme/sso?authorization_request=x")
      ).toBe("https://www.github.com/orgs/acme/sso?authorization_request=x");
    });
  });

  describe("parseSsoKind", () => {
    it("classifies the required form as 'required'", () => {
      expect(
        parseSsoKind("required; url=https://github.com/orgs/acme/sso?authorization_request=abc123")
      ).toBe("required");
    });

    it("classifies the partial-results form as 'partial'", () => {
      expect(parseSsoKind("partial-results; organizations=123456,789012")).toBe("partial");
    });

    it("is case-insensitive at the prefix", () => {
      expect(parseSsoKind("REQUIRED; url=https://github.com/orgs/acme/sso")).toBe("required");
      expect(parseSsoKind("Partial-Results; organizations=12345")).toBe("partial");
    });

    it("returns null for null/empty/gibberish", () => {
      expect(parseSsoKind(null)).toBeNull();
      expect(parseSsoKind("")).toBeNull();
      expect(parseSsoKind("gibberish")).toBeNull();
    });
  });

  describe("captureAuthMetadata", () => {
    it("captures the SSO URL and exposes it via getLastAuthMetadata", () => {
      GitHubAuth.clearToken();
      captureAuthMetadata(
        new Headers({
          "x-github-sso":
            "required; url=https://github.com/orgs/acme/sso?authorization_request=abc123",
        })
      );
      const metadata = getLastAuthMetadata();
      expect(metadata?.ssoUrl).toBe(
        "https://github.com/orgs/acme/sso?authorization_request=abc123"
      );
    });

    it("captures token expiry from GitHub-Authentication-Token-Expiration", () => {
      GitHubAuth.clearToken();
      captureAuthMetadata(
        new Headers({
          "github-authentication-token-expiration": "2030-01-02T03:04:05Z",
        })
      );
      const metadata = getLastAuthMetadata();
      expect(metadata?.tokenExpiresAt?.toISOString()).toBe("2030-01-02T03:04:05.000Z");
    });

    it("clears metadata when the token changes", () => {
      GitHubAuth.clearToken();
      captureAuthMetadata(
        new Headers({
          "x-github-sso":
            "required; url=https://github.com/orgs/acme/sso?authorization_request=abc123",
        })
      );
      expect(getLastAuthMetadata()?.ssoUrl).toBeDefined();

      GitHubAuth.setToken("ghp_newtoken0123456789012345678901234567890");
      expect(getLastAuthMetadata()).toBeNull();
    });

    it("does nothing when no relevant headers are present", () => {
      GitHubAuth.clearToken();
      captureAuthMetadata(new Headers({ "content-type": "application/json" }));
      expect(getLastAuthMetadata()).toBeNull();
    });
  });

  it("passes AbortSignal.timeout to fetch during validation", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ login: "user", avatar_url: "" }),
      headers: new Headers({ "x-oauth-scopes": "repo" }),
    });
    (globalThis as unknown as { fetch: Mock }).fetch = mockFetch;

    await GitHubAuth.validate("ghp_validtoken012345678901234567890123456789");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });
});
