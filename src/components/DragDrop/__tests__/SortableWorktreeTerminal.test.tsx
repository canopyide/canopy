// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { SortableWorktreeTerminal } from "../SortableWorktreeTerminal";
import type { TerminalInstance } from "@/store";

let mockIsDragging = false;

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: { role: "button" },
    listeners: undefined,
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: mockIsDragging,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}));

const terminal: TerminalInstance = {
  id: "t3",
  title: "Worktree Terminal",
  cwd: "/test",
  cols: 80,
  rows: 24,
  worktreeId: "wt1",
  location: "grid",
  isVisible: true,
};

describe("SortableWorktreeTerminal", () => {
  it("renders children when given a ReactNode", () => {
    mockIsDragging = false;
    const { getByTestId } = render(
      <SortableWorktreeTerminal terminal={terminal} worktreeId="wt1" sourceIndex={0}>
        <div data-testid="child" />
      </SortableWorktreeTerminal>
    );
    expect(getByTestId("child")).toBeTruthy();
  });

  it("renders via render prop", () => {
    mockIsDragging = false;
    const { getByTestId } = render(
      <SortableWorktreeTerminal terminal={terminal} worktreeId="wt1" sourceIndex={0}>
        {({ listeners }) => <div data-testid="render-child" {...listeners} />}
      </SortableWorktreeTerminal>
    );
    expect(getByTestId("render-child")).toBeTruthy();
  });

  it("does not apply opacity-40 class (opacity now driven by framer-motion animate)", () => {
    mockIsDragging = true;
    const { container } = render(
      <SortableWorktreeTerminal terminal={terminal} worktreeId="wt1" sourceIndex={0}>
        <div />
      </SortableWorktreeTerminal>
    );
    const outer = container.firstChild as HTMLElement;
    const inner = outer.firstChild as HTMLElement;
    expect(inner.className).not.toContain("opacity-40");
  });
});
