import { describe, it, expect } from "vitest";
import {
  isBuiltInPanelKind,
  isBrowserPanel,
  isDevPreviewPanel,
  isPtyPanel,
  type PanelInstance,
  type TerminalInstance,
} from "../panel.js";
import { BUILT_IN_PANEL_KINDS } from "../../config/panelKindRegistry.js";

describe("isBuiltInPanelKind", () => {
  it("returns true for every entry in BUILT_IN_PANEL_KINDS", () => {
    for (const kind of BUILT_IN_PANEL_KINDS) {
      expect(isBuiltInPanelKind(kind)).toBe(true);
    }
  });

  it("returns false for unknown kinds and extension kinds", () => {
    expect(isBuiltInPanelKind("agent")).toBe(false);
    expect(isBuiltInPanelKind("ext-plugin.viewer")).toBe(false);
    expect(isBuiltInPanelKind("")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isBuiltInPanelKind("Terminal")).toBe(false);
    expect(isBuiltInPanelKind("DEV-PREVIEW")).toBe(false);
  });
});

describe("panel variant guards", () => {
  const ptyPanel = { id: "p1", kind: "terminal", title: "t", location: "grid" } as PanelInstance;
  const browserPanel = { id: "p2", kind: "browser", title: "t", location: "grid" } as PanelInstance;
  const devPreviewPanel = {
    id: "p3",
    kind: "dev-preview",
    title: "t",
    location: "grid",
  } as PanelInstance;

  it("isPtyPanel matches only terminal", () => {
    expect(isPtyPanel(ptyPanel)).toBe(true);
    expect(isPtyPanel(browserPanel)).toBe(false);
    expect(isPtyPanel(devPreviewPanel)).toBe(false);
  });

  it("isBrowserPanel matches only browser", () => {
    expect(isBrowserPanel(ptyPanel)).toBe(false);
    expect(isBrowserPanel(browserPanel)).toBe(true);
    expect(isBrowserPanel(devPreviewPanel)).toBe(false);
  });

  it("isDevPreviewPanel matches only dev-preview", () => {
    expect(isDevPreviewPanel(ptyPanel)).toBe(false);
    expect(isDevPreviewPanel(browserPanel)).toBe(false);
    expect(isDevPreviewPanel(devPreviewPanel)).toBe(true);
  });

  it("legacy TerminalInstance with absent kind defaults to terminal", () => {
    const legacy: TerminalInstance = {
      id: "legacy",
      title: "old",
      location: "grid",
    };
    expect(isPtyPanel(legacy)).toBe(true);
    expect(isBrowserPanel(legacy)).toBe(false);
    expect(isDevPreviewPanel(legacy)).toBe(false);
  });
});
