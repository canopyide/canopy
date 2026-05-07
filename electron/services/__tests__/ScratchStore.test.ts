import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

vi.mock("../../utils/logger.js", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

const mockDb = {
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
};

vi.mock("../persistence/db.js", () => ({
  getSharedDb: vi.fn(() => mockDb),
}));

import { ScratchStore } from "../ScratchStore.js";

function mockInsertChain(runImpl: () => void) {
  return {
    values: vi.fn().mockReturnValue({
      run: runImpl,
    }),
  };
}

function mockSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    all: vi.fn().mockReturnValue(rows),
    get: vi.fn().mockReturnValue(rows[0] ?? null),
  };
  return chain;
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scratch-store-test-"));
  vi.resetAllMocks();

  // Default: select returns empty (no current scratch, no existing)
  mockDb.select.mockReturnValue(mockSelectChain([]));
  mockDb.insert.mockReturnValue(mockInsertChain(vi.fn()));
  mockDb.transaction.mockImplementation((fn: (tx: unknown) => void) => fn(mockDb));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ScratchStore.createScratch", () => {
  it("creates a scratch with a UUIDv4 directory and DB row", async () => {
    const store = new ScratchStore();
    // Override root to use tmpDir
    (store as unknown as { scratchesRoot: string }).scratchesRoot = tmpDir;

    const scratch = await store.createScratch("test scratch");

    expect(scratch.name).toBe("test scratch");
    expect(scratch.path).toContain(tmpDir);
    expect(scratch.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    await expect(fs.access(scratch.path)).resolves.toBeUndefined();
  });

  it("rolls back the scratch directory on DB insert failure", async () => {
    const store = new ScratchStore();
    (store as unknown as { scratchesRoot: string }).scratchesRoot = tmpDir;

    const dbError = new Error("SQLITE_BUSY: database is locked");
    mockDb.insert.mockReturnValue(
      mockInsertChain(() => {
        throw dbError;
      })
    );

    await expect(store.createScratch("doomed")).rejects.toThrow("SQLITE_BUSY");

    // The scratch directory created before the insert should have been removed.
    const entries = await fs.readdir(tmpDir);
    expect(entries.length).toBe(0);
  });
});
