import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const ipcMainMock = vi.hoisted(() => ({
  handle: vi.fn(),
  removeHandler: vi.fn(),
}));

const shellMock = vi.hoisted(() => ({
  openExternal: vi.fn().mockResolvedValue(undefined),
}));

const checkRateLimitMock = vi.hoisted(() => vi.fn());

const gitHubServiceMock = vi.hoisted(() => ({
  getRepoUrl: vi.fn().mockResolvedValue("https://github.com/owner/repo"),
  listIssues: vi.fn().mockResolvedValue({ issues: [], nextCursor: null }),
  listPullRequests: vi.fn().mockResolvedValue({ prs: [], nextCursor: null }),
  assignIssue: vi.fn().mockResolvedValue(undefined),
  validateGitHubToken: vi
    .fn()
    .mockResolvedValue({ valid: true, scopes: [], username: "user", avatarUrl: null }),
  setGitHubToken: vi.fn(),
  clearGitHubToken: vi.fn(),
  hasGitHubToken: vi.fn().mockReturnValue(true),
  getGitHubConfigAsync: vi.fn().mockResolvedValue({ hasToken: true }),
  getIssueTooltip: vi.fn().mockResolvedValue(null),
  getPRTooltip: vi.fn().mockResolvedValue(null),
  getIssueUrl: vi.fn().mockResolvedValue("https://github.com/owner/repo/issues/1"),
  getIssueByNumber: vi.fn().mockResolvedValue(null),
  getPRByNumber: vi.fn().mockResolvedValue(null),
  getRepoStats: vi.fn().mockResolvedValue({ stats: null, error: undefined }),
  getProjectHealth: vi.fn().mockResolvedValue({ health: null, error: undefined }),
  parseGitHubRepoUrl: vi.fn().mockReturnValue(null),
}));

const workspaceClientMock = vi.hoisted(() => ({
  updateGitHubToken: vi.fn(),
}));

const gitHubAuthMock = vi.hoisted(() => ({
  getTokenVersion: vi.fn().mockReturnValue(1),
  setValidatedUserInfo: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: ipcMainMock,
  shell: shellMock,
  BrowserWindow: {
    fromWebContents: vi.fn().mockReturnValue(null),
  },
}));

vi.mock("../../utils.js", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("../../../services/GitHubService.js", () => gitHubServiceMock);

vi.mock("../../../services/WorkspaceClient.js", () => ({
  getWorkspaceClient: () => workspaceClientMock,
}));

vi.mock("../../../services/github/index.js", () => ({
  GitHubAuth: gitHubAuthMock,
}));

vi.mock("../../../services/GitService.js", () => ({
  GitService: class {
    async listRemotes() {
      return [];
    }
  },
}));

vi.mock("../../../utils/git.js", () => ({
  getCommitCount: vi.fn().mockResolvedValue(0),
}));

import { CHANNELS } from "../../channels.js";
import { registerGithubHandlers } from "../github.js";

function getInvokeHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const call = (ipcMainMock.handle as Mock).mock.calls.find(
    ([registered]) => registered === channel
  );
  if (!call) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  return call[1] as (...args: unknown[]) => Promise<unknown>;
}

describe("github handlers — rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gitHubServiceMock.getRepoUrl.mockResolvedValue("https://github.com/owner/repo");
    gitHubServiceMock.listIssues.mockResolvedValue({ issues: [], nextCursor: null });
    gitHubServiceMock.validateGitHubToken.mockResolvedValue({
      valid: true,
      scopes: [],
      username: "user",
      avatarUrl: null,
    });
    registerGithubHandlers({} as never);
  });

  describe("read family (github:list-issues)", () => {
    it("calls checkRateLimit with read limits (10, 10_000)", async () => {
      const handler = getInvokeHandler(CHANNELS.GITHUB_LIST_ISSUES);
      await handler({} as never, { cwd: "/tmp/project" });

      expect(checkRateLimitMock).toHaveBeenCalledWith(CHANNELS.GITHUB_LIST_ISSUES, 10, 10_000);
      expect(gitHubServiceMock.listIssues).toHaveBeenCalled();
    });

    it("rejects and skips listIssues when rate limit throws", async () => {
      checkRateLimitMock.mockImplementationOnce(() => {
        throw new Error("Rate limit exceeded");
      });
      const handler = getInvokeHandler(CHANNELS.GITHUB_LIST_ISSUES);

      await expect(handler({} as never, { cwd: "/tmp/project" })).rejects.toThrow(
        "Rate limit exceeded"
      );
      expect(gitHubServiceMock.listIssues).not.toHaveBeenCalled();
    });
  });

  describe("open family (github:open-issues)", () => {
    it("calls checkRateLimit with open limits (20, 10_000)", async () => {
      const handler = getInvokeHandler(CHANNELS.GITHUB_OPEN_ISSUES);
      await handler({} as never, "/tmp/project", "bug", "open");

      expect(checkRateLimitMock).toHaveBeenCalledWith(CHANNELS.GITHUB_OPEN_ISSUES, 20, 10_000);
      expect(shellMock.openExternal).toHaveBeenCalled();
    });

    it("rejects and skips shell.openExternal when rate limit throws", async () => {
      checkRateLimitMock.mockImplementationOnce(() => {
        throw new Error("Rate limit exceeded");
      });
      const handler = getInvokeHandler(CHANNELS.GITHUB_OPEN_ISSUES);

      await expect(handler({} as never, "/tmp/project", "bug", "open")).rejects.toThrow(
        "Rate limit exceeded"
      );
      expect(shellMock.openExternal).not.toHaveBeenCalled();
    });
  });

  describe("token family (github:set-token)", () => {
    it("calls checkRateLimit with token limits (5, 10_000)", async () => {
      const handler = getInvokeHandler(CHANNELS.GITHUB_SET_TOKEN);
      await handler({} as never, "ghp_valid_token");

      expect(checkRateLimitMock).toHaveBeenCalledWith(CHANNELS.GITHUB_SET_TOKEN, 5, 10_000);
    });

    it("rejects and skips validateGitHubToken when rate limit throws", async () => {
      checkRateLimitMock.mockImplementationOnce(() => {
        throw new Error("Rate limit exceeded");
      });
      const handler = getInvokeHandler(CHANNELS.GITHUB_SET_TOKEN);

      await expect(handler({} as never, "ghp_valid_token")).rejects.toThrow("Rate limit exceeded");
      expect(gitHubServiceMock.validateGitHubToken).not.toHaveBeenCalled();
    });
  });

  describe("mutation family (github:assign-issue)", () => {
    it("calls checkRateLimit with mutation limits (5, 10_000)", async () => {
      const handler = getInvokeHandler(CHANNELS.GITHUB_ASSIGN_ISSUE);
      await handler({} as never, {
        cwd: "/tmp/project",
        issueNumber: 42,
        username: "octocat",
      });

      expect(checkRateLimitMock).toHaveBeenCalledWith(CHANNELS.GITHUB_ASSIGN_ISSUE, 5, 10_000);
      expect(gitHubServiceMock.assignIssue).toHaveBeenCalled();
    });

    it("rejects and skips assignIssue when rate limit throws", async () => {
      checkRateLimitMock.mockImplementationOnce(() => {
        throw new Error("Rate limit exceeded");
      });
      const handler = getInvokeHandler(CHANNELS.GITHUB_ASSIGN_ISSUE);

      await expect(
        handler({} as never, {
          cwd: "/tmp/project",
          issueNumber: 42,
          username: "octocat",
        })
      ).rejects.toThrow("Rate limit exceeded");
      expect(gitHubServiceMock.assignIssue).not.toHaveBeenCalled();
    });
  });
});
