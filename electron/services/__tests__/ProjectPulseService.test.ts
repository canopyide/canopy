import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("fs", () => ({
  existsSync: () => true,
}));

type SimpleGitStub = {
  raw: (args: string[]) => Promise<string>;
  checkIsRepo: () => Promise<boolean>;
};

function createGitStub(impl: (args: string[]) => Promise<string>): SimpleGitStub {
  return {
    checkIsRepo: async () => true,
    raw: impl,
  };
}

describe("ProjectPulseService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("dedupes concurrent requests with same cache key", async () => {
    const raw = vi.fn(async (args: string[]) => {
      const cmd = args[0];
      if (cmd === "rev-parse" && args[1] === "HEAD") return "deadbeef\n";
      if (cmd === "rev-parse" && args.includes("--abbrev-ref")) return "main\n";
      if (cmd === "log") return "";
      return "";
    });

    vi.doMock("simple-git", () => ({
      simpleGit: () => createGitStub(raw),
    }));

    const { ProjectPulseService } = await import("../ProjectPulseService.js");
    const svc = new ProjectPulseService();

    const opts = {
      worktreePath: "/repo",
      worktreeId: "wt-1",
      mainBranch: "main",
      rangeDays: 14 as const,
      includeDelta: false,
      includeRecentCommits: false,
    };

    const p1 = svc.getPulse(opts);
    const p2 = svc.getPulse(opts);
    await Promise.all([p1, p2]);

    const heatmapCalls = raw.mock.calls.filter(([args]) => {
      const argv = args as string[];
      return argv[0] === "log" && argv.includes("--pretty=format:%ct");
    });
    expect(heatmapCalls.length).toBe(1);
  });

  it("does not reuse cache across different include options", async () => {
    const raw = vi.fn(async (args: string[]) => {
      const cmd = args[0];
      if (cmd === "rev-parse" && args[1] === "HEAD") return "deadbeef\n";
      if (cmd === "rev-parse" && args.includes("--abbrev-ref")) return "main\n";
      if (cmd === "log") return "";
      return "";
    });

    vi.doMock("simple-git", () => ({
      simpleGit: () => createGitStub(raw),
    }));

    const { ProjectPulseService } = await import("../ProjectPulseService.js");
    const svc = new ProjectPulseService();

    await svc.getPulse({
      worktreePath: "/repo",
      worktreeId: "wt-1",
      mainBranch: "main",
      rangeDays: 14 as const,
      includeDelta: false,
      includeRecentCommits: false,
    });

    await svc.getPulse({
      worktreePath: "/repo",
      worktreeId: "wt-1",
      mainBranch: "main",
      rangeDays: 14 as const,
      includeDelta: false,
      includeRecentCommits: true,
    });

    const heatmapCalls = raw.mock.calls.filter(([args]) => {
      const argv = args as string[];
      return argv[0] === "log" && argv.includes("--pretty=format:%ct");
    });
    expect(heatmapCalls.length).toBe(2);
  });

  it("returns empty heatmap on git log error", async () => {
    const raw = vi.fn(async (args: string[]) => {
      const cmd = args[0];
      if (cmd === "rev-parse" && args[1] === "HEAD") throw new Error("no commits");
      if (cmd === "rev-parse" && args.includes("--abbrev-ref")) return "HEAD\n";
      if (cmd === "log") throw new Error("fatal");
      return "";
    });

    vi.doMock("simple-git", () => ({
      simpleGit: () => createGitStub(raw),
    }));

    const { ProjectPulseService } = await import("../ProjectPulseService.js");
    const svc = new ProjectPulseService();

    const pulse = await svc.getPulse({
      worktreePath: "/repo",
      worktreeId: "wt-1",
      mainBranch: "main",
      rangeDays: 14 as const,
      includeDelta: false,
      includeRecentCommits: false,
    });

    expect(pulse.heatmap).toHaveLength(14);
    expect(pulse.commitsInRange).toBe(0);
    expect(pulse.branch).toBeUndefined();
  });
});
