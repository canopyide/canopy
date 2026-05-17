import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";

const TOOLBAR_PATH = path.resolve(__dirname, "../Toolbar.tsx");

describe("Toolbar keyboard navigation — issue #2814", () => {
  let source: string;

  beforeEach(async () => {
    source = await fs.readFile(TOOLBAR_PATH, "utf-8");
  });

  describe("Roving tabindex infrastructure", () => {
    it("uses useLayoutEffect for tab-stop sync", () => {
      expect(source).toContain("useLayoutEffect");
    });

    it("queries toolbar items via data-toolbar-item selector", () => {
      expect(source).toContain("[data-toolbar-item]:not([disabled])");
    });

    it("tracks active index with a ref (not state) to avoid re-renders", () => {
      expect(source).toMatch(/activeToolbarIndexRef\s*=\s*useRef/);
    });

    it("stores toolbar element in a ref", () => {
      expect(source).toMatch(/toolbarRef\s*=\s*useRef/);
    });
  });

  describe("Arrow key handler", () => {
    it("handles ArrowRight navigation", () => {
      expect(source).toContain('"ArrowRight"');
    });

    it("handles ArrowLeft navigation", () => {
      expect(source).toContain('"ArrowLeft"');
    });

    it("handles Home key", () => {
      expect(source).toContain('"Home"');
    });

    it("handles End key", () => {
      expect(source).toContain('"End"');
    });

    it("wraps around on ArrowRight", () => {
      expect(source).toMatch(/\(currentIdx \+ 1\) % items\.length/);
    });

    it("wraps around on ArrowLeft", () => {
      expect(source).toMatch(/\(currentIdx - 1 \+ items\.length\) % items\.length/);
    });

    it("calls preventDefault only for handled keys", () => {
      // preventDefault should be inside the if (newIdx !== null) block
      expect(source).toMatch(/if\s*\(newIdx !== null\)\s*\{[\s\S]*?e\.preventDefault/);
    });
  });

  describe("Modifier key guard", () => {
    it("guards against metaKey", () => {
      expect(source).toMatch(/e\.metaKey/);
    });

    it("guards against altKey", () => {
      expect(source).toMatch(/e\.altKey/);
    });

    it("guards against ctrlKey", () => {
      expect(source).toMatch(/e\.ctrlKey/);
    });

    it("returns early when modifier keys are pressed", () => {
      expect(source).toMatch(/if\s*\(e\.metaKey \|\| e\.altKey \|\| e\.ctrlKey\)\s*return/);
    });
  });

  describe("Focus tracking", () => {
    it("uses onFocusCapture for focus tracking", () => {
      expect(source).toContain("handleToolbarFocusCapture");
    });

    it("syncs tab stops when focus changes", () => {
      expect(source).toContain("syncToolbarTabStops");
    });
  });

  describe("Sub-component integration", () => {
    it("passes data-toolbar-item to AgentButton components", () => {
      // After the dynamic registry refactor (issue #5070), AgentButton is
      // rendered once inside a BUILT_IN_AGENT_IDS.map(...), so a single
      // <AgentButton ... data-toolbar-item="" /> site is expected.
      const agentButtonMatches = source.match(/<AgentButton[\s\S]*?data-toolbar-item=""/g);
      expect(agentButtonMatches).not.toBeNull();
      expect(agentButtonMatches!.length).toBeGreaterThanOrEqual(1);
      // And that single site must be inside a map over BUILT_IN_AGENT_IDS
      expect(source).toMatch(
        /BUILT_IN_AGENT_IDS\.map[\s\S]*?<AgentButton[\s\S]*?data-toolbar-item=""/
      );
    });

    it("passes data-toolbar-item to AgentTrayButton", () => {
      expect(source).toMatch(/<AgentTrayButton[\s\S]*?data-toolbar-item=""/);
    });

    it("passes data-toolbar-item to VoiceRecordingToolbarButton", () => {
      expect(source).toMatch(/<VoiceRecordingToolbarButton[\s\S]*?data-toolbar-item=""/);
    });

    it("project switcher trigger has data-toolbar-item", () => {
      expect(source).toMatch(/data-toolbar-item=""[\s\S]*?data-testid="project-switcher-trigger"/);
    });
  });
});

describe("Toolbar keyboard navigation — issue #8163", () => {
  let source: string;

  beforeEach(async () => {
    source = await fs.readFile(TOOLBAR_PATH, "utf-8");
  });

  describe("Portal event guard (Bug 2)", () => {
    it("guards handleToolbarKeyDown against keys originating outside the toolbar DOM subtree", () => {
      // React synthetic events bubble through the React tree, so keydowns
      // inside Radix portal content (DropdownMenuContent, ContextMenuContent
      // — rendered in document.body) still reach this handler. The DOM
      // containment check excludes them so Arrow keys inside an open menu
      // navigate the menu instead of being stolen by toolbar roving focus.
      expect(source).toMatch(
        /if\s*\(!toolbarRef\.current\?\.contains\(e\.target as Node\)\)\s*return/
      );
    });

    it("places the containment guard before the modifier guard", () => {
      const containsIdx = source.search(/toolbarRef\.current\?\.contains\(e\.target as Node\)/);
      const modifierIdx = source.search(/if\s*\(e\.metaKey \|\| e\.altKey \|\| e\.ctrlKey\)/);
      expect(containsIdx).toBeGreaterThan(-1);
      expect(modifierIdx).toBeGreaterThan(-1);
      expect(containsIdx).toBeLessThan(modifierIdx);
    });

    it("places the containment guard before getToolbarItems is called", () => {
      // Bailing before getToolbarItems avoids wasted DOM queries on every
      // portal-originated keydown. Scope to handleToolbarKeyDown's body so
      // the assertion isn't fooled by the earlier getToolbarItems call in
      // handleToolbarFocusCapture.
      const handlerMatch = source.match(
        /handleToolbarKeyDown\s*=\s*useCallback\([\s\S]*?\n\s{2}\);/
      );
      expect(handlerMatch).not.toBeNull();
      const body = handlerMatch![0];
      const containsIdx = body.search(/toolbarRef\.current\?\.contains\(e\.target as Node\)/);
      const itemsIdx = body.search(/const items = getToolbarItems\(\)/);
      expect(containsIdx).toBeGreaterThan(-1);
      expect(itemsIdx).toBeGreaterThan(-1);
      expect(containsIdx).toBeLessThan(itemsIdx);
    });
  });

  describe("Overflow focus redirect (Bug 1)", () => {
    it("tracks the previously-focused toolbar item with a ref", () => {
      expect(source).toMatch(/prevFocusedToolbarItemRef\s*=\s*useRef/);
    });

    it("updates prevFocusedToolbarItemRef inside the focus-capture handler", () => {
      // The ref must be set inside handleToolbarFocusCapture so the layout
      // effect can detect when that item is later evicted.
      expect(source).toMatch(
        /handleToolbarFocusCapture[\s\S]*?prevFocusedToolbarItemRef\.current\s*=\s*target/
      );
    });

    it("marks the overflow trigger Button with data-toolbar-overflow-trigger", () => {
      // A dedicated marker is required because [data-toolbar-item][aria-haspopup='menu']
      // also matches AgentButton and AgentTrayButton (which appear earlier in
      // document order), so the overflow trigger cannot be located by that
      // selector alone.
      expect(source).toContain('data-toolbar-overflow-trigger=""');
    });

    it("does not locate the overflow trigger via aria-haspopup selector", () => {
      // Regression guard against the AgentButton/AgentTrayButton false-positive.
      expect(source).not.toMatch(
        /querySelector[^)]*\[data-toolbar-item\]\[aria-haspopup=['"]menu['"]\]/
      );
    });

    it("uses [data-toolbar-overflow-trigger] selector to locate the redirect target", () => {
      expect(source).toMatch(
        /querySelector[^)]*\[data-toolbar-overflow-trigger\]/
      );
    });

    it("redirects focus only when the previously-focused item is no longer in items", () => {
      expect(source).toMatch(/!items\.includes\(prevFocused\)/);
    });

    it("guards focus redirect on document.activeElement === document.body", () => {
      // Without this guard the redirect could fire spuriously when focus
      // is intentionally elsewhere (e.g. user clicked an unrelated control
      // between the focus-capture and the next render).
      expect(source).toMatch(/document\.activeElement\s*===\s*document\.body/);
    });

    it("calls .focus() on the redirect target inside the layout effect", () => {
      // The layout-effect block must contain a focus() call gated by the
      // three conditions above.
      expect(source).toMatch(
        /useLayoutEffect\([\s\S]*?prevFocused[\s\S]*?\.focus\(\)[\s\S]*?\}\)/
      );
    });

    it("clears prevFocusedToolbarItemRef after redirecting", () => {
      // Resetting the ref after the redirect makes the effect idempotent
      // across repeated re-renders, so .focus() does not fire on every
      // subsequent render.
      expect(source).toMatch(/prevFocusedToolbarItemRef\.current\s*=\s*null/);
    });

    it("falls back to items[clamped] when the overflow trigger is not present", () => {
      // When neither group renders an overflow menu (everything fits),
      // the redirect should land on the clamped item rather than no-op.
      expect(source).toMatch(/items\[clamped\]/);
    });
  });
});
