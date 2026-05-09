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
    const workingSrOnly = within(working).getByText(", 3 worktrees");
    expect(workingSrOnly.className).toContain("sr-only");

    const waiting = screen.getByRole("button", { name: /Waiting/ });
    const waitingSrOnly = within(waiting).getByText(", 1 worktree");
    expect(waitingSrOnly.className).toContain("sr-only");

    const finished = screen.getByRole("button", { name: /Finished/ });
    const finishedSrOnly = within(finished).getByText(", 0 worktrees");
    expect(finishedSrOnly.className).toContain("sr-only");
  });

  it("exposes the count in the button's accessible name", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ working: 3, waiting: 1, finished: 0 }}
      />
    );
    expect(screen.getByRole("button", { name: "Working, 3 worktrees" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Waiting, 1 worktree" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Finished, 0 worktrees" })).toBeTruthy();
  });

  it("uses a soft fill plus subtle inset ring for the active pill", () => {
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
    expect(active.className).toContain("ring-border-strong");
    expect(active.className).toContain("bg-overlay-strong");
    expect(active.className).toContain("font-medium");

    const inactive = screen.getByRole("button", { name: /Waiting/ });
    expect(inactive.className).not.toContain("ring-border-strong");
    expect(inactive.className).not.toContain("bg-overlay-strong");
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
