import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "node:path";

vi.mock("node-pty", () => ({
  spawn: vi.fn(),
}));

import { computeSpawnContext } from "../terminalSpawn.js";
import type { PtySpawnOptions } from "../types.js";

const PROFILE_FLAG = "DAINTREE_PROFILE_AGENT_STARTUP";
const PACKAGED_FLAG = "DAINTREE_IS_PACKAGED";
const USER_DATA = "DAINTREE_USER_DATA";

const baseOptions: PtySpawnOptions = {
  cwd: "/repo",
  cols: 80,
  rows: 24,
};

describe("terminalSpawn agent startup CPU profiling injection (Issue #7616)", () => {
  let originalProfile: string | undefined;
  let originalPackaged: string | undefined;
  let originalUserData: string | undefined;
  let originalNodeOptions: string | undefined;

  beforeEach(() => {
    originalProfile = process.env[PROFILE_FLAG];
    originalPackaged = process.env[PACKAGED_FLAG];
    originalUserData = process.env[USER_DATA];
    originalNodeOptions = process.env.NODE_OPTIONS;
    delete process.env[PROFILE_FLAG];
    delete process.env[PACKAGED_FLAG];
    delete process.env[USER_DATA];
    delete process.env.NODE_OPTIONS;
  });

  afterEach(() => {
    restore(PROFILE_FLAG, originalProfile);
    restore(PACKAGED_FLAG, originalPackaged);
    restore(USER_DATA, originalUserData);
    restore("NODE_OPTIONS", originalNodeOptions);
  });

  function restore(key: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  it("injects --cpu-prof + --cpu-prof-dir when flag, dev gate, userData, and launchAgentId all hold", () => {
    process.env[PROFILE_FLAG] = "1";
    process.env[PACKAGED_FLAG] = "0";
    process.env[USER_DATA] = "/tmp/daintree-userdata";

    const context = computeSpawnContext("term-1", {
      ...baseOptions,
      launchAgentId: "claude",
    });

    const expectedDir = path.join("/tmp/daintree-userdata", "agent-profiles");
    expect(context.env.NODE_OPTIONS).toBe(`--cpu-prof --cpu-prof-dir=${expectedDir}`);
  });

  it("preserves and appends to an existing NODE_OPTIONS value", () => {
    process.env[PROFILE_FLAG] = "1";
    process.env[PACKAGED_FLAG] = "0";
    process.env[USER_DATA] = "/tmp/daintree-userdata";
    process.env.NODE_OPTIONS = "--max-old-space-size=4096";

    const context = computeSpawnContext("term-2", {
      ...baseOptions,
      launchAgentId: "codex",
    });

    expect(context.env.NODE_OPTIONS).toContain("--max-old-space-size=4096");
    expect(context.env.NODE_OPTIONS).toContain("--cpu-prof");
    expect(context.env.NODE_OPTIONS).toContain("--cpu-prof-dir=");
  });

  it("does NOT inject when DAINTREE_IS_PACKAGED is '1' (packaged build)", () => {
    process.env[PROFILE_FLAG] = "1";
    process.env[PACKAGED_FLAG] = "1";
    process.env[USER_DATA] = "/tmp/daintree-userdata";

    const context = computeSpawnContext("term-3", {
      ...baseOptions,
      launchAgentId: "claude",
    });

    expect(context.env.NODE_OPTIONS).toBeUndefined();
  });

  it("does NOT inject when DAINTREE_IS_PACKAGED is missing (defensive default)", () => {
    process.env[PROFILE_FLAG] = "1";
    process.env[USER_DATA] = "/tmp/daintree-userdata";
    // packaged flag intentionally absent

    const context = computeSpawnContext("term-4", {
      ...baseOptions,
      launchAgentId: "claude",
    });

    expect(context.env.NODE_OPTIONS).toBeUndefined();
  });

  it("does NOT inject when DAINTREE_PROFILE_AGENT_STARTUP is unset", () => {
    process.env[PACKAGED_FLAG] = "0";
    process.env[USER_DATA] = "/tmp/daintree-userdata";

    const context = computeSpawnContext("term-5", {
      ...baseOptions,
      launchAgentId: "claude",
    });

    expect(context.env.NODE_OPTIONS).toBeUndefined();
  });

  it("does NOT inject when launchAgentId is absent (plain shell)", () => {
    process.env[PROFILE_FLAG] = "1";
    process.env[PACKAGED_FLAG] = "0";
    process.env[USER_DATA] = "/tmp/daintree-userdata";

    const context = computeSpawnContext("term-6", baseOptions);

    expect(context.env.NODE_OPTIONS).toBeUndefined();
  });

  it("does NOT inject when DAINTREE_USER_DATA is missing", () => {
    process.env[PROFILE_FLAG] = "1";
    process.env[PACKAGED_FLAG] = "0";
    // userData intentionally absent

    const context = computeSpawnContext("term-7", {
      ...baseOptions,
      launchAgentId: "claude",
    });

    expect(context.env.NODE_OPTIONS).toBeUndefined();
  });
});
