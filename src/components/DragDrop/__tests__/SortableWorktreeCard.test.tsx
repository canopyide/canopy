// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { SortableWorktreeCard } from "../SortableWorktreeCard";

let mockIsDragging = false;

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: { role: "listitem" },
    listeners: undefined,
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
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

describe("SortableWorktreeCard", () => {
  it("isolates the card at idle so the flash overlay's blend mode anchors to the active background", () => {
    mockIsDragging = false;
    const { container } = render(
      <SortableWorktreeCard
        worktreeId="wt1"
        dragStartOrder={["wt1"]}
        ariaRowIndex={1}
        isActive={false}
      >
        {() => <div data-testid="child" />}
      </SortableWorktreeCard>
    );
    // outer m.div wraps inner div
    const outer = container.firstChild as HTMLElement;
    const wrapper = outer.firstChild as HTMLElement;
    expect(wrapper.style.isolation).toBe("isolate");
    expect(wrapper.style.contentVisibility).toBe("auto");
  });

  it("clears isolation during drag so dnd-kit transforms compose with the card root", () => {
    mockIsDragging = true;
    const { container } = render(
      <SortableWorktreeCard
        worktreeId="wt1"
        dragStartOrder={["wt1"]}
        ariaRowIndex={1}
        isActive={false}
      >
        {() => <div data-testid="child" />}
      </SortableWorktreeCard>
    );
    const outer = container.firstChild as HTMLElement;
    const wrapper = outer.firstChild as HTMLElement;
    expect(wrapper.style.isolation).toBe("auto");
    expect(wrapper.style.contentVisibility).toBe("");
  });

  it("keeps data-worktree-row and tabIndex on the inner div for roving focus compatibility", () => {
    mockIsDragging = false;
    const { container } = render(
      <SortableWorktreeCard
        worktreeId="wt1"
        dragStartOrder={["wt1"]}
        ariaRowIndex={1}
        isActive={false}
      >
        {() => <div data-testid="child" />}
      </SortableWorktreeCard>
    );
    const outer = container.firstChild as HTMLElement;
    const wrapper = outer.firstChild as HTMLElement;
    expect(wrapper.getAttribute("data-worktree-row")).toBe("wt1");
    expect(wrapper.getAttribute("tabindex")).toBe("-1");
    expect(wrapper.getAttribute("role")).toBe("row");
  });

  it("does not apply opacity-40 class (opacity now driven by framer-motion animate)", () => {
    mockIsDragging = true;
    const { container } = render(
      <SortableWorktreeCard
        worktreeId="wt1"
        dragStartOrder={["wt1"]}
        ariaRowIndex={1}
        isActive={false}
      >
        {() => <div data-testid="child" />}
      </SortableWorktreeCard>
    );
    const outer = container.firstChild as HTMLElement;
    const wrapper = outer.firstChild as HTMLElement;
    expect(wrapper.className).not.toContain("opacity-40");
  });
});
