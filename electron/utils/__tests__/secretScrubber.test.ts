import { describe, expect, it } from "vitest";
import safe from "safe-regex2";
import {
  MAX_SCRUB_INPUT_LENGTH,
  PATTERNS,
  REDACTED,
  scrubSecrets,
} from "../secretScrubber.js";

describe("secretScrubber", () => {
  describe("ReDoS safety", () => {
    // Runs first — if any pattern introduces catastrophic backtracking, every
    // other test in this file is moot. `safe-regex2` is the maintained fork of
    // the unmaintained `safe-regex`.
    for (const { name, regex } of PATTERNS) {
      it(`pattern "${name}" passes safe-regex2`, () => {
        expect(safe(regex)).toBe(true);
      });
    }
  });

  describe("per-pattern redaction", () => {
    const positive: Array<{ name: string; input: string; expected: string }> = [
      {
        name: "github-pat",
        input: "clone https://ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456@github.com/x/y.git",
        expected: `clone https://${REDACTED}@github.com/x/y.git`,
      },
      {
        name: "github-fine-grained-pat",
        input: `token=github_pat_${"A".repeat(82)} trailing`,
        expected: `token=${REDACTED} trailing`,
      },
      {
        name: "github-app-token",
        input: `token=ghs_${"a".repeat(36)}`,
        expected: `token=${REDACTED}`,
      },
      {
        name: "anthropic-api-key",
        input: `key=sk-ant-${"a".repeat(95)}`,
        expected: `key=${REDACTED}`,
      },
      {
        name: "openai-api-key",
        input: `OPENAI_API_KEY=sk-${"A".repeat(48)}`,
        expected: `OPENAI_API_KEY=${REDACTED}`,
      },
      {
        name: "stripe-live",
        input: `stripe=sk_live_${"a".repeat(32)} next`,
        expected: `stripe=${REDACTED} next`,
      },
      {
        name: "stripe-test",
        input: `stripe=sk_test_${"z".repeat(40)}`,
        expected: `stripe=${REDACTED}`,
      },
      {
        name: "slack-token",
        input: "xoxb-1234567890-abcdefghijkl",
        expected: REDACTED,
      },
      {
        name: "google-api-key",
        input: `url=AIza${"A".repeat(35)}/path`,
        expected: `url=${REDACTED}/path`,
      },
      {
        name: "aws-access-key",
        input: "aws_access_key=AKIAIOSFODNN7EXAMPLE trailing",
        expected: `aws_access_key=${REDACTED} trailing`,
      },
      {
        name: "npm-token",
        input: `registry=npm_${"a".repeat(36)}`,
        expected: `registry=${REDACTED}`,
      },
      {
        name: "azure-connection-string",
        input: `conn=DefaultEndpointsProtocol=https;AccountName=myacct;AccountKey=${"A".repeat(86)}== end`,
        expected: `conn=${REDACTED} end`,
      },
      {
        name: "pem-block",
        input:
          "before -----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY----- after",
        expected: `before ${REDACTED} after`,
      },
      {
        name: "jwt",
        input: `Authorization: eyJ${"a".repeat(20)}.${"b".repeat(20)}.${"c".repeat(40)}`,
        expected: `Authorization: ${REDACTED}`,
      },
      {
        name: "bearer-token",
        input: "Authorization: Bearer abcdefghij.klmnop-qr_st=",
        expected: `Authorization: Bearer ${REDACTED}`,
      },
      {
        name: "oauth-access_token",
        input: "https://api.example.com/?foo=bar&access_token=AbCdEfGhIj123456",
        expected: `https://api.example.com/?foo=bar&access_token=${REDACTED}`,
      },
      {
        name: "oauth-client_secret",
        input: "?client_secret=supersecretvalue&other=1",
        expected: `?client_secret=${REDACTED}&other=1`,
      },
    ];

    for (const { name, input, expected } of positive) {
      it(`redacts ${name}`, () => {
        expect(scrubSecrets(input)).toBe(expected);
      });
    }
  });

  describe("negative cases", () => {
    it("leaves plain English log lines untouched", () => {
      const msg = "User 42 signed in at 2026-04-18T12:00:00Z from Los Angeles";
      expect(scrubSecrets(msg)).toBe(msg);
    });

    it("does not match a sigil that is one character short", () => {
      // Anthropic keys require {90,255}; 89 chars must not match.
      const shortKey = `sk-ant-${"a".repeat(89)}`;
      expect(scrubSecrets(shortKey)).toBe(shortKey);
    });

    it("does not match md5-length hex strings as AWS keys", () => {
      const md5 = "0123456789abcdef0123456789abcdef";
      expect(scrubSecrets(md5)).toBe(md5);
    });

    it("does not match partial PEM sigils", () => {
      const partial = "-----BEGIN CERTIFICATE----- without matching end marker";
      expect(scrubSecrets(partial)).toBe(partial);
    });

    it("leaves an empty string unchanged", () => {
      expect(scrubSecrets("")).toBe("");
    });

    it("does not re-redact an already redacted placeholder", () => {
      const already = `prefix ${REDACTED} suffix`;
      expect(scrubSecrets(already)).toBe(already);
    });
  });

  describe("idempotence", () => {
    it("scrubSecrets(scrubSecrets(x)) === scrubSecrets(x) for mixed secrets", () => {
      const mixed = [
        "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456",
        "Bearer abcdefghij.klmnop-qr_st=",
        `sk-${"A".repeat(48)}`,
        "AKIAIOSFODNN7EXAMPLE",
        "plain text with no secrets",
      ].join(" | ");

      const once = scrubSecrets(mixed);
      expect(scrubSecrets(once)).toBe(once);
    });
  });

  describe("length guard", () => {
    it("pre-truncates to MAX_SCRUB_INPUT_LENGTH to bound worst-case work", () => {
      const oversized = "x".repeat(MAX_SCRUB_INPUT_LENGTH + 50_000);
      const out = scrubSecrets(oversized);
      expect(out.length).toBe(MAX_SCRUB_INPUT_LENGTH);
    });

    it("still redacts a secret inside the first 100KB of oversized input", () => {
      // Prefix the secret with a non-word char so `\bghp_` matches.
      const padding = "a".repeat(50_000) + " ";
      const secret = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456";
      const oversized = padding + secret + " " + "b".repeat(MAX_SCRUB_INPUT_LENGTH);
      const out = scrubSecrets(oversized);
      expect(out).toContain(REDACTED);
      expect(out).not.toContain(secret);
    });
  });

  describe("multiple secrets in one string", () => {
    it("redacts every distinct secret in a single pass", () => {
      const input = [
        "token1=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456",
        "token2=AKIAIOSFODNN7EXAMPLE",
        `auth=Bearer abc123.def-456_xyz=`,
      ].join(" ; ");

      const out = scrubSecrets(input);
      expect(out).not.toContain("ghp_");
      expect(out).not.toContain("AKIA");
      expect(out).not.toMatch(/Bearer [A-Za-z0-9]/);
      const redactionCount = (out.match(/\[REDACTED\]/g) ?? []).length;
      expect(redactionCount).toBe(3);
    });
  });
});
