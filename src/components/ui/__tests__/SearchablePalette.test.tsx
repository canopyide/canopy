// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/hooks", () => ({
  useOverlayState: () => {},
  useEscapeStack: () => {},
}));

vi.mock("@/hooks/useAnimatedPresence", () => ({
  useAnimatedPresence: ({ isOpen }: { isOpen: boolean }) => ({
    isVisible: isOpen,
    shouldRender: isOpen,
  }),
}));

vi.mock("@/store/paletteStore", () => ({
  usePaletteStore: { getState: () => ({ activePaletteId: null }) },
}));

import { SearchablePalette } from "../SearchablePalette";

interface Item {
  id: string;
  name: string;
}

function renderPalette(
  overrides: Partial<React.ComponentProps<typeof SearchablePalette<Item>>> = {}
) {
  return render(
    <SearchablePalette<Item>
      isOpen={true}
      query=""
      results={[]}
      selectedIndex={-1}
      onQueryChange={() => {}}
      onSelectPrevious={() => {}}
      onSelectNext={() => {}}
      onConfirm={() => {}}
      onClose={() => {}}
      getItemId={(item) => item.id}
      renderItem={(item) => <div key={item.id}>{item.name}</div>}
      label="Test palette"
      ariaLabel="Test palette"
      {...overrides}
    />
  );
}

describe("SearchablePalette empty state and placeholders", () => {
  it("threads filteredEmptyContent through to the no-match state when query is non-empty", () => {
    renderPalette({
      query: "abc",
      results: [],
      filteredEmptyContent: <button data-testid="productive-row">Create &quot;abc&quot;</button>,
    });
    expect(screen.getByTestId("productive-row")).toBeTruthy();
    expect(screen.getByText("No results found")).toBeTruthy();
  });

  it("does not leak filteredEmptyContent into the zero-data state", () => {
    renderPalette({
      query: "",
      results: [],
      emptyContent: <span data-testid="empty-content">Empty hint</span>,
      filteredEmptyContent: <button data-testid="productive-row">Should not show</button>,
    });
    expect(screen.getByTestId("empty-content")).toBeTruthy();
    expect(screen.queryByTestId("productive-row")).toBeNull();
  });

  it("uses a static 'No results found' default when noMatchMessage is not provided", () => {
    renderPalette({ query: "zzz", results: [] });
    expect(screen.getByText("No results found")).toBeTruthy();
    // Old dynamic copy must not leak back via the wrapper fallback.
    expect(screen.queryByText(/No items match "zzz"/)).toBeNull();
  });

  it("preserves a custom static noMatchMessage when provided", () => {
    renderPalette({
      query: "zzz",
      results: [],
      noMatchMessage: "No prompts match your search",
    });
    expect(screen.getByText("No prompts match your search")).toBeTruthy();
    expect(screen.queryByText("No results found")).toBeNull();
  });

  it("defaults the search input placeholder and aria-label to 'Search' (no trailing ellipsis)", () => {
    renderPalette({});
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.placeholder).toBe("Search");
    expect(input.getAttribute("aria-label")).toBe("Search");
  });

  it("uses searchPlaceholder as the aria-label when searchAriaLabel is not provided", () => {
    renderPalette({ searchPlaceholder: "Search recipes" });
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.placeholder).toBe("Search recipes");
    expect(input.getAttribute("aria-label")).toBe("Search recipes");
  });
});
