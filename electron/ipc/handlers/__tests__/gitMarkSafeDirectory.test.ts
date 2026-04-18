import { describe, it, expect, vi, beforeEach } from "vitest";

const ipcMainMock = vi.hoisted(() => ({
  handle: vi.fn(),
  removeHandler: vi.fn(),
}));

vi.mock("electron", () => ({ ipcMain: ipcMainMock }));

const execFileMock = vi.hoisted(() =>
  vi.fn(
    (
      _cmd: string,
      _args: readonly string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      cb(null, "", "");
    }
  )
);

vi.mock("node:child_process", () => ({ execFile: execFileMock }));

vi.mock("../../../store.js", () => ({
  store: { get: vi.fn(() => ({})) },
}));

vi.mock("../../../services/SoundService.js", () => ({
  soundService: { play: vi.fn() },
}));

vi.mock("../../../services/PreAgentSnapshotService.js", () => ({
  preAgentSnapshotService: {
    getSnapshot: vi.fn(),
    listSnapshots: vi.fn(),
    revertToSnapshot: vi.fn(),
    deleteSnapshot: vi.fn(),
  },
}));

vi.mock("../../../utils/hardenedGit.js", () => ({
  validateCwd: vi.fn(),
  createHardenedGit: vi.fn(),
  createAuthenticatedGit: vi.fn(),
}));

import { registerGitWriteHandlers } from "../git-write.js";

function getHandler(channel: string) {
  const call = ipcMainMock.handle.mock.calls.find((c: unknown[]) => c[0] === channel);
  if (!call) throw new Error(`Handler for ${channel} not registered`);
  return call[1] as (_e: unknown, ...args: unknown[]) => unknown;
}

describe("git:mark-safe-directory handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the mark-safe-directory channel", () => {
    registerGitWriteHandlers({} as Parameters<typeof registerGitWriteHandlers>[0]);
    expect(ipcMainMock.handle).toHaveBeenCalledWith(
      "git:mark-safe-directory",
      expect.any(Function)
    );
  });

  it("rejects a non-string payload", async () => {
    registerGitWriteHandlers({} as Parameters<typeof registerGitWriteHandlers>[0]);
    const handler = getHandler("git:mark-safe-directory");
    await expect(handler(null, 123)).rejects.toThrow(/non-empty string/i);
    await expect(handler(null, "")).rejects.toThrow(/non-empty string/i);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("rejects a relative path", async () => {
    registerGitWriteHandlers({} as Parameters<typeof registerGitWriteHandlers>[0]);
    const handler = getHandler("git:mark-safe-directory");
    await expect(handler(null, "relative/path")).rejects.toThrow(/absolute/i);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("invokes git config with the absolute path", async () => {
    registerGitWriteHandlers({} as Parameters<typeof registerGitWriteHandlers>[0]);
    const handler = getHandler("git:mark-safe-directory");
    await handler(null, "/Users/foo/my repo");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["config", "--global", "--add", "safe.directory", "/Users/foo/my repo"],
      expect.objectContaining({ env: expect.objectContaining({ LC_ALL: "C" }) }),
      expect.any(Function)
    );
  });

  it("propagates git config failures", async () => {
    execFileMock.mockImplementationOnce(
      (
        _cmd: string,
        _args: readonly string[],
        _opts: unknown,
        cb: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        cb(new Error("git not found"), "", "git not found");
      }
    );
    registerGitWriteHandlers({} as Parameters<typeof registerGitWriteHandlers>[0]);
    const handler = getHandler("git:mark-safe-directory");
    await expect(handler(null, "/Users/foo/repo")).rejects.toThrow(/git not found/);
  });
});
