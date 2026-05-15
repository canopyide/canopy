import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";

const TOOLBAR_PATH = path.resolve(__dirname, "../Toolbar.tsx");
const TOOLBAR_CSS_PATH = path.resolve(__dirname, "../../../styles/components/toolbar.css");

describe("Toolbar responsive design — issue #4133", () => {
  let source: string;
  let css: string;

  beforeEach(async () => {
    [source, css] = await Promise.all([
      fs.readFile(TOOLBAR_PATH, "utf-8"),
      fs.readFile(TOOLBAR_CSS_PATH, "utf-8"),
    ]);
  });

  describe("overflow hook integration", () => {
    it("imports useToolbarOverflow hook", () => {
      expect(source).toContain("useToolbarOverflow");
    });

    it("renders data-toolbar-button-id measurement wrappers", () => {
      expect(source).toContain("data-toolbar-button-id={");
    });

    it("has left and right group refs for overflow measurement", () => {
      expect(source).toContain("leftGroupRef");
      expect(source).toContain("rightGroupRef");
    });

    it("renders overflow menu with Ellipsis icon", () => {
      expect(source).toContain("Ellipsis");
      expect(source).toContain("renderOverflowMenu");
    });

    it("uses DropdownMenu for overflow menus", () => {
      expect(source).toContain("DropdownMenu");
      expect(source).toContain("DropdownMenuContent");
      expect(source).toContain("DropdownMenuItem");
    });
  });

  describe("branch chip responsive collapse", () => {
    it("branch chip has GitBranch icon", () => {
      expect(source).toContain("GitBranch");
      expect(source).toContain("toolbar-project-chip-icon");
    });

    it("branch chip text has label class for CSS targeting", () => {
      expect(source).toContain("toolbar-project-chip-label");
    });

    it("CSS has container query to hide branch label at narrow widths", () => {
      expect(css).toContain("@container toolbar");
      expect(css).toContain("toolbar-project-chip-label");
      expect(css).toContain("display: none");
    });
  });

  describe("container query setup", () => {
    it("toolbar root has @container/toolbar class", () => {
      expect(source).toContain("@container/toolbar");
    });
  });

  describe("overflow state management", () => {
    it("closes dropdowns when items overflow", () => {
      expect(source).toMatch(/overflowSet\.has\("github-stats"\)/);
      expect(source).toMatch(/overflowSet\.has\("notification-center"\)/);
    });

    it("has overflow action handlers for menu items", () => {
      expect(source).toContain("overflowActions");
    });
  });

  describe("overflow trigger surfaces hidden state — issue #6416", () => {
    it("calls useOverflowBadgeSeverity for both left and right overflow", () => {
      expect(source).toContain("useOverflowBadgeSeverity(leftOverflow");
      expect(source).toContain("useOverflowBadgeSeverity(rightOverflow");
    });

    it("passes left and right severities into renderOverflowMenu independently", () => {
      expect(source).toContain("leftOverflowSeverity");
      expect(source).toContain("rightOverflowSeverity");
    });

    it("maps severity to a CSS custom property via data-severity selectors", () => {
      // data-severity attribute is on the JSX element in Toolbar.tsx
      expect(source).toContain("data-severity={severity}");
      // The CSS custom property and severity mappings live in toolbar.css
      expect(css).toContain("--overflow-badge-color");
      expect(css).toContain('data-severity="critical"');
      expect(css).toContain('data-severity="warning"');
      expect(css).toContain('data-severity="info"');
      expect(css).toContain("var(--color-status-error)");
      expect(css).toContain("var(--color-state-waiting)");
    });

    it("renders a dot inside the overflow Button when severity is set", () => {
      expect(source).toContain("toolbar-overflow-badge");
      expect(source).toMatch(/data-severity=\{severity\}/);
    });

    it("builds a dynamic tooltip listing the hidden buttons", () => {
      expect(source).toContain("itemLabels");
      expect(source).toMatch(/\$\{overflowIds\.length\} more — /);
    });

    it("supplies a fallback label for voice-recording so the count and named list stay aligned", () => {
      // voice-recording is absent from OVERFLOW_MENU_META on purpose — it
      // has no dropdown rendering — so the tooltip must look it up
      // separately or the spoken count would exceed the list.
      expect(source).toContain('id === "voice-recording"');
      expect(source).toContain('"Voice recording"');
    });
  });

  describe("toolbar button visual states — issue #7973", () => {
    it("focus-visible relies on outline alone — no hover background paint", () => {
      // Block-scan the :focus-visible rule(s) to assert no `background:`
      // declaration leaks back in (which would make keyboard focus
      // indistinguishable from mouse hover apart from the ring).
      const focusBlock = css.match(/\.toolbar-icon-button:focus-visible[\s\S]*?\{[\s\S]*?\}/)?.[0];
      expect(focusBlock).toBeDefined();
      expect(focusBlock).toContain("outline: 2px solid var(--theme-accent-primary)");
      expect(focusBlock).not.toMatch(/\bbackground\b\s*:/);
    });

    it("armed selectors carry an inset shadow on top of the emphasis background", () => {
      // The armed selector block must include both background AND box-shadow
      // so the state reads as anchored/pressed, not "still hovering".
      const armedBlock = css.match(
        /\.toolbar-icon-button\[aria-pressed="true"\][\s\S]*?\{[\s\S]*?\}/
      )?.[0];
      expect(armedBlock).toBeDefined();
      expect(armedBlock).toContain("--toolbar-control-armed-bg");
      expect(armedBlock).toContain("--toolbar-control-armed-shadow");
      expect(armedBlock).toMatch(/inset\s+0\s+1px\s+2px/);
    });

    it("press transform is owned by base Button cva, not the toolbar transition list", () => {
      // The .toolbar-icon-button transition list must NOT include `transform` —
      // adding it would slow the cva's 1ms press-snap to 150ms.
      const baseBlock = css.match(
        /\.toolbar-icon-button,\s*\n\s*\.toolbar-agent-button\s*\{[\s\S]*?\}/
      )?.[0];
      expect(baseBlock).toBeDefined();
      expect(baseBlock).toMatch(/transition:[\s\S]*?;/);
      const transitionMatch = baseBlock!.match(/transition:[\s\S]*?;/)![0];
      expect(transitionMatch).not.toContain("transform");

      // The :active rule contributes background only; transform belongs to the cva.
      const activeBlock = css.match(
        /\.toolbar-icon-button:active,\s*\n\s*\.toolbar-agent-button:active\s*\{[\s\S]*?\}/
      )?.[0];
      expect(activeBlock).toBeDefined();
      expect(activeBlock).not.toMatch(/transform\s*:\s*scale/);
    });

    it("overflow severity dot uses a non-color shape differentiator per tier — WCAG 1.4.1", () => {
      // Tier 1 evidence: each severity owns its own border-radius in CSS, so
      // critical/warning/info are distinguishable without relying on color.
      expect(css).toMatch(
        /\.toolbar-overflow-badge\[data-severity="critical"\][\s\S]*?border-radius:\s*0;/
      );
      expect(css).toMatch(
        /\.toolbar-overflow-badge\[data-severity="warning"\][\s\S]*?border-radius:\s*2px;/
      );
      expect(css).toMatch(
        /\.toolbar-overflow-badge\[data-severity="info"\][\s\S]*?border-radius:\s*9999px;/
      );

      // Tier 2 evidence: the JSX className must NOT carry `rounded-full` or a
      // round `ring-*` utility — CSS data-attribute selectors own shape/ring so
      // they always agree (a round ring on a square dot would look like a bug).
      const badgeMatch = source.match(
        /<span[\s\S]*?data-testid="toolbar-overflow-badge"[\s\S]*?\/>/
      );
      expect(badgeMatch).toBeDefined();
      expect(badgeMatch![0]).not.toContain("rounded-full");
      expect(badgeMatch![0]).not.toMatch(/\bring-\d/);
    });
  });

  describe("overflow menu focus ring after pointer dismissal — issue #6119", () => {
    it("declares the overflowMenuPointerCloseRef", () => {
      expect(source).toContain("overflowMenuPointerCloseRef");
      expect(source).toMatch(/overflowMenuPointerCloseRef\s*=\s*useRef\(false\)/);
    });

    it("sets the ref in onPointerDownOutside on the overflow DropdownMenuContent", () => {
      expect(source).toMatch(
        /onPointerDownOutside={\(\)\s*=>\s*{\s*overflowMenuPointerCloseRef\.current\s*=\s*true;?\s*}}/
      );
    });

    it("conditionally preventDefault and resets the ref in onCloseAutoFocus", () => {
      // Guards the reset line: deleting it would inherit suppression into a
      // later keyboard close and break WAI-ARIA focus return.
      expect(source).toContain("overflowMenuPointerCloseRef.current = false");
      expect(source).toMatch(
        /if\s*\(overflowMenuPointerCloseRef\.current\)\s*{\s*e\.preventDefault\(\);/
      );
    });
  });
});
