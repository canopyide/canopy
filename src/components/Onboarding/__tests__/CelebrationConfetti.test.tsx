// @vitest-environment jsdom
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("framer-motion", () => {
  const MotionDiv = React.forwardRef(
    (props: Record<string, unknown>, ref: React.Ref<HTMLDivElement>) => {
      const {
        initial: _initial,
        animate: _animate,
        exit: _exit,
        transition: _transition,
        ...rest
      } = props;
      return <div ref={ref} {...rest} />;
    }
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    domAnimation: {},
    domMax: {},
    m: { div: MotionDiv },
    motion: { div: MotionDiv },
  };
});

import { CelebrationConfetti } from "../CelebrationConfetti";

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

function mountChecklistAnchor(rect: Partial<DOMRect> = { left: 1000, top: 800, width: 280, height: 120 }) {
  const div = document.createElement("div");
  div.setAttribute("data-getting-started-checklist", "");
  Object.defineProperty(div, "getBoundingClientRect", {
    value: () => ({
      left: rect.left ?? 0,
      top: rect.top ?? 0,
      width: rect.width ?? 0,
      height: rect.height ?? 0,
      right: (rect.left ?? 0) + (rect.width ?? 0),
      bottom: (rect.top ?? 0) + (rect.height ?? 0),
      x: rect.left ?? 0,
      y: rect.top ?? 0,
      toJSON: () => ({}),
    }),
  });
  document.body.appendChild(div);
  return div;
}

describe("CelebrationConfetti", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    document.body.removeAttribute("data-reduce-animations");
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    document.body.removeAttribute("data-reduce-animations");
    vi.unstubAllGlobals();
  });

  it("renders particles when reduced motion is not active", () => {
    mountChecklistAnchor();
    render(<CelebrationConfetti />);
    const particles = document.body.querySelectorAll("[class*='rounded-full']");
    expect(particles.length).toBeGreaterThanOrEqual(6);
    expect(particles.length).toBeLessThanOrEqual(8);
  });

  it("renders a flash overlay when prefers-reduced-motion is active (no particles)", () => {
    stubMatchMedia(true);

    render(<CelebrationConfetti />);
    const particles = document.body.querySelectorAll("[class*='rounded-full']");
    expect(particles.length).toBe(0);

    const flash = document.body.querySelector(".animate-checklist-complete-flash");
    expect(flash).not.toBeNull();
  });

  it("renders a flash overlay when body[data-reduce-animations='true'] is set", () => {
    document.body.setAttribute("data-reduce-animations", "true");

    render(<CelebrationConfetti />);
    const particles = document.body.querySelectorAll("[class*='rounded-full']");
    expect(particles.length).toBe(0);

    const flash = document.body.querySelector(".animate-checklist-complete-flash");
    expect(flash).not.toBeNull();
  });

  it("renders with pointer-events-none container", () => {
    mountChecklistAnchor();
    render(<CelebrationConfetti />);
    const overlay = document.body.querySelector(".pointer-events-none");
    expect(overlay).not.toBeNull();
  });

  it("anchors particles to the checklist's bounding rect when present", () => {
    mountChecklistAnchor({ left: 1000, top: 800, width: 280, height: 120 });

    render(<CelebrationConfetti />);

    // Origin element is the only fixed-positioned non-anchor element in the portal
    const origin = Array.from(
      document.body.querySelectorAll<HTMLElement>(".fixed.pointer-events-none")
    ).find((el) => !el.hasAttribute("data-getting-started-checklist"));
    expect(origin).toBeDefined();
    // 1000 + 280/2 = 1140, 800 + 120/2 = 860
    expect(origin?.style.left).toBe("1140px");
    expect(origin?.style.top).toBe("860px");
  });

  it("falls back to viewport center when checklist anchor is absent", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });

    render(<CelebrationConfetti />);

    const origin = document.body.querySelector<HTMLElement>(".fixed.pointer-events-none");
    expect(origin).not.toBeNull();
    expect(origin?.style.left).toBe("800px");
    expect(origin?.style.top).toBe("450px");
  });

  it("uses theme CSS custom properties for particle colors", () => {
    mountChecklistAnchor();
    const themeColors: Record<string, string> = {
      "--theme-accent-primary": "#ff0000",
      "--theme-status-success": "#00ff00",
      "--theme-status-warning": "#ffff00",
      "--theme-status-info": "#0000ff",
      "--theme-activity-active": "#ff00ff",
      "--theme-activity-working": "#00ffff",
    };
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (prop: string) => themeColors[prop] ?? "",
    } as CSSStyleDeclaration);

    render(<CelebrationConfetti />);
    const particles = document.body.querySelectorAll(".rounded-full");
    const colors = Array.from(particles).map((el) => (el as HTMLElement).style.backgroundColor);
    expect(colors.length).toBeGreaterThanOrEqual(6);
    expect(colors.every((c) => c !== "")).toBe(true);
    // Verify no Tailwind bg-* classes remain
    const hasOldClass = Array.from(particles).some((el) => /bg-\w+-\d+/.test(el.className));
    expect(hasOldClass).toBe(false);
  });

  it("falls back to hardcoded colors when CSS variables are empty", () => {
    mountChecklistAnchor();
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "",
    } as unknown as CSSStyleDeclaration);

    render(<CelebrationConfetti />);
    const particles = document.body.querySelectorAll(".rounded-full");
    const colors = Array.from(particles).map((el) => (el as HTMLElement).style.backgroundColor);
    expect(colors.length).toBeGreaterThanOrEqual(6);
    expect(colors.every((c) => c !== "")).toBe(true);
  });
});
