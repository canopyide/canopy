import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";

const TOOLBAR_PATH = path.resolve(__dirname, "../Toolbar.tsx");
const TOOLBAR_CSS_PATH = path.resolve(__dirname, "../../../styles/components/toolbar.css");

describe("Toolbar project pill polish — issue #8174", () => {
  let source: string;
  let css: string;

  beforeEach(async () => {
    [source, css] = await Promise.all([
      fs.readFile(TOOLBAR_PATH, "utf-8"),
      fs.readFile(TOOLBAR_CSS_PATH, "utf-8"),
    ]);
  });

  describe("branch chip middle-truncation", () => {
    it("imports middleTruncate utility", () => {
      expect(source).toMatch(/import\s+\{\s*middleTruncate\s*\}\s+from\s+"@\/utils\/textParsing"/);
    });

    it("computes truncatedBranchName with a 24-char budget", () => {
      expect(source).toMatch(/middleTruncate\(branchName,\s*24\)/);
    });

    it("renders the truncated branch in the chip label", () => {
      expect(source).toMatch(
        /<span className="toolbar-project-chip-label">\s*\{truncatedBranchName \?\? "main"\}/
      );
    });
  });

  describe("tooltip recovery", () => {
    it("wraps the pill in Tooltip + TooltipTrigger asChild", () => {
      expect(source).toContain("<TooltipTrigger asChild>");
    });

    it("computes a tooltipLabel that includes project and branch when both present", () => {
      expect(source).toContain("tooltipLabel");
      // The "{name} / {branch}" form is the disclosure path for truncated content.
      expect(source).toContain("`${currentProject.name} / ${branchName}`");
    });

    it("renders tooltipLabel inside TooltipContent below the pill", () => {
      expect(source).toMatch(/<TooltipContent side="bottom">\{tooltipLabel\}<\/TooltipContent>/);
    });
  });

  describe("ARIA combobox semantics", () => {
    it("sets role=combobox on the pill button", () => {
      expect(source).toMatch(/data-testid="project-switcher-trigger"[\s\S]*?role="combobox"/);
    });

    it("sets aria-haspopup=listbox on the pill button", () => {
      expect(source).toContain('aria-haspopup="listbox"');
    });

    it("binds aria-expanded to the dropdown open state", () => {
      expect(source).toContain("aria-expanded={isDropdownOpen}");
    });

    it("keeps aria-label only for the empty state", () => {
      expect(source).toContain('aria-label={currentProject ? undefined : "Open project"}');
    });
  });

  describe("responsive collapse — second tier", () => {
    it("hides the entire .toolbar-project-chip at the narrow tier", () => {
      // Existing 700px tier hides .toolbar-project-chip-label only.
      // New ~560px tier hides the whole chip so the GitBranch icon isn't orphaned.
      expect(css).toMatch(
        /@container toolbar \(max-width:\s*560px\)\s*\{\s*\.toolbar-project-chip\s*\{\s*display:\s*none;/
      );
    });
  });

  describe("right-click context menu", () => {
    it("imports context-menu primitives", () => {
      expect(source).toMatch(/from\s+"@\/components\/ui\/context-menu"/);
    });

    it("wraps the pill in ContextMenu + ContextMenuTrigger asChild", () => {
      expect(source).toContain("<ContextMenu>");
      expect(source).toContain("<ContextMenuTrigger asChild>");
    });

    it("only renders menu content when a project is loaded", () => {
      expect(source).toMatch(/\{currentProject\s*&&\s*\(\s*<ContextMenuContent>/);
    });

    it("offers pin/unpin driven by the SearchableProject pinned flag", () => {
      expect(source).toContain("activeSearchableProject?.isPinned");
      expect(source).toContain("Pin project");
      expect(source).toContain("Unpin project");
    });

    it("offers copy path using navigator.clipboard.writeText", () => {
      expect(source).toContain("navigator.clipboard.writeText");
      expect(source).toContain("Copy path");
    });

    it("gates Stop all agents on processCount > 0", () => {
      expect(source).toMatch(/\(activeSearchableProject\?\.processCount\s*\?\?\s*0\)\s*>\s*0/);
      expect(source).toContain("Stop all agents");
    });

    it("always offers Close project for the active project", () => {
      expect(source).toContain("Close project");
    });

    it("does not offer Open in new window for the active project", () => {
      // The toolbar pill always represents the active project — Open in new
      // window is suppressed for the active row in ProjectSwitcherPalette and
      // should remain suppressed on the pill too.
      const pillSection = source.split("ContextMenuTrigger asChild")[1]?.split("</ContextMenu>")[0];
      expect(pillSection).toBeDefined();
      expect(pillSection).not.toContain("Open in new window");
    });
  });
});
