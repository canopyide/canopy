import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildTerminalEnv } from "../terminalSpawn.js";
import type { PtySpawnOptions } from "../types.js";

const baseOptions: PtySpawnOptions = {
  cwd: "/repo",
  cols: 80,
  rows: 24,
};

describe("buildTerminalEnv NODE_COMPILE_CACHE injection", () => {
  let originalUserData: string | undefined;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalUserData = process.env.DAINTREE_USER_DATA;
    // Avoid leaking real credentials from the host shell into spawn under test.
    originalApiKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalUserData === undefined) {
      delete process.env.DAINTREE_USER_DATA;
    } else {
      process.env.DAINTREE_USER_DATA = originalUserData;
    }
    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }
  });

  it("injects NODE_COMPILE_CACHE for a Claude agent spawn", () => {
    process.env.DAINTREE_USER_DATA = "/tmp/test-userdata";
    const env = buildTerminalEnv(
      { ...baseOptions, launchAgentId: "claude" },
      "pane-1",
      "/bin/bash"
    );
    expect(env.NODE_COMPILE_CACHE).toBe(
      path.join("/tmp/test-userdata", "agent-compile-cache", "claude")
    );
  });

  it("injects NODE_COMPILE_CACHE for a Gemini agent spawn", () => {
    process.env.DAINTREE_USER_DATA = "/tmp/test-userdata";
    const env = buildTerminalEnv(
      { ...baseOptions, launchAgentId: "gemini" },
      "pane-1",
      "/bin/bash"
    );
    expect(env.NODE_COMPILE_CACHE).toBe(
      path.join("/tmp/test-userdata", "agent-compile-cache", "gemini")
    );
  });

  it("does NOT inject NODE_COMPILE_CACHE for Codex (Rust binary)", () => {
    process.env.DAINTREE_USER_DATA = "/tmp/test-userdata";
    const env = buildTerminalEnv({ ...baseOptions, launchAgentId: "codex" }, "pane-1", "/bin/bash");
    expect(env.NODE_COMPILE_CACHE).toBeUndefined();
  });

  it("does NOT inject NODE_COMPILE_CACHE for plain terminals (no launchAgentId)", () => {
    process.env.DAINTREE_USER_DATA = "/tmp/test-userdata";
    const env = buildTerminalEnv(baseOptions, "pane-1", "/bin/bash");
    expect(env.NODE_COMPILE_CACHE).toBeUndefined();
  });

  it("does NOT inject when DAINTREE_USER_DATA is missing", () => {
    delete process.env.DAINTREE_USER_DATA;
    const env = buildTerminalEnv(
      { ...baseOptions, launchAgentId: "claude" },
      "pane-1",
      "/bin/bash"
    );
    expect(env.NODE_COMPILE_CACHE).toBeUndefined();
  });

  it("respects an explicit NODE_COMPILE_CACHE override from intentionalEnv", () => {
    process.env.DAINTREE_USER_DATA = "/tmp/test-userdata";
    const env = buildTerminalEnv(
      {
        ...baseOptions,
        launchAgentId: "claude",
        env: { NODE_COMPILE_CACHE: "/custom/path" },
      },
      "pane-1",
      "/bin/bash"
    );
    expect(env.NODE_COMPILE_CACHE).toBe("/custom/path");
  });
});
