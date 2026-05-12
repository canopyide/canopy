import { describe, expect, it, vi } from "vitest";
import type { PtyClient } from "../PtyClient.js";
import {
  assembleKeyterms,
  formatKeytermPrompt,
  tokenizeBranchName,
  tokenizeProjectName,
  extractTerminalIdentifiers,
} from "../voiceContextKeyterms.js";

const gitListBranchesMock = vi.fn().mockResolvedValue([
  { name: "feature/auth-login-service", current: true, commit: "abc123" },
  { name: "main", current: false, commit: "def456" },
]);

vi.mock("../GitService.js", () => ({
  GitService: class MockGitService {
    listBranches(...args: unknown[]) {
      return gitListBranchesMock(...args);
    }
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logDebug: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

function makePtyClient(lines: string[] = []): Pick<PtyClient, "getAllTerminalSnapshots"> {
  return {
    getAllTerminalSnapshots: vi.fn().mockResolvedValue([
      {
        id: "t1",
        lines,
        lastInputTime: 0,
        lastOutputTime: 0,
        lastCheckTime: 0,
        spawnedAt: 0,
      },
    ]),
  };
}

describe("tokenizeBranchName", () => {
  it("splits on / - _ and filters short parts", () => {
    const tokens = tokenizeBranchName("feature/issue-2820-inject-dynamic-project-context");
    expect(tokens).toContain("feature");
    expect(tokens).toContain("inject");
    expect(tokens).toContain("dynamic");
    expect(tokens).toContain("project");
    expect(tokens).toContain("context");
    // "2820" is pure numeric, should be filtered
    expect(tokens).not.toContain("2820");
  });

  it("filters parts shorter than 4 chars", () => {
    const tokens = tokenizeBranchName("fix/ui-btn-update");
    expect(tokens).not.toContain("fix");
    expect(tokens).not.toContain("ui");
    expect(tokens).not.toContain("btn");
    expect(tokens).toContain("update");
  });
});

describe("tokenizeProjectName", () => {
  it("splits on whitespace and separators", () => {
    const tokens = tokenizeProjectName("My Cool Project");
    expect(tokens).toContain("Cool");
    expect(tokens).toContain("Project");
  });

  it("splits camelCase", () => {
    const tokens = tokenizeProjectName("myProjectEditor");
    expect(tokens).toContain("Project");
    expect(tokens).toContain("Editor");
    // "my" is too short (< 4 chars) and gets filtered
    expect(tokens).not.toContain("my");
  });
});

describe("extractTerminalIdentifiers", () => {
  it("extracts snake_case and kebab-case identifiers", () => {
    const lines = ["const user_name = getUserProfile();", "npm run build-project"];
    const ids = extractTerminalIdentifiers(lines);
    expect(ids).toContain("user_name");
    expect(ids).toContain("build-project");
  });

  it("extracts camelCase identifiers", () => {
    const lines = ["const userName = getUserProfile();"];
    const ids = extractTerminalIdentifiers(lines);
    expect(ids).toContain("getUserProfile");
  });

  it("strips ANSI escape sequences", () => {
    const lines = ["\u001b[32mgetUserProfile\u001b[0m = someValue"];
    const ids = extractTerminalIdentifiers(lines);
    expect(ids).toContain("getUserProfile");
  });

  it("deduplicates case-insensitively", () => {
    const lines = ["getUserProfile", "getuserprofile", "GETUSERPROFILE"];
    const ids = extractTerminalIdentifiers(lines);
    expect(ids.length).toBe(1);
  });

  it("filters blocklisted keywords", () => {
    const lines = ["function myFunc() { return null; }"];
    const ids = extractTerminalIdentifiers(lines);
    expect(ids).not.toContain("function");
    expect(ids).not.toContain("return");
    expect(ids).not.toContain("null");
  });
});

describe("assembleKeyterms", () => {
  it("preserves custom dictionary with highest priority", async () => {
    const result = await assembleKeyterms({
      customDictionary: ["Daintree", "Deepgram", "xterm"],
    });
    expect(result[0]).toBe("Daintree");
    expect(result[1]).toBe("Deepgram");
    expect(result[2]).toBe("xterm");
  });

  it("adds project name tokens", async () => {
    const result = await assembleKeyterms({
      customDictionary: [],
      projectName: "DaintreeEditor",
    });
    expect(result).toContain("DaintreeEditor");
  });

  it("adds branch name tokens when projectPath provided", async () => {
    const result = await assembleKeyterms({
      customDictionary: [],
      projectPath: "/some/path",
    });
    // From mock: "feature/auth-login-service"
    expect(result).toContain("auth");
    expect(result).toContain("login");
    expect(result).toContain("service");
  });

  it("adds terminal identifiers when ptyClient provided", async () => {
    const ptyClient = makePtyClient(["const myVariable = handleRequest();"]) as PtyClient;
    const result = await assembleKeyterms({
      customDictionary: [],
      ptyClient,
    });
    expect(result).toContain("myVariable");
    expect(result).toContain("handleRequest");
  });

  it("deduplicates case-insensitively", async () => {
    const result = await assembleKeyterms({
      customDictionary: ["Daintree", "daintree", "FOREST"],
    });
    expect(result.filter((t) => t.toLowerCase() === "daintree").length).toBe(1);
  });

  it("caps at 96 keyterms", async () => {
    const dictionary = Array.from({ length: 100 }, (_, i) => `customTerm${i}`);
    const result = await assembleKeyterms({
      customDictionary: dictionary,
    });
    expect(result.length).toBe(96);
  });

  it("caps terminal lines at 200 (tail slice preserves newest content)", async () => {
    // 4 terminals × 60 lines = 240 total. Identifiers in oldest 40 lines
    // should be dropped by the 200-line cap.
    const snapshots = Array.from({ length: 4 }, (_, termIdx) => ({
      id: `t${termIdx}`,
      lines: Array.from({ length: 60 }, (_, lineIdx) => {
        const globalLine = termIdx * 60 + lineIdx;
        return `term${termIdx}_ident_${globalLine}`;
      }),
      lastInputTime: 0,
      lastOutputTime: 0,
      lastCheckTime: 0,
      spawnedAt: 0,
    }));
    const ptyClient = {
      getAllTerminalSnapshots: vi.fn().mockResolvedValue(snapshots),
    } as unknown as PtyClient;
    const result = await assembleKeyterms({
      customDictionary: [],
      ptyClient,
    });
    // Identifiers from first 40 lines (globally 0-39) dropped by tail slice
    expect(result).not.toContain("term0_ident_0");
    expect(result).not.toContain("term0_ident_39");
    // Identifiers from the 200-line window (globally 40+) appear, but cap at 96.
    // First window identifier is at global line 40; last to fit is at ~line 135.
    expect(result).toContain("term0_ident_40");
    expect(result).toContain("term2_ident_132");
    // Identifiers after the 96 cap (global line > ~135) are excluded
    expect(result).not.toContain("term2_ident_180");
    expect(result).not.toContain("term3_ident_239");
  });

  it("falls back gracefully when git fails", async () => {
    gitListBranchesMock.mockRejectedValueOnce(new Error("git not found"));
    const result = await assembleKeyterms({
      customDictionary: ["MyTerm"],
      projectPath: "/some/path",
    });
    expect(result).toContain("MyTerm");
  });

  it("falls back gracefully when ptyClient fails", async () => {
    const ptyClient = {
      getAllTerminalSnapshots: vi.fn().mockRejectedValue(new Error("pty error")),
    } as unknown as PtyClient;
    const result = await assembleKeyterms({
      customDictionary: ["MyTerm"],
      ptyClient,
    });
    expect(result).toContain("MyTerm");
  });

  it("filters blank and numeric-only custom dictionary entries", async () => {
    const result = await assembleKeyterms({
      customDictionary: ["", "  ", "12345", "ValidTerm"],
    });
    expect(result).toContain("ValidTerm");
    expect(result).not.toContain("");
    expect(result).not.toContain("12345");
  });

  it("preserves priority order: custom dict > project name > branch > terminal", async () => {
    const ptyClient = makePtyClient(["const terminalIdent = true;"]) as PtyClient;
    const result = await assembleKeyterms({
      customDictionary: ["CustomFirst"],
      projectName: "ProjectSecond",
      projectPath: "/some/path",
      ptyClient,
    });
    const customIdx = result.indexOf("CustomFirst");
    const projectIdx = result.indexOf("ProjectSecond");
    // Branch mock is "feature/auth-login-service" → tokens: feature, auth, login, service
    const branchIdx = result.indexOf("auth");
    const terminalIdx = result.indexOf("terminalIdent");
    expect(customIdx).toBeLessThan(projectIdx);
    expect(projectIdx).toBeLessThan(branchIdx);
    expect(branchIdx).toBeLessThan(terminalIdx);
  });
});

describe("formatKeytermPrompt", () => {
  it("joins terms into the OpenAI prompt string format", () => {
    expect(formatKeytermPrompt(["foo", "bar", "baz"])).toBe("Keywords: foo, bar, baz");
  });

  it("returns empty string for empty array", () => {
    expect(formatKeytermPrompt([])).toBe("");
  });

  it("formats a single term without a trailing separator", () => {
    expect(formatKeytermPrompt(["Daintree"])).toBe("Keywords: Daintree");
  });

  it("preserves casing of terms", () => {
    expect(formatKeytermPrompt(["Daintree", "xterm", "PtyClient"])).toBe(
      "Keywords: Daintree, xterm, PtyClient"
    );
  });

  it("drops whole terms that would exceed the char cap (never mid-term truncation)", () => {
    // "Keywords: foo" = 13 chars. ", toolong_word_here" would push to 32.
    const result = formatKeytermPrompt(["foo", "toolong_word_here"], 20);
    expect(result).toBe("Keywords: foo");
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("returns empty string when the first term alone exceeds the cap", () => {
    // "Keywords: averylongtermthatcannotfit" exceeds 20 chars
    expect(formatKeytermPrompt(["averylongtermthatcannotfit"], 20)).toBe("");
  });

  it("includes a term whose total length lands exactly at the cap", () => {
    // "Keywords: abc" is exactly 13 chars; cap of 13 must include it.
    expect(formatKeytermPrompt(["abc"], 13)).toBe("Keywords: abc");
  });

  it("skips blank terms in the input", () => {
    expect(formatKeytermPrompt(["foo", "", "bar"])).toBe("Keywords: foo, bar");
  });

  it("caps the full string (including the prefix) at maxChars", () => {
    const many = Array.from({ length: 200 }, (_, i) => `term${i}`);
    const result = formatKeytermPrompt(many);
    expect(result.length).toBeLessThanOrEqual(400);
    expect(result.startsWith("Keywords: ")).toBe(true);
  });

  it("appends as many terms as fit within the cap, in input order", () => {
    // Each "abc" pair = 5 chars after the first ("abc" then ", abc").
    // "Keywords: abc" = 13, +", abc" = 18, +", abc" = 23.
    const result = formatKeytermPrompt(["abc", "abc1", "abc2", "abc3"], 23);
    expect(result).toBe("Keywords: abc, abc1");
  });
});
