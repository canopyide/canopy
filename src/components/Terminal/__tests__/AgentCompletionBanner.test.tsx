// @vitest-environment jsdom
import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentCompletionBanner } from "../AgentCompletionBanner";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => {
    const out: string[] = [];
    const walk = (v: unknown) => {
      if (!v) return;
      if (typeof v === "string" || typeof v === "number") out.push(String(v));
      else if (Array.isArray(v)) for (const item of v) walk(item);
      else if (typeof v === "object")
        for (const [key, val] of Object.entries(v as Record<string, unknown>))
          if (val) out.push(key);
    };
    for (const a of args) walk(a);
    return out.join(" ");
  },
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("AgentCompletionBanner", () => {
  it("renders artifact-first copy with file count and plural noun", () => {
    render(<AgentCompletionBanner fileCount={3} onReview={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText("3 files changed, review when ready")).toBeTruthy();
  });

  it("uses singular 'file' when exactly one file changed", () => {
    render(<AgentCompletionBanner fileCount={1} onReview={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText("1 file changed, review when ready")).toBeTruthy();
  });

  it("falls back to generic copy when fileCount is omitted or zero", () => {
    const { rerender } = render(<AgentCompletionBanner onReview={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText("Files changed, review when ready")).toBeTruthy();

    rerender(<AgentCompletionBanner fileCount={0} onReview={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText("Files changed, review when ready")).toBeTruthy();
  });

  it("invokes onReview when the Review button is clicked", () => {
    const onReview = vi.fn();
    render(<AgentCompletionBanner onReview={onReview} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /review/i }));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("invokes onDismiss when the dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    render(<AgentCompletionBanner onReview={() => {}} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stops click propagation on both buttons so the pane doesn't grab focus", () => {
    const onParentClick = vi.fn();
    const { container } = render(
      <div onClick={onParentClick}>
        <AgentCompletionBanner onReview={() => {}} onDismiss={() => {}} />
      </div>
    );
    const buttons = container.querySelectorAll("button");
    buttons.forEach((b) => fireEvent.click(b));
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("uses neutral surface tokens (no accent color in container)", () => {
    const { container } = render(
      <AgentCompletionBanner onReview={() => {}} onDismiss={() => {}} />
    );
    const root = container.firstElementChild as HTMLElement;
    const cls = root.getAttribute("class")!;
    expect(cls).toContain("bg-overlay-subtle");
    expect(cls).toContain("border-divider");
    expect(cls).not.toContain("text-accent-primary");
    expect(cls).not.toContain("bg-accent-primary");
  });

  it("uses Tier-1 transition-colors on interactive controls (no transition-all)", () => {
    const { container } = render(
      <AgentCompletionBanner onReview={() => {}} onDismiss={() => {}} />
    );
    const buttons = container.querySelectorAll("button");
    buttons.forEach((b) => {
      const cls = b.getAttribute("class")!;
      expect(cls).toContain("transition-colors");
      expect(cls).not.toMatch(/\btransition-all\b/);
    });
  });
});
