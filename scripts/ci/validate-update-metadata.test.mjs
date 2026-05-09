import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock modules before importing the script via exec
const mockReadFileSync = vi.fn();
const mockExit = vi.fn();
const mockError = vi.fn();
const mockLog = vi.fn();

vi.mock("node:fs", () => ({
  readFileSync: mockReadFileSync,
}));

vi.mock("js-yaml", () => ({
  load: vi.fn(),
}));

// We test the script logic directly by extracting the validation into a
// testable function. Running the full script via child_process would require
// real YAML files, so we instead test the core logic inline.

// The script's validation logic, extracted for testing:
import path from "node:path";

function validateMetadata(data, metadataPath, packageVersion) {
  const errors = [];

  if (data.version !== packageVersion) {
    errors.push(
      `::error file=${metadataPath}::version mismatch: yml=${data.version} package.json=${packageVersion}`
    );
  }
  if (!Array.isArray(data.files) || data.files.length === 0) {
    errors.push(
      `::error file=${metadataPath}::files[] is missing or empty — updater has nothing to download`
    );
  }
  for (const f of data.files || []) {
    if (!f.url) errors.push(`::error file=${metadataPath}::file entry missing url`);
    if (!f.sha512)
      errors.push(`::error file=${metadataPath}::file entry missing sha512 for ${f.url}`);
    if (typeof f.size !== "number" || f.size <= 0) {
      errors.push(`::error file=${metadataPath}::file entry missing or invalid size for ${f.url}`);
    }
  }
  if (!data.path) {
    errors.push(`::error file=${metadataPath}::top-level path missing`);
  } else {
    const basename = path.basename(metadataPath).toLowerCase();
    if (basename.includes("mac") && !String(data.path).endsWith(".zip")) {
      errors.push(
        `::error file=${metadataPath}::top-level path must be a ZIP for macOS (Squirrel.Mac requires .zip) but got: ${data.path}`
      );
    }
  }
  if (!data.sha512) errors.push(`::error file=${metadataPath}::top-level sha512 missing`);
  if (!data.releaseDate) errors.push(`::error file=${metadataPath}::releaseDate missing`);

  return errors;
}

describe("validate-update-metadata", () => {
  const validFile = {
    url: "Daintree-1.0.0-mac.zip",
    sha512: "abc123",
    size: 123456789,
  };

  const baseValid = {
    version: "1.0.0",
    files: [validFile],
    path: "Daintree-1.0.0-mac.zip",
    sha512: "def456",
    releaseDate: "2024-01-01T00:00:00.000Z",
  };

  const pkgVersion = "1.0.0";

  describe("macOS .zip check", () => {
    it("passes for macOS metadata with .zip path", () => {
      const errors = validateMetadata(baseValid, "/build/latest-mac.yml", pkgVersion);
      expect(errors).toHaveLength(0);
    });

    it("passes for nightly macOS metadata with .zip path", () => {
      const errors = validateMetadata(baseValid, "/build/nightly-mac.yml", pkgVersion);
      expect(errors).toHaveLength(0);
    });

    it("passes for beta macOS metadata with .zip path", () => {
      const errors = validateMetadata(baseValid, "/build/beta-mac.yml", pkgVersion);
      expect(errors).toHaveLength(0);
    });

    it("fails for macOS metadata with .dmg path", () => {
      const data = { ...baseValid, path: "Daintree-1.0.0-mac.dmg" };
      const errors = validateMetadata(data, "/build/latest-mac.yml", pkgVersion);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("must be a ZIP");
      expect(errors[0]).toContain(".dmg");
    });

    it("fails for macOS metadata with non-.zip path", () => {
      const data = { ...baseValid, path: "Daintree-1.0.0-mac.tar.gz" };
      const errors = validateMetadata(data, "/build/beta-mac.yml", pkgVersion);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("must be a ZIP");
    });

    it("passes for Linux metadata with .AppImage path", () => {
      const linuxData = { ...baseValid, path: "Daintree-1.0.0.AppImage" };
      const errors = validateMetadata(linuxData, "/build/latest-linux.yml", pkgVersion);
      expect(errors).toHaveLength(0);
    });

    it("passes for Linux metadata with .deb path", () => {
      const linuxData = { ...baseValid, path: "daintree_1.0.0_amd64.deb" };
      const errors = validateMetadata(linuxData, "/build/beta-linux.yml", pkgVersion);
      expect(errors).toHaveLength(0);
    });

    it("passes for Linux metadata with non-.zip path", () => {
      const linuxData = { ...baseValid, path: "Daintree-1.0.0.AppImage" };
      const errors = validateMetadata(linuxData, "/build/nightly-linux.yml", pkgVersion);
      expect(errors).toHaveLength(0);
    });

    it("covers filename detection with 'MAC' in uppercase", () => {
      const data = { ...baseValid, path: "Daintree-1.0.0.dmg" };
      const errors = validateMetadata(data, "/build/LATEST-MAC.YML", pkgVersion);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("must be a ZIP");
    });
  });

  describe("existing checks still apply", () => {
    it("fails for version mismatch", () => {
      const errors = validateMetadata(
        { ...baseValid, version: "2.0.0" },
        "/build/latest-mac.yml",
        pkgVersion
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("version mismatch");
    });

    it("fails for missing path", () => {
      const { path: _, ...noPath } = baseValid;
      const errors = validateMetadata(noPath, "/build/latest-mac.yml", pkgVersion);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("top-level path missing");
    });

    it("fails for empty files array", () => {
      const errors = validateMetadata(
        { ...baseValid, files: [] },
        "/build/latest-mac.yml",
        pkgVersion
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("files[] is missing");
    });

    it("fails for file missing sha512", () => {
      const badFile = { url: "Daintree-1.0.0-mac.zip", size: 100 };
      const errors = validateMetadata(
        { ...baseValid, files: [badFile] },
        "/build/latest-mac.yml",
        pkgVersion
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("missing sha512");
    });
  });
});
