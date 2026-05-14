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

  it("renders counts in parentheses for every tab including All", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ all: 9, working: 3, waiting: 1, finished: 5 }}
      />
    );
    const all = screen.getByRole("button", { name: /^All/ });
    const working = screen.getByRole("button", { name: /Working/ });
    const waiting = screen.getByRole("button", { name: /Waiting/ });
    const finished = screen.getByRole("button", { name: /Finished/ });
    expect(within(all).getByText("(9)", { exact: false })).toBeTruthy();
    expect(within(working).getByText("(3)", { exact: false })).toBeTruthy();
    expect(within(waiting).getByText("(1)", { exact: false })).toBeTruthy();
    expect(within(finished).getByText("(5)", { exact: false })).toBeTruthy();
  });

  it("hides zero counts entirely so empty buckets stay compact", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ all: 9, working: 0, waiting: 0, finished: 0 }}
      />
    );
    const working = screen.getByRole("button", { name: /Working/ });
    const waiting = screen.getByRole("button", { name: /Waiting/ });
    const finished = screen.getByRole("button", { name: /Finished/ });
    expect(within(working).queryByText("(0)", { exact: false })).toBeNull();
    expect(within(waiting).queryByText("(0)", { exact: false })).toBeNull();
    expect(within(finished).queryByText("(0)", { exact: false })).toBeNull();
    expect(working.textContent).not.toContain("worktree");
    expect(waiting.textContent).not.toContain("worktree");
    expect(finished.textContent).not.toContain("worktree");
  });

  it("hides the visual count from screen readers and adds an sr-only count", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ all: 9, working: 3, waiting: 1, finished: 2 }}
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
    const finishedSrOnly = within(finished).getByText(", 2 worktrees");
    expect(finishedSrOnly.className).toContain("sr-only");
  });

  it("exposes the count in the button's accessible name", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ all: 9, working: 3, waiting: 1, finished: 2 }}
      />
    );
    expect(screen.getByRole("button", { name: "Working, 3 worktrees" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Waiting, 1 worktree" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Finished, 2 worktrees" })).toBeTruthy();
  });

  it("marks the active pill with aria-pressed=true", () => {
    render(
      <QuickStateFilterBar
        value="working"
        onChange={() => {}}
        counts={{ all: 9, working: 2, waiting: 0, finished: 1 }}
      />
    );
    expect(screen.getByRole("button", { name: /Working/ }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByRole("button", { name: /^All/ }).getAttribute("aria-pressed")).toBe("false");
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
        counts={{ all: 9, working: 1, waiting: 0, finished: 0 }}
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
        counts={{ all: 9, working: 0, waiting: 3, finished: 0 }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Waiting/ }));
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it('"All" is aria-pressed when value is "all"', () => {
    render(<QuickStateFilterBar value="all" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /^All/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("renders a state icon on each non-All pill and no icon on All", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ all: 9, working: 1, waiting: 1, finished: 1 }}
      />
    );
    const all = screen.getByRole("button", { name: /^All/ });
    const working = screen.getByRole("button", { name: /Working/ });
    const waiting = screen.getByRole("button", { name: /Waiting/ });
    const finished = screen.getByRole("button", { name: /Finished/ });
    expect(all.querySelector("svg")).toBeNull();
    expect(working.querySelector("svg")).not.toBeNull();
    expect(waiting.querySelector("svg")).not.toBeNull();
    expect(finished.querySelector("svg")).not.toBeNull();
  });

  it("spins the working icon when counts.working > 0 even if Working is not the active filter", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ all: 9, working: 2, waiting: 0, finished: 0 }}
      />
    );
    const working = screen.getByRole("button", { name: /Working/ });
    const svg = working.querySelector("svg");
    expect(svg).not.toBeNull();
    const svgClass = svg?.getAttribute("class") ?? "";
    expect(svgClass).toContain("animate-spin-slow");
    expect(svgClass).toContain("motion-reduce:animate-none");
  });

  it("keeps the working icon spinning while Working is the active filter", () => {
    render(
      <QuickStateFilterBar
        value="working"
        onChange={() => {}}
        counts={{ all: 9, working: 2, waiting: 0, finished: 0 }}
      />
    );
    const working = screen.getByRole("button", { name: /Working/ });
    expect(working.getAttribute("aria-pressed")).toBe("true");
    const svg = working.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("class") ?? "").toContain("animate-spin-slow");
  });

  it("does not spin the working icon when counts.working is zero", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ all: 9, working: 0, waiting: 1, finished: 1 }}
      />
    );
    const working = screen.getByRole("button", { name: /Working/ });
    const svg = working.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("class") ?? "").not.toContain("animate-spin-slow");
  });

  it("does not spin the working icon when counts prop is omitted", () => {
    render(<QuickStateFilterBar value="all" onChange={() => {}} />);
    const working = screen.getByRole("button", { name: /Working/ });
    const svg = working.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("class") ?? "").not.toContain("animate-spin-slow");
  });

  it("marks each pill icon as aria-hidden so the accessible name stays clean", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ all: 9, working: 1, waiting: 1, finished: 1 }}
      />
    );
    for (const name of [/Working/, /Waiting/, /Finished/]) {
      const button = screen.getByRole("button", { name });
      const svg = button.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
