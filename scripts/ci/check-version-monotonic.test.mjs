import { describe, it, expect } from "vitest";
import {
  ALLOWED_PREFIXES,
  checkVersionMonotonic,
  extractVersion,
  validatePrefix,
} from "./check-version-monotonic.mjs";

describe("check-version-monotonic", () => {
  describe("checkVersionMonotonic", () => {
    it("passes when new is strictly greater (patch)", () => {
      expect(checkVersionMonotonic("1.0.0", "1.0.1")).toEqual({ ok: true });
    });

    it("passes when new is strictly greater (minor)", () => {
      expect(checkVersionMonotonic("1.0.0", "1.1.0")).toEqual({ ok: true });
    });

    it("passes when new is strictly greater (major)", () => {
      expect(checkVersionMonotonic("1.5.7", "2.0.0")).toEqual({ ok: true });
    });

    it("fails when versions are equal (republishing the same tag is a regression footgun)", () => {
      const result = checkVersionMonotonic("1.0.0", "1.0.0");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not strictly greater");
    });

    it("fails when new is older", () => {
      const result = checkVersionMonotonic("1.0.0", "0.9.9");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not strictly greater");
    });

    it("passes when going from pre-release to release of the same version", () => {
      expect(checkVersionMonotonic("1.0.0-rc.1", "1.0.0")).toEqual({ ok: true });
    });

    it("passes for incremental rc bump", () => {
      expect(checkVersionMonotonic("1.0.0-rc.1", "1.0.0-rc.2")).toEqual({ ok: true });
    });

    it("passes when going from release to next pre-release", () => {
      expect(checkVersionMonotonic("1.0.0", "1.0.1-rc.1")).toEqual({ ok: true });
    });

    it("fails going from release to pre-release of same version", () => {
      const result = checkVersionMonotonic("1.0.0", "1.0.0-rc.1");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not strictly greater");
    });

    it("fails on invalid live version", () => {
      const result = checkVersionMonotonic("not-a-version", "1.0.0");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("live version");
      expect(result.error).toContain("not valid semver");
    });

    it("fails on invalid new version", () => {
      const result = checkVersionMonotonic("1.0.0", "garbage");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("new version");
      expect(result.error).toContain("not valid semver");
    });
  });

  describe("extractVersion", () => {
    it("returns the version string from a valid mapping", () => {
      expect(extractVersion({ version: "1.2.3" }, "test.yml")).toBe("1.2.3");
    });

    it("accepts pre-release strings", () => {
      expect(extractVersion({ version: "1.0.0-rc.4" }, "test.yml")).toBe("1.0.0-rc.4");
    });

    it("throws when input is null", () => {
      expect(() => extractVersion(null, "test.yml")).toThrow(/expected a YAML mapping/);
    });

    it("throws when input is a string instead of an object", () => {
      expect(() => extractVersion("hello", "test.yml")).toThrow(/expected a YAML mapping/);
    });

    it("throws when version field is missing", () => {
      expect(() => extractVersion({ files: [] }, "test.yml")).toThrow(/missing 'version' field/);
    });

    it("throws when version field is null", () => {
      expect(() => extractVersion({ version: null }, "test.yml")).toThrow(
        /missing 'version' field/
      );
    });

    it("throws when version field is a number (YAML-parsed bare numeric)", () => {
      expect(() => extractVersion({ version: 1 }, "test.yml")).toThrow(/must be a string/);
    });

    it("throws when version field is a boolean (YAML `version: true`)", () => {
      expect(() => extractVersion({ version: true }, "test.yml")).toThrow(/must be a string/);
    });

    it("throws when version field is an array (YAML sequence)", () => {
      expect(() => extractVersion({ version: ["1.0.0"] }, "test.yml")).toThrow(/must be a string/);
    });

    it("throws when version field is a nested object", () => {
      expect(() => extractVersion({ version: { major: 1 } }, "test.yml")).toThrow(
        /must be a string/
      );
    });

    it("throws when version field is a non-semver string", () => {
      expect(() => extractVersion({ version: "v1" }, "test.yml")).toThrow(/not a valid semver/);
    });

    it("throws when version field is an empty string", () => {
      expect(() => extractVersion({ version: "" }, "test.yml")).toThrow(/not a valid semver/);
    });

    it("includes the label in the error message", () => {
      expect(() => extractVersion({}, "live latest-mac.yml")).toThrow(/live latest-mac\.yml/);
    });
  });

  describe("validatePrefix", () => {
    it("accepts every prefix in ALLOWED_PREFIXES", () => {
      for (const prefix of ALLOWED_PREFIXES) {
        expect(validatePrefix(prefix)).toEqual({ ok: true });
      }
    });

    it("exposes the canonical channel allowlist", () => {
      // Lock the public surface — adding a channel should be a deliberate edit
      // (the upload step in release.yml uses the same prefix to glob YAMLs).
      expect(ALLOWED_PREFIXES).toEqual(["latest", "rc", "beta"]);
    });

    it("rejects an empty string with the not-set guidance", () => {
      const result = validatePrefix("");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not set");
      expect(result.error).toContain("latest");
    });

    it("rejects undefined with the not-set guidance", () => {
      const result = validatePrefix(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not set");
    });

    it("rejects a typo (latset) so the gate doesn't silently 404 every channel", () => {
      const result = validatePrefix("latset");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("'latset'");
      expect(result.error).toContain("not a known channel");
    });

    it("rejects nightly (channel was retired before the gate landed)", () => {
      const result = validatePrefix("nightly");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not a known channel");
    });
  });
});
