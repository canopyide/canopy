// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { APP_THEME_TOKEN_KEYS, type AppColorScheme } from "@shared/theme";
import { applyAppThemeToRoot, applyColorVisionMode } from "../applyAppTheme";

function createTestScheme(
  id: string,
  type: "dark" | "light",
  extensions: Record<string, string> = {}
): AppColorScheme {
  const tokens = Object.fromEntries(
    APP_THEME_TOKEN_KEYS.map((key) => [key, "#101010"])
  ) as AppColorScheme["tokens"];
  tokens.tint = type === "dark" ? "#ffffff" : "#000000";

  return {
    id,
    name: id,
    type,
    builtin: false,
    tokens,
    extensions,
  };
}

describe("applyAppThemeToRoot", () => {
  it("applies derived root metadata for dark themes", () => {
    const root = document.createElement("div");

    applyAppThemeToRoot(
      root,
      createTestScheme("test-dark", "dark", {
        "toolbar-project-bg": "linear-gradient(#111111, #222222)",
      })
    );

    expect(root.style.getPropertyValue("--theme-tint")).toBe("#ffffff");
    expect(root.style.getPropertyValue("--toolbar-project-bg")).toBe(
      "linear-gradient(#111111, #222222)"
    );
    expect(root.dataset.theme).toBe("test-dark");
    expect(root.dataset.colorMode).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("applies derived root metadata for light themes", () => {
    const root = document.createElement("div");

    applyAppThemeToRoot(root, createTestScheme("test-light", "light"));

    expect(root.style.getPropertyValue("--theme-tint")).toBe("#000000");
    expect(root.dataset.theme).toBe("test-light");
    expect(root.dataset.colorMode).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });

  it("removes stale component extension vars between themes", () => {
    const root = document.createElement("div");

    applyAppThemeToRoot(
      root,
      createTestScheme("with-extension", "dark", { "custom-foo": "#123456" })
    );
    expect(root.style.getPropertyValue("--custom-foo")).toBe("#123456");

    applyAppThemeToRoot(root, createTestScheme("without-extension", "light"));

    expect(root.style.getPropertyValue("--custom-foo")).toBe("");
  });
});

import { WORKTREE_COLOR_PALETTE } from "@shared/theme/worktreeColors";

const CATEGORY_TOKENS = WORKTREE_COLOR_PALETTE.map((token) => `--theme-category-${token}`);

describe("applyColorVisionMode", () => {
  it("overrides all 8 category tokens in red-green mode", () => {
    const root = document.createElement("div");
    applyColorVisionMode(root, "red-green");

    expect(root.style.getPropertyValue("--theme-category-blue")).toBe("#0072b2");
    expect(root.style.getPropertyValue("--theme-category-orange")).toBe("#e69f00");
    expect(root.style.getPropertyValue("--theme-category-teal")).toBe("#009e73");
    expect(root.style.getPropertyValue("--theme-category-pink")).toBe("#cc79a7");
    expect(root.style.getPropertyValue("--theme-category-amber")).toBe("#d55e00");
    expect(root.style.getPropertyValue("--theme-category-violet")).toBe("#785ef0");
    expect(root.style.getPropertyValue("--theme-category-indigo")).toBe("#648fff");
    expect(root.style.getPropertyValue("--theme-category-cyan")).toBe("#56b4e9");
    expect(root.dataset.colorblind).toBe("red-green");
  });

  it("preserves existing non-category overrides in red-green mode", () => {
    const root = document.createElement("div");
    applyColorVisionMode(root, "red-green");

    expect(root.style.getPropertyValue("--theme-status-success")).toBe("#009e73");
    expect(root.style.getPropertyValue("--theme-status-danger")).toBe("#fe6100");
  });

  it("overrides all 8 category tokens in blue-yellow mode", () => {
    const root = document.createElement("div");
    applyColorVisionMode(root, "blue-yellow");

    expect(root.style.getPropertyValue("--theme-category-blue")).toBe("#dc267f");
    expect(root.style.getPropertyValue("--theme-category-orange")).toBe("#fe6100");
    expect(root.style.getPropertyValue("--theme-category-teal")).toBe("#009e73");
    expect(root.style.getPropertyValue("--theme-category-pink")).toBe("#d55e00");
    expect(root.style.getPropertyValue("--theme-category-amber")).toBe("#ffb000");
    expect(root.style.getPropertyValue("--theme-category-violet")).toBe("#785ef0");
    expect(root.style.getPropertyValue("--theme-category-indigo")).toBe("#648fff");
    expect(root.style.getPropertyValue("--theme-category-cyan")).toBe("#228833");
    expect(root.dataset.colorblind).toBe("blue-yellow");
  });

  it("preserves existing non-category overrides in blue-yellow mode", () => {
    const root = document.createElement("div");
    applyColorVisionMode(root, "blue-yellow");

    expect(root.style.getPropertyValue("--theme-status-warning")).toBe("#94a3b8");
    expect(root.style.getPropertyValue("--theme-activity-waiting")).toBe("#94a3b8");
  });

  it("switches from red-green to blue-yellow mode", () => {
    const root = document.createElement("div");
    applyColorVisionMode(root, "red-green");
    applyColorVisionMode(root, "blue-yellow");

    // Red-green-exclusive tokens should be cleared
    expect(root.style.getPropertyValue("--theme-category-blue")).toBe("#dc267f");
    expect(root.style.getPropertyValue("--theme-category-orange")).toBe("#fe6100");
    expect(root.style.getPropertyValue("--theme-category-pink")).toBe("#d55e00");
    expect(root.style.getPropertyValue("--theme-category-cyan")).toBe("#228833");
    expect(root.dataset.colorblind).toBe("blue-yellow");
  });

  it("clears all overrides on default mode", () => {
    const root = document.createElement("div");
    applyColorVisionMode(root, "red-green");
    applyColorVisionMode(root, "default");

    for (const token of CATEGORY_TOKENS) {
      expect(root.style.getPropertyValue(token)).toBe("");
    }
    expect(root.style.getPropertyValue("--theme-status-success")).toBe("");
    expect(root.dataset.colorblind).toBeUndefined();
  });

  it("is idempotent in red-green mode", () => {
    const root = document.createElement("div");
    applyColorVisionMode(root, "red-green");
    applyColorVisionMode(root, "red-green");

    expect(root.style.getPropertyValue("--theme-category-blue")).toBe("#0072b2");
    expect(root.style.getPropertyValue("--theme-category-teal")).toBe("#009e73");
    expect(root.dataset.colorblind).toBe("red-green");
  });

  it("is idempotent in blue-yellow mode", () => {
    const root = document.createElement("div");
    applyColorVisionMode(root, "blue-yellow");
    applyColorVisionMode(root, "blue-yellow");

    expect(root.style.getPropertyValue("--theme-category-blue")).toBe("#dc267f");
    expect(root.style.getPropertyValue("--theme-category-teal")).toBe("#009e73");
    expect(root.dataset.colorblind).toBe("blue-yellow");
  });
});
