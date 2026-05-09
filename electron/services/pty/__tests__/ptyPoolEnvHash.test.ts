import { describe, it, expect } from "vitest";
import { computePoolEnvHash, POOL_ENV_EMPTY_HASH, VOLATILE_ENV_KEYS } from "../ptyPoolEnvHash.js";

describe("computePoolEnvHash", () => {
  it("returns the empty sentinel for undefined input", () => {
    expect(computePoolEnvHash(undefined)).toBe(POOL_ENV_EMPTY_HASH);
  });

  it("returns the empty sentinel for an empty object", () => {
    expect(computePoolEnvHash({})).toBe(POOL_ENV_EMPTY_HASH);
  });

  it("is deterministic across object key order", () => {
    const a = computePoolEnvHash({ FOO: "1", BAR: "2", BAZ: "3" });
    const b = computePoolEnvHash({ BAZ: "3", FOO: "1", BAR: "2" });
    const c = computePoolEnvHash({ BAR: "2", BAZ: "3", FOO: "1" });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("produces different hashes for different values", () => {
    const a = computePoolEnvHash({ FOO: "1" });
    const b = computePoolEnvHash({ FOO: "2" });
    expect(a).not.toBe(b);
  });

  it("produces different hashes for different keys", () => {
    const a = computePoolEnvHash({ FOO: "1" });
    const b = computePoolEnvHash({ BAR: "1" });
    expect(a).not.toBe(b);
  });

  it("excludes volatile shell-state keys from the hash", () => {
    const base = computePoolEnvHash({ FOO: "1" });
    for (const key of VOLATILE_ENV_KEYS) {
      const withVolatile = computePoolEnvHash({ FOO: "1", [key]: "anything" });
      expect(withVolatile).toBe(base);
    }
  });

  it("returns the empty sentinel when input contains only volatile keys", () => {
    const onlyVolatile: Record<string, string> = {};
    for (const key of VOLATILE_ENV_KEYS) {
      onlyVolatile[key] = "x";
    }
    expect(computePoolEnvHash(onlyVolatile)).toBe(POOL_ENV_EMPTY_HASH);
  });

  it("excludes sensitive secret keys via filterEnvironment", () => {
    const a = computePoolEnvHash({ FOO: "1" });
    const b = computePoolEnvHash({
      FOO: "1",
      ANTHROPIC_API_KEY: "sk-secret",
      GITHUB_TOKEN: "ghp-x",
      MY_SERVICE_TOKEN: "y",
    });
    expect(b).toBe(a);
  });

  it("returns the empty sentinel for env containing only secrets", () => {
    expect(computePoolEnvHash({ ANTHROPIC_API_KEY: "x", DATABASE_URL: "postgres://" })).toBe(
      POOL_ENV_EMPTY_HASH
    );
  });

  it("excludes DAINTREE_* metadata vars (they're injected fresh per spawn)", () => {
    const base = computePoolEnvHash({ FOO: "1" });
    const withMetadata = computePoolEnvHash({
      FOO: "1",
      DAINTREE_PANE_ID: "abc",
      DAINTREE_CWD: "/repo",
    });
    expect(withMetadata).toBe(base);
  });

  it("strips undefined values before hashing", () => {
    const a = computePoolEnvHash({ FOO: "1" });
    const b = computePoolEnvHash({ FOO: "1", BAR: undefined });
    expect(b).toBe(a);
  });

  it("is sensitive to value length without collisions on adjacent ASCII chars", () => {
    const a = computePoolEnvHash({ FOO: "ab" });
    const b = computePoolEnvHash({ FOO: "ba" });
    expect(a).not.toBe(b);
  });

  it("returns a hash with the env- prefix", () => {
    const hash = computePoolEnvHash({ FOO: "1", BAR: "2" });
    expect(hash).toMatch(/^env-/);
    expect(hash).not.toBe(POOL_ENV_EMPTY_HASH);
  });
});
