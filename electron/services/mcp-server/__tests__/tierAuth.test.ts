import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPaneConfigService } = vi.hoisted(() => ({
  mockPaneConfigService: {
    isValidPaneToken: vi.fn<(token: string) => boolean>(() => false),
    getTierForToken: vi.fn<(token: string) => "workbench" | "action" | "system" | undefined>(
      () => undefined
    ),
  },
}));

vi.mock("../../McpPaneConfigService.js", () => ({
  mcpPaneConfigService: mockPaneConfigService,
}));

import {
  extractBearerToken,
  isAuthorized,
  precomputeApiKeyBearerHash,
  resolveTokenTier,
} from "../tierAuth.js";

beforeEach(() => {
  mockPaneConfigService.isValidPaneToken.mockReset();
  mockPaneConfigService.getTierForToken.mockReset();
  mockPaneConfigService.isValidPaneToken.mockReturnValue(false);
  mockPaneConfigService.getTierForToken.mockReturnValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("extractBearerToken", () => {
  it("accepts a single space between scheme and token", () => {
    expect(extractBearerToken("Bearer foo")).toBe("foo");
  });

  it("accepts a TAB between scheme and token", () => {
    expect(extractBearerToken("Bearer\tfoo")).toBe("foo");
  });

  it("accepts a lowercase scheme", () => {
    expect(extractBearerToken("bearer foo")).toBe("foo");
  });

  it("rejects a header with no whitespace after the scheme", () => {
    expect(extractBearerToken("Bearerfoo")).toBeNull();
  });

  it("rejects an empty header", () => {
    expect(extractBearerToken("")).toBeNull();
  });

  it("rejects a non-Bearer scheme", () => {
    expect(extractBearerToken("Basic foo")).toBeNull();
  });

  it("rejects a header with only whitespace after the scheme", () => {
    expect(extractBearerToken("Bearer    ")).toBeNull();
  });

  it("collapses repeated whitespace and trims trailing whitespace", () => {
    expect(extractBearerToken("Bearer  \tfoo  ")).toBe("foo");
  });
});

describe("precomputeApiKeyBearerHash", () => {
  it("returns null when the api key is null", () => {
    expect(precomputeApiKeyBearerHash(null)).toBeNull();
  });

  it("returns null when the api key is an empty string", () => {
    expect(precomputeApiKeyBearerHash("")).toBeNull();
  });

  it("produces a 32-byte SHA-256 digest of the full Bearer header", () => {
    const hash = precomputeApiKeyBearerHash("secret");
    expect(hash).not.toBeNull();
    expect(hash!.length).toBe(32);
  });

  it("is deterministic for the same input", () => {
    const a = precomputeApiKeyBearerHash("secret");
    const b = precomputeApiKeyBearerHash("secret");
    expect(a!.equals(b!)).toBe(true);
  });

  it("differs for different api keys", () => {
    const a = precomputeApiKeyBearerHash("alpha");
    const b = precomputeApiKeyBearerHash("beta");
    expect(a!.equals(b!)).toBe(false);
  });
});

describe("isAuthorized", () => {
  it("authorizes a valid api-key Bearer header", () => {
    const hash = precomputeApiKeyBearerHash("secret");
    expect(isAuthorized("Bearer secret", hash, null)).toBe(true);
  });

  it("rejects a wrong api-key Bearer header", () => {
    const hash = precomputeApiKeyBearerHash("secret");
    expect(isAuthorized("Bearer wrong", hash, null)).toBe(false);
  });

  it("rejects a header with the wrong scheme", () => {
    const hash = precomputeApiKeyBearerHash("secret");
    expect(isAuthorized("Basic secret", hash, null)).toBe(false);
  });

  it("authorizes an empty header when no api key is set", () => {
    expect(isAuthorized("", null, null)).toBe(true);
  });

  it("authorizes a TAB-separated pane token", () => {
    mockPaneConfigService.isValidPaneToken.mockImplementation((t) => t === "pane-tok");
    expect(isAuthorized("Bearer\tpane-tok", null, null)).toBe(true);
  });

  it("authorizes a lowercase-scheme pane token", () => {
    mockPaneConfigService.isValidPaneToken.mockImplementation((t) => t === "pane-tok");
    expect(isAuthorized("bearer pane-tok", null, null)).toBe(true);
  });

  it("authorizes a TAB-separated help token", () => {
    const helpValidator = vi.fn<(t: string) => "workbench" | false>((t) =>
      t === "help-tok" ? "workbench" : false
    );
    expect(isAuthorized("Bearer\thelp-tok", null, helpValidator)).toBe(true);
    expect(helpValidator).toHaveBeenCalledWith("help-tok");
  });

  it("rejects an unknown Bearer token", () => {
    expect(isAuthorized("Bearer nope", null, null)).toBe(false);
  });
});

describe("resolveTokenTier", () => {
  it("resolves a valid api-key header to external", () => {
    const hash = precomputeApiKeyBearerHash("secret");
    expect(resolveTokenTier("Bearer secret", hash, null)).toBe("external");
  });

  it("resolves an empty header with no api key to external", () => {
    expect(resolveTokenTier("", null, null)).toBe("external");
  });

  it("resolves a TAB-separated help token to its help tier (regression for #7129)", () => {
    const helpValidator = vi.fn<(t: string) => "system" | false>((t) =>
      t === "help-tok" ? "system" : false
    );
    expect(resolveTokenTier("Bearer\thelp-tok", null, helpValidator)).toBe("system");
  });

  it("resolves a lowercase-scheme pane token to its pane tier", () => {
    mockPaneConfigService.getTierForToken.mockImplementation((t) =>
      t === "pane-tok" ? "action" : undefined
    );
    expect(resolveTokenTier("bearer pane-tok", null, null)).toBe("action");
  });

  it("falls back to workbench when no parser matches", () => {
    expect(resolveTokenTier("Bearer unknown", null, null)).toBe("workbench");
  });

  it("falls back to workbench when the header has no whitespace after the scheme", () => {
    expect(resolveTokenTier("Bearerfoo", null, null)).toBe("workbench");
  });
});
