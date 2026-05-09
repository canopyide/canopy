// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QuickStateFilterBar } from "../QuickStateFilterBar";

describe("QuickStateFilterBar", () => {
  it("renders all four pills without counts when counts prop is omitted", () => {
    render(<QuickStateFilterBar value="all" onChange={() => {}} />);
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("Working")).toBeTruthy();
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(screen.getByText("Finished")).toBeTruthy();
  });

  it("renders counts in parentheses for non-all tabs", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ working: 3, waiting: 1, finished: 5 }}
      />
    );
    expect(screen.getByText("All")).toBeTruthy();
    const working = screen.getByRole("button", { name: /Working/ });
    const waiting = screen.getByRole("button", { name: /Waiting/ });
    const finished = screen.getByRole("button", { name: /Finished/ });
    expect(within(working).getByText("(3)", { exact: false })).toBeTruthy();
    expect(within(waiting).getByText("(1)", { exact: false })).toBeTruthy();
    expect(within(finished).getByText("(5)", { exact: false })).toBeTruthy();
  });

  it("renders zero counts explicitly", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ working: 0, waiting: 0, finished: 0 }}
      />
    );
    const working = screen.getByRole("button", { name: /Working/ });
    const waiting = screen.getByRole("button", { name: /Waiting/ });
    const finished = screen.getByRole("button", { name: /Finished/ });
    expect(within(working).getByText("(0)", { exact: false })).toBeTruthy();
    expect(within(waiting).getByText("(0)", { exact: false })).toBeTruthy();
    expect(within(finished).getByText("(0)", { exact: false })).toBeTruthy();
  });

  it("hides the visual count from screen readers and adds an sr-only count", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ working: 3, waiting: 1, finished: 0 }}
      />
    );
    const working = screen.getByRole("button", { name: /Working/ });
    const visibleCount = within(working).getByText("(3)", { exact: false });
    expect(visibleCount.getAttribute("aria-hidden")).toBe("true");
    expect(within(working).getByText(", 3 worktrees")).toBeTruthy();

    const waiting = screen.getByRole("button", { name: /Waiting/ });
    expect(within(waiting).getByText(", 1 worktree")).toBeTruthy();

    const finished = screen.getByRole("button", { name: /Finished/ });
    expect(within(finished).getByText(", 0 worktrees")).toBeTruthy();
  });

  it("uses an inset ring (not a translucent fill) for the active pill", () => {
    render(
      <QuickStateFilterBar
        value="working"
        onChange={() => {}}
        counts={{ working: 2, waiting: 0, finished: 0 }}
      />
    );
    const active = screen.getByRole("button", { name: /Working/ });
    expect(active.className).toContain("ring-1");
    expect(active.className).toContain("ring-inset");
    expect(active.className).toContain("ring-text-secondary");
    expect(active.className).not.toContain("bg-tint/[0.12]");

    const inactive = screen.getByRole("button", { name: /Waiting/ });
    expect(inactive.className).not.toContain("ring-text-secondary");
  });

  it("marks the active pill with aria-pressed=true", () => {
    render(
      <QuickStateFilterBar
        value="working"
        onChange={() => {}}
        counts={{ working: 2, waiting: 0, finished: 1 }}
      />
    );
    expect(screen.getByRole("button", { name: /Working/ }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByText("All").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /Waiting/ }).getAttribute("aria-pressed")).toBe(
      "false"
    );
    expect(screen.getByRole("button", { name: /Finished/ }).getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  it("clicking an inactive pill calls onChange with that value", () => {
    const onChange = vi.fn();
    render(
      <QuickStateFilterBar
        value="all"
        onChange={onChange}
        counts={{ working: 1, waiting: 0, finished: 0 }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Working/ }));
    expect(onChange).toHaveBeenCalledWith("working");
  });

  it('clicking the active pill toggles back to "all"', () => {
    const onChange = vi.fn();
    render(
      <QuickStateFilterBar
        value="waiting"
        onChange={onChange}
        counts={{ working: 0, waiting: 3, finished: 0 }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Waiting/ }));
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it('"All" is aria-pressed when value is "all"', () => {
    render(<QuickStateFilterBar value="all" onChange={() => {}} />);
    expect(screen.getByText("All").getAttribute("aria-pressed")).toBe("true");
  });
});
