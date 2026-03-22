import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUILT_IN_THEME_SOURCES } from "../builtInThemes/index.js";
import { APP_THEME_TOKEN_KEYS } from "../types.js";
import {
  BUILT_IN_APP_SCHEMES,
  compileThemePaletteToTokens,
  normalizeAppThemeTokens,
} from "../index.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "../../..");

function collectSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "__tests__") {
        return [];
      }
      return collectSourceFiles(fullPath);
    }

    if (!/\.(ts|tsx|css)$/.test(entry.name)) {
      return [];
    }

    if (/\.(test|spec)\./.test(entry.name)) {
      return [];
    }

    return [fullPath];
  });
}

function pathPatternExists(root: string, relativePath: string): boolean {
  if (!relativePath.includes("*")) {
    return fs.existsSync(path.join(root, relativePath));
  }

  const dirname = path.dirname(relativePath);
  const basename = path.basename(relativePath);
  const escaped = basename.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const pattern = new RegExp(`^${escaped}$`);
  const absoluteDir = path.join(root, dirname);

  if (!fs.existsSync(absoluteDir)) {
    return false;
  }

  return fs.readdirSync(absoluteDir).some((entry) => pattern.test(entry));
}

describe("theme contracts", () => {
  it("builds each built-in scheme from palette output plus explicit token overrides", () => {
    for (const source of BUILT_IN_THEME_SOURCES) {
      const compiled = compileThemePaletteToTokens(source.palette);
      const expectedTokens = source.tokens
        ? normalizeAppThemeTokens(source.tokens, compiled)
        : compiled;
      const scheme = BUILT_IN_APP_SCHEMES.find((item) => item.id === source.id);

      expect(
        scheme?.tokens,
        `${source.id} should resolve from its palette compiler output`
      ).toEqual(expectedTokens);
    }
  });

  it("keeps component extension keys separate from semantic theme tokens", () => {
    const tokenKeys = new Set(APP_THEME_TOKEN_KEYS);

    for (const source of BUILT_IN_THEME_SOURCES) {
      for (const extensionKey of Object.keys(source.extensions ?? {})) {
        expect(
          tokenKeys.has(extensionKey as (typeof APP_THEME_TOKEN_KEYS)[number]),
          `${source.id} extension ${extensionKey} should not overlap APP_THEME_TOKEN_KEYS`
        ).toBe(false);
      }
    }
  });

  it("only ships built-in extension keys that are consumed by renderer styles or components", () => {
    const rendererFiles = collectSourceFiles(path.join(REPO_ROOT, "src"));
    const rendererSources = rendererFiles.map((filePath) => fs.readFileSync(filePath, "utf8"));

    for (const source of BUILT_IN_THEME_SOURCES) {
      for (const extensionKey of Object.keys(source.extensions ?? {})) {
        const needle = `--${extensionKey}`;
        const isConsumed = rendererSources.some((content) => content.includes(needle));

        expect(
          isConsumed,
          `${source.id} extension ${extensionKey} is not consumed anywhere in src/`
        ).toBe(true);
      }
    }
  });

  it("keeps the documented theme-system file map pointed at real files", () => {
    const docsPath = path.join(REPO_ROOT, "docs/themes/theme-system.md");
    const docs = fs.readFileSync(docsPath, "utf8");
    const fileMapSection = docs.split("## File Map")[1] ?? "";
    const documentedPaths = Array.from(
      fileMapSection.matchAll(/`((?:shared|src|electron|docs)\/[^`]+)`/g),
      (match) => match[1]
    );

    expect(documentedPaths.length).toBeGreaterThan(0);

    for (const relativePath of documentedPaths) {
      expect(
        pathPatternExists(REPO_ROOT, relativePath),
        `Documented theme file is missing: ${relativePath}`
      ).toBe(true);
    }
  });
});
