import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { mkdtemp, readFile, rm } from "fs/promises";
import path from "path";
import os from "os";

const { mockedOpen, mockedSync, mockedClose } = vi.hoisted(() => ({
  mockedOpen: vi.fn(),
  mockedSync: vi.fn(),
  mockedClose: vi.fn(),
}));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, open: mockedOpen };
});

import { resilientAtomicWriteFile, resilientAtomicWriteFileSync } from "../fs.js";

describe("syncParentDirectory (async)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "daintree-dirsync-test-"));
    vi.clearAllMocks();
    mockedOpen.mockResolvedValue({ sync: mockedSync, close: mockedClose });
    mockedSync.mockResolvedValue(undefined);
    mockedClose.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("opens parent dir, syncs, and closes after rename", async () => {
    const target = path.join(tmpDir, "test.json");
    await resilientAtomicWriteFile(target, "data");

    expect(mockedOpen).toHaveBeenCalledWith(tmpDir, "r");
    expect(mockedSync).toHaveBeenCalled();
    expect(mockedClose).toHaveBeenCalled();
  });

  it("still closes dir handle when sync rejects", async () => {
    mockedSync.mockRejectedValue(new Error("EIO: fsync failed"));

    const target = path.join(tmpDir, "test.json");
    await expect(resilientAtomicWriteFile(target, "data")).rejects.toThrow("EIO");

    expect(mockedClose).toHaveBeenCalled();
  });
});

describe("syncParentDirectory (win32 skip)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "daintree-dirsync-win-test-"));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("skips dir fsync on win32", async () => {
    const restore = vi.spyOn(process, "platform", "get").mockReturnValue("win32");

    const target = path.join(tmpDir, "test.json");
    await resilientAtomicWriteFile(target, "data");

    expect(mockedOpen).not.toHaveBeenCalled();
    restore();
  });
});

describe("integration: writes survive with dir fsync enabled", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "daintree-dirsync-int-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("async write with dir fsync (real fs)", async () => {
    const target = path.join(tmpDir, "test.json");
    await resilientAtomicWriteFile(target, '{"key":"value"}', "utf-8");

    const content = await readFile(target, "utf-8");
    expect(content).toBe('{"key":"value"}');
  });

  it("sync write with dir fsync (real fs)", () => {
    const target = path.join(tmpDir, "test.json");
    resilientAtomicWriteFileSync(target, "synctest", "utf-8");

    const content = readFileSync(target, "utf-8");
    expect(content).toBe("synctest");
  });

  it("leaves no temp files after write", async () => {
    const { readdirSync } = await import("fs");
    const target = path.join(tmpDir, "test.json");
    await resilientAtomicWriteFile(target, "data");

    const files = readdirSync(tmpDir);
    expect(files).toEqual(["test.json"]);
  });
});
