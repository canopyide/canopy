import { describe, it, expect } from "vitest";
import { isSensitiveEnvKey } from "../envVars.js";

describe("isSensitiveEnvKey", () => {
  it("matches keys that contain a sensitive token bounded by non-letters", () => {
    expect(isSensitiveEnvKey("API_KEY")).toBe(true);
    expect(isSensitiveEnvKey("KEY")).toBe(true);
    expect(isSensitiveEnvKey("SECRET")).toBe(true);
    expect(isSensitiveEnvKey("MY_TOKEN")).toBe(true);
    expect(isSensitiveEnvKey("GITHUB_TOKEN")).toBe(true);
    expect(isSensitiveEnvKey("MY_PASSWORD")).toBe(true);
    expect(isSensitiveEnvKey("PASSWORD_HASH")).toBe(true);
    expect(isSensitiveEnvKey("PRIVATE_KEY")).toBe(true);
    expect(isSensitiveEnvKey("DB_SECRET_VALUE")).toBe(true);
  });

  it("matches credential and passphrase patterns", () => {
    expect(isSensitiveEnvKey("GOOGLE_APPLICATION_CREDENTIALS")).toBe(true);
    expect(isSensitiveEnvKey("AWS_CREDENTIAL_EXPIRATION")).toBe(true);
    expect(isSensitiveEnvKey("CREDENTIAL")).toBe(true);
    expect(isSensitiveEnvKey("CREDENTIALS")).toBe(true);
    expect(isSensitiveEnvKey("SSH_PASSPHRASE")).toBe(true);
    expect(isSensitiveEnvKey("GPG_PASSPHRASE")).toBe(true);
    expect(isSensitiveEnvKey("PASSPHRASE")).toBe(true);
  });

  it("matches lowercase variants (case-insensitive)", () => {
    expect(isSensitiveEnvKey("api_key")).toBe(true);
    expect(isSensitiveEnvKey("my_token")).toBe(true);
  });

  it("rejects English words that merely contain the sensitive substring", () => {
    expect(isSensitiveEnvKey("MONKEY_NAME")).toBe(false);
    expect(isSensitiveEnvKey("KEYBOARD_LAYOUT")).toBe(false);
    expect(isSensitiveEnvKey("STOKEN_ID")).toBe(false);
    expect(isSensitiveEnvKey("SECRETARY_EMAIL")).toBe(false);
    expect(isSensitiveEnvKey("DONKEY_WORK")).toBe(false);
    expect(isSensitiveEnvKey("PASSWORDLESS_MODE")).toBe(false);
  });

  it("rejects keys with no sensitive token", () => {
    expect(isSensitiveEnvKey("PORT")).toBe(false);
    expect(isSensitiveEnvKey("DEBUG")).toBe(false);
    expect(isSensitiveEnvKey("NODE_ENV")).toBe(false);
    expect(isSensitiveEnvKey("")).toBe(false);
  });

  // Documents intentional behavior: the negative-letter lookarounds require a
  // non-letter (or string boundary) on each side of the sensitive token.
  // Underscore / digit / boundary all qualify; an adjacent letter does not.
  // Names like APIKEY (no separator) therefore fall through and are NOT
  // classified as sensitive — the regex prefers false negatives over false
  // positives for unfamiliar concatenations.
  it("does not match concatenations without a non-letter separator", () => {
    expect(isSensitiveEnvKey("APIKEY")).toBe(false);
    expect(isSensitiveEnvKey("MYSECRETVALUE")).toBe(false);
  });
});
