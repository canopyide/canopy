// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Kbd, KbdChord } from "../Kbd";

vi.mock("@/lib/platform", () => ({
  isMac: vi.fn(() => false),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

describe("Kbd", () => {
  it("renders children inside a kbd element", () => {
    const { container } = render(<Kbd>Esc</Kbd>);
    const kbd = container.querySelector("kbd");
    expect(kbd).toBeTruthy();
    expect(kbd?.textContent).toBe("Esc");
  });
});

describe("KbdChord", () => {
  it("outer wrapper is a kbd element (not span) for canonical multi-key markup", () => {
    const { container } = render(<KbdChord shortcut="Cmd+S" />);
    const root = container.firstElementChild;
    expect(root?.tagName.toLowerCase()).toBe("kbd");
  });

  it("inner per-key kbd elements have aria-hidden to prevent AT double-announcement", () => {
    const { container } = render(<KbdChord shortcut="Cmd+S" />);
    const innerKbds = container.querySelectorAll("kbd kbd");
    expect(innerKbds.length).toBeGreaterThan(0);
    innerKbds.forEach((kbd) => {
      expect(kbd.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("propagates aria-label to the outer kbd", () => {
    const { container } = render(<KbdChord shortcut="Cmd+S" aria-label="Save file" />);
    const root = container.firstElementChild;
    expect(root?.getAttribute("aria-label")).toBe("Save file");
  });

  it("falls back to shortcut string when aria-label is not provided", () => {
    const { container } = render(<KbdChord shortcut="Cmd+S" />);
    const root = container.firstElementChild;
    expect(root?.getAttribute("aria-label")).toBe("Cmd+S");
  });

  it("renders chord with multiple steps", () => {
    const { container } = render(<KbdChord shortcut="Cmd+K Cmd+S" />);
    const innerKbds = container.querySelectorAll("kbd kbd");
    expect(innerKbds.length).toBeGreaterThanOrEqual(4);
  });
});
