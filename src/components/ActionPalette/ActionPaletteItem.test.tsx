// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionPaletteItem } from "./ActionPaletteItem";
import type { ActionPaletteItem as ActionPaletteItemType } from "@/hooks/useActionPalette";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/config/categoryColors", () => ({
  ACTION_CATEGORY_COLORS: {
    terminal: "bg-cat-blue/15 text-cat-blue",
  },
  ACTION_CATEGORY_DEFAULT_COLOR: "bg-tint/[0.06] text-daintree-text/50",
}));

function makeItem(overrides: Partial<ActionPaletteItemType> = {}): ActionPaletteItemType {
  return {
    id: "action-1",
    title: "Test Action",
    description: "Test description",
    category: "terminal",
    enabled: true,
    kind: "command",
    titleLower: "test action",
    categoryLower: "terminal",
    descriptionLower: "test description",
    titleAcronym: "TA",
    keywordsLower: [],
    ...overrides,
  };
}

describe("ActionPaletteItem", () => {
  const onSelect = vi.fn();

  it("renders enabled action without disabled reason", () => {
    render(
      <ActionPaletteItem
        item={makeItem({ enabled: true })}
        isSelected={false}
        onSelect={onSelect}
      />
    );

    expect(screen.getByText("Test Action")).toBeTruthy();
    expect(screen.getByText("Test description")).toBeTruthy();
    expect(screen.queryByText("No focused terminal")).toBeNull();
  });

  it("renders disabled action with inline disabled reason", () => {
    render(
      <ActionPaletteItem
        item={makeItem({ enabled: false, disabledReason: "No focused terminal" })}
        isSelected={false}
        onSelect={onSelect}
      />
    );

    expect(screen.getByText("Test Action")).toBeTruthy();
    expect(screen.getByText("Test description")).toBeTruthy();
    expect(screen.getByText("No focused terminal")).toBeTruthy();

    const reasonElement = screen.getByText("No focused terminal");
    expect(reasonElement.className).toContain("italic");
  });

  it("does not render disabled reason for disabled actions without a reason", () => {
    const { container } = render(
      <ActionPaletteItem
        item={makeItem({ enabled: false })}
        isSelected={false}
        onSelect={onSelect}
      />
    );

    expect(screen.getByText("Test Action")).toBeTruthy();
    expect(screen.getByText("Test description")).toBeTruthy();
    expect(container.querySelector("button")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("does not render disabled reason for enabled actions with disabledReason", () => {
    const { container } = render(
      <ActionPaletteItem
        item={makeItem({ enabled: true, disabledReason: "Should not show" })}
        isSelected={false}
        onSelect={onSelect}
      />
    );

    expect(screen.getByText("Test Action")).toBeTruthy();
    expect(screen.queryByText("Should not show")).toBeNull();
    expect(container.querySelector("button")?.getAttribute("aria-disabled")).toBe("false");
  });

  it("renders keybinding when present", () => {
    render(
      <ActionPaletteItem
        item={makeItem({ keybinding: "⌘K" })}
        isSelected={false}
        onSelect={onSelect}
      />
    );

    expect(screen.getByText("⌘K")).toBeTruthy();
  });

  it("applies selected styling with aria-selected and accent indicator", () => {
    const { container } = render(
      <ActionPaletteItem item={makeItem()} isSelected={true} onSelect={onSelect} />
    );

    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    expect(button?.getAttribute("aria-selected")).toBe("true");
    // Selected state is now CSS-driven via aria-selected: variants.
    expect(button?.className).toContain("aria-selected:bg-overlay-soft");
    expect(button?.className).toContain("aria-selected:before:bg-daintree-accent");
    expect(button?.className).toContain("aria-selected:before:content-['']");
  });

  it("does not branch styling on isSelected — selection is purely aria-driven", () => {
    const { container: selectedContainer } = render(
      <ActionPaletteItem item={makeItem()} isSelected={true} onSelect={onSelect} />
    );
    const { container: unselectedContainer } = render(
      <ActionPaletteItem item={makeItem()} isSelected={false} onSelect={onSelect} />
    );

    const selectedClass = selectedContainer.querySelector("button")?.className;
    const unselectedClass = unselectedContainer.querySelector("button")?.className;
    // Class lists must be identical — only aria-selected attribute differs.
    expect(selectedClass).toBe(unselectedClass);
  });

  it("lifts keybinding glyph contrast on selection via group-aria-selected", () => {
    const { container } = render(
      <ActionPaletteItem
        item={makeItem({ keybinding: "⌘K" })}
        isSelected={true}
        onSelect={onSelect}
      />
    );

    const kbd = screen.getByText("⌘K");
    expect(kbd.className).toContain("text-daintree-text/40");
    expect(kbd.className).toContain("group-aria-selected:text-daintree-text/60");
    expect(container.querySelector("button")?.className).toContain("group");
  });

  it("calls onHover when the pointer moves over the item", () => {
    const onHover = vi.fn();
    const { container } = render(
      <ActionPaletteItem
        item={makeItem()}
        isSelected={false}
        onSelect={onSelect}
        onHover={onHover}
      />
    );

    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    fireEvent.pointerMove(button!);
    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it("does not throw when onHover is omitted", () => {
    const { container } = render(
      <ActionPaletteItem item={makeItem()} isSelected={false} onSelect={onSelect} />
    );

    const button = container.querySelector("button");
    expect(() => fireEvent.pointerMove(button!)).not.toThrow();
  });
});
