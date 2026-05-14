// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QuickStateFilterBar } from "../QuickStateFilterBar";

describe("QuickStateFilterBar", () => {
  it("renders all four segments addressable by accessible name when counts are omitted", () => {
    render(<QuickStateFilterBar value="all" onChange={() => {}} />);
    // "All" keeps its visible text anchor; the status segments go icon-only.
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.queryByText("Working")).toBeNull();
    expect(screen.queryByText("Waiting")).toBeNull();
    expect(screen.queryByText("Finished")).toBeNull();
    expect(screen.getByRole("button", { name: "Working" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Waiting" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Finished" })).toBeTruthy();
  });

  it("renders the bare count digit for every segment including All", () => {
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
    expect(within(all).getByText("9")).toBeTruthy();
    expect(within(working).getByText("3")).toBeTruthy();
    expect(within(waiting).getByText("1")).toBeTruthy();
    expect(within(finished).getByText("5")).toBeTruthy();
    // No parenthesised count anymore — just the digit.
    expect(within(working).queryByText("(3)", { exact: false })).toBeNull();
  });

  it("shows the count digit even for empty buckets", () => {
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
    // Empty buckets still show "0" — a missing digit reads as broken, not empty.
    expect(within(working).getByText("0")).toBeTruthy();
    expect(within(waiting).getByText("0")).toBeTruthy();
    expect(within(finished).getByText("0")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Working, 0 worktrees" })).toBeTruthy();
    // The count digit stays out of the accessible name.
    expect(working.textContent).not.toContain("worktree");
  });

  it("keeps the visible count out of the accessible name via aria-hidden", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ all: 9, working: 3, waiting: 1, finished: 2 }}
      />
    );
    const working = screen.getByRole("button", { name: /Working/ });
    const visibleCount = within(working).getByText("3");
    expect(visibleCount.getAttribute("aria-hidden")).toBe("true");
    // The count reaches screen readers only through the button's accessible name.
    expect(screen.getByRole("button", { name: "Working, 3 worktrees" })).toBeTruthy();
  });

  it("exposes the count in the button's accessible name with singular/plural nouns", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ all: 9, working: 3, waiting: 1, finished: 2 }}
      />
    );
    expect(screen.getByRole("button", { name: "All, 9 worktrees" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Working, 3 worktrees" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Waiting, 1 worktree" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Finished, 2 worktrees" })).toBeTruthy();
  });

  it("names each segment with a hover tooltip", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ all: 9, working: 3, waiting: 1, finished: 2 }}
      />
    );
    expect(screen.getByRole("button", { name: /Working/ }).getAttribute("title")).toBe(
      "Working (3)"
    );
    expect(screen.getByRole("button", { name: /^All/ }).getAttribute("title")).toBe("All (9)");
  });

  it("falls back to the bare status name in the tooltip when counts are omitted", () => {
    render(<QuickStateFilterBar value="all" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Waiting" }).getAttribute("title")).toBe("Waiting");
  });

  it("marks the active segment with aria-pressed=true", () => {
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

  it("clicking an inactive segment calls onChange with that value", () => {
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

  it('clicking the active segment toggles back to "all"', () => {
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

  it("renders a state icon on each non-All segment and no icon on All", () => {
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
    const working = screen.getByRole("button", { name: "Working" });
    const svg = working.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("class") ?? "").not.toContain("animate-spin-slow");
  });

  it("marks each segment icon as aria-hidden so the accessible name stays clean", () => {
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

  it("renders the optional trailing slot past a divider", () => {
    render(
      <QuickStateFilterBar
        value="all"
        onChange={() => {}}
        counts={{ all: 9, working: 1, waiting: 1, finished: 1 }}
        trailing={<button type="button">Arm</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Arm" })).toBeTruthy();
  });
});
