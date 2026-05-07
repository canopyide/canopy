import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";
import os from "os";

const utilsMock = vi.hoisted(() => ({
  resilientAtomicWriteFile: vi.fn(),
  resilientRename: vi.fn(),
  resilientUnlink: vi.fn(),
}));

vi.mock("../../utils/fs.js", () => utilsMock);
vi.mock("../../utils/performance.js", () => ({
  markPerformance: vi.fn(),
  withPerformanceSpan: vi.fn(async (_mark: string, task: () => Promise<unknown>) => task()),
}));

import { ProjectStateManager } from "../ProjectStateManager.js";
import { generateProjectId } from "../projectStorePaths.js";
import type { ProjectState } from "../../types/index.js";

function makeState(overrides?: Partial<ProjectState>): ProjectState {
  return {
    projectId: "adversarial-project",
    sidebarWidth: 350,
    terminals: [],
    ...overrides,
  };
}

describe("ProjectStateManager.clearProjectState adversarial", () => {
  let tempDir: string;
  let manager: ProjectStateManager;
  let projectId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    utilsMock.resilientAtomicWriteFile.mockResolvedValue(undefined);
    utilsMock.resilientRename.mockResolvedValue(undefined);
    utilsMock.resilientUnlink.mockResolvedValue(undefined);

    tempDir = path.join(os.tmpdir(), "daintree-clear-adv");
    manager = new ProjectStateManager(tempDir);
    projectId = generateProjectId("/test/adversarial-project");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("treats ENOENT from resilientUnlink as success (already gone)", async () => {
    await manager.saveProjectState(projectId, makeState({ sidebarWidth: 100 }));

    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    utilsMock.resilientUnlink.mockRejectedValueOnce(enoent);

    await expect(manager.clearProjectState(projectId)).resolves.toBeUndefined();
  });

  it("invalidates cache before unlink — ENOENT path leaves no cached entry", async () => {
    await manager.saveProjectState(projectId, makeState({ sidebarWidth: 111 }));

    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    utilsMock.resilientUnlink.mockRejectedValueOnce(enoent);

    await manager.clearProjectState(projectId);

    // Subsequent read must miss the cache. resilientUnlink "succeeded"
    // (ENOENT-as-success), so the file is gone — readFile would ENOENT.
    // We assert via behavior: the cached value is NOT returned.
    // Since fs.readFile is unmocked here and the file path doesn't exist,
    // readFile throws ENOENT, which the fixed getProjectState turns into null.
    const result = await manager.getProjectState(projectId);
    expect(result).toBeNull();
  });

  it("invalidates cache before unlink — non-ENOENT error still wipes the cache", async () => {
    await manager.saveProjectState(projectId, makeState({ sidebarWidth: 222 }));

    const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" });
    utilsMock.resilientUnlink.mockRejectedValueOnce(eacces);

    await expect(manager.clearProjectState(projectId)).rejects.toThrow("EACCES");

    // Even though clearProjectState rejected, the cache must be empty so
    // callers don't continue reading the presumed-deleted state for 60s.
    const result = await manager.getProjectState(projectId);
    expect(result).toBeNull();
  });

  it("re-throws non-ENOENT errors from resilientUnlink", async () => {
    await manager.saveProjectState(projectId, makeState());

    const eperm = Object.assign(new Error("EPERM"), { code: "EPERM" });
    utilsMock.resilientUnlink.mockRejectedValueOnce(eperm);

    await expect(manager.clearProjectState(projectId)).rejects.toThrow("EPERM");
  });

  it("calls resilientUnlink even when the file may not exist (no pre-flight existsSync)", async () => {
    // Pre-fix: an existsSync gate would short-circuit and never call unlink
    // when the file appeared missing — racy and inconsistent with the
    // resilient-fs layer. Post-fix: always attempt unlink; ENOENT is success.
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    utilsMock.resilientUnlink.mockRejectedValueOnce(enoent);

    await expect(manager.clearProjectState(projectId)).resolves.toBeUndefined();
    expect(utilsMock.resilientUnlink).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectStateManager.getProjectState ENOENT branch (mocked fs)", () => {
  let tempDir: string;
  let manager: ProjectStateManager;
  let projectId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    utilsMock.resilientAtomicWriteFile.mockResolvedValue(undefined);
    utilsMock.resilientRename.mockResolvedValue(undefined);
    utilsMock.resilientUnlink.mockResolvedValue(undefined);

    tempDir = path.join(os.tmpdir(), "daintree-get-adv");
    manager = new ProjectStateManager(tempDir);
    projectId = generateProjectId("/test/adversarial-get-project");
  });

  it("does not invoke resilientRename (quarantine) when readFile yields ENOENT", async () => {
    // No file exists on disk; readFile rejects with ENOENT — the fixed branch
    // must NOT route through the corruption-recovery path that calls rename.
    const result = await manager.getProjectState(projectId);
    expect(result).toBeNull();
    expect(utilsMock.resilientRename).not.toHaveBeenCalled();
  });
});
