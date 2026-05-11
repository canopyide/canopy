import { describe, it, expect } from "vitest";
import type { File } from "gitdiff-parser";
import {
  getFilePath,
  isGeneratedDiffPath,
  estimateFileDiffBytes,
  shouldCollapseByDefault,
  DIFF_SOFT_COLLAPSE_BYTES,
} from "../diffCollapseUtils";

function makeFile(overrides: Partial<File> = {}): File {
  return {
    hunks: [],
    oldEndingNewLine: true,
    newEndingNewLine: true,
    oldMode: "100644",
    newMode: "100644",
    oldRevision: "abc123",
    newRevision: "def456",
    oldPath: "",
    newPath: "",
    type: "modify",
    ...overrides,
  };
}

describe("getFilePath", () => {
  it("returns newPath when set", () => {
    expect(getFilePath(makeFile({ newPath: "src/foo.ts" }))).toBe("src/foo.ts");
  });

  it("falls back to oldPath", () => {
    expect(getFilePath(makeFile({ oldPath: "src/bar.ts", newPath: "/dev/null" }))).toBe(
      "src/bar.ts"
    );
  });

  it("filters /dev/null", () => {
    expect(getFilePath(makeFile({ newPath: "/dev/null" }))).toBe("");
  });

  it("returns empty string when both paths are /dev/null", () => {
    expect(getFilePath(makeFile({ oldPath: "/dev/null", newPath: "/dev/null" }))).toBe("");
  });
});

describe("isGeneratedDiffPath", () => {
  it.each([
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "pnpm-lock.yml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
    "Cargo.lock",
    "go.sum",
  ])("detects lockfile: %s", (name) => {
    expect(isGeneratedDiffPath(name)).toBe(true);
  });

  it.each(["subdir/package-lock.json", "deep/nested/path/yarn.lock", "frontend/Cargo.lock"])(
    "detects lockfiles in subdirectories: %s",
    (path) => {
      expect(isGeneratedDiffPath(path)).toBe(true);
    }
  );

  it.each(["bundle.min.js", "app.min.css", "vendor.min.js.map", "theme.min.css.map"])(
    "detects minified: %s",
    (name) => {
      expect(isGeneratedDiffPath(name)).toBe(true);
    }
  );

  it.each(["app.bundle.js", "styles.bundle.css", "shared.chunk.js", "lib.chunk.css"])(
    "detects bundled/chunked: %s",
    (name) => {
      expect(isGeneratedDiffPath(name)).toBe(true);
    }
  );

  it.each(["user.pb.go", "message.pb.cc", "types.pb.h"])(
    "detects protobuf generated: %s",
    (name) => {
      expect(isGeneratedDiffPath(name)).toBe(true);
    }
  );

  it("detects .lockb extension", () => {
    expect(isGeneratedDiffPath("yarn.lockb")).toBe(true);
  });

  it("detects .wasm", () => {
    expect(isGeneratedDiffPath("module.wasm")).toBe(true);
  });

  it("rejects normal source files", () => {
    expect(isGeneratedDiffPath("src/index.ts")).toBe(false);
    expect(isGeneratedDiffPath("components/App.tsx")).toBe(false);
    expect(isGeneratedDiffPath("package.json")).toBe(false);
    expect(isGeneratedDiffPath("README.md")).toBe(false);
  });

  it("handles empty path", () => {
    expect(isGeneratedDiffPath("")).toBe(false);
  });

  it("handles Windows-style separators", () => {
    expect(isGeneratedDiffPath("frontend\\package-lock.json")).toBe(true);
  });
});

describe("estimateFileDiffBytes", () => {
  it("returns 0 for empty hunks", () => {
    expect(estimateFileDiffBytes(makeFile({ hunks: [] }))).toBe(0);
  });

  it("sums hunk header and change content lengths", () => {
    const file = makeFile({
      hunks: [
        {
          content: "@@ -1,3 +1,3 @@\n", // 18 chars
          oldStart: 1,
          newStart: 1,
          oldLines: 3,
          newLines: 3,
          changes: [
            {
              type: "normal" as const,
              content: " line1\n",
              isNormal: true,
              oldLineNumber: 1,
              newLineNumber: 1,
            },
            { type: "insert" as const, content: "+new line\n", isInsert: true, lineNumber: 2 },
            { type: "delete" as const, content: "-old line\n", isDelete: true, lineNumber: 3 },
            {
              type: "normal" as const,
              content: " line3\n",
              isNormal: true,
              oldLineNumber: 3,
              newLineNumber: 3,
            },
          ],
        },
      ],
    });
    expect(estimateFileDiffBytes(file)).toBeGreaterThan(0);
  });

  it("handles undefined hunks", () => {
    expect(estimateFileDiffBytes(makeFile({ hunks: undefined as unknown as File["hunks"] }))).toBe(
      0
    );
  });
});

describe("shouldCollapseByDefault", () => {
  it("collapses generated file by default", () => {
    const file = makeFile({ newPath: "package-lock.json" });
    const result = shouldCollapseByDefault(file);
    expect(result.collapse).toBe(true);
    expect(result.reason).toBe("generated");
  });

  it("collapses large non-generated file", () => {
    let content = "";
    for (let i = 0; i < DIFF_SOFT_COLLAPSE_BYTES + 1; i++) {
      content += "x";
    }
    const file = makeFile({
      newPath: "src/large.ts",
      hunks: [
        {
          content: "hdr\n",
          oldStart: 1,
          newStart: 1,
          oldLines: 1,
          newLines: 1,
          changes: [
            {
              type: "normal" as const,
              content,
              isNormal: true,
              oldLineNumber: 1,
              newLineNumber: 1,
            },
          ],
        },
      ],
    });
    const result = shouldCollapseByDefault(file);
    expect(result.collapse).toBe(true);
    expect(result.reason).toBe("large");
  });

  it("does not collapse small normal file", () => {
    const file = makeFile({
      newPath: "src/small.ts",
      hunks: [
        {
          content: "@@ -1,1 +1,1 @@\n",
          oldStart: 1,
          newStart: 1,
          oldLines: 1,
          newLines: 1,
          changes: [
            {
              type: "normal" as const,
              content: "small\n",
              isNormal: true,
              oldLineNumber: 1,
              newLineNumber: 1,
            },
          ],
        },
      ],
    });
    const result = shouldCollapseByDefault(file);
    expect(result.collapse).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("collapses generated file regardless of size", () => {
    const file = makeFile({
      newPath: "Cargo.lock",
      hunks: [
        {
          content: "@@ -1,1 +1,1 @@\n",
          oldStart: 1,
          newStart: 1,
          oldLines: 1,
          newLines: 1,
          changes: [
            {
              type: "normal" as const,
              content: "tiny\n",
              isNormal: true,
              oldLineNumber: 1,
              newLineNumber: 1,
            },
          ],
        },
      ],
    });
    const result = shouldCollapseByDefault(file);
    expect(result.collapse).toBe(true);
    expect(result.reason).toBe("generated");
  });
});
