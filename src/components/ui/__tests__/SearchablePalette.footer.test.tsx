// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = ResizeObserverStub as typeof ResizeObserver;
  }
});

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/hooks", () => ({
  useEscapeStack: () => {},
  useOverlayState: () => {},
}));

vi.mock("@/store/paletteStore", () => ({
  usePaletteStore: { getState: () => ({ activePaletteId: null }) },
}));

import { SearchablePalette } from "../SearchablePalette";

interface Item {
  id: string;
  label: string;
}

const items: Item[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Bravo" },
  { id: "c", label: "Charlie" },
];

interface RenderArgs {
  selectedIndex?: number;
  results?: Item[];
  footer?: React.ReactNode;
  getFooter?: (selectedItem: Item | null) => React.ReactNode;
  getActionLabel?: (selectedItem: Item | null) => string;
}

function renderPalette({
  selectedIndex = 0,
  results = items,
  footer,
  getFooter,
  getActionLabel,
}: RenderArgs = {}) {
  return render(
    <SearchablePalette<Item>
      isOpen
      query=""
      results={results}
      selectedIndex={selectedIndex}
      onQueryChange={() => {}}
      onSelectPrevious={() => {}}
      onSelectNext={() => {}}
      onConfirm={() => {}}
      onClose={() => {}}
      getItemId={(item) => item.id}
      renderItem={(item) => (
        <button key={item.id} data-testid={`row-${item.id}`}>
          {item.label}
        </button>
      )}
      label="Test"
      ariaLabel="Test palette"
      footer={footer}
      getFooter={getFooter}
      getActionLabel={getActionLabel}
    />
  );
}

describe("SearchablePalette footer", () => {
  it("calls getFooter with the selected item", () => {
    const getFooter = vi.fn((item: Item | null) =>
      item ? <span data-testid="footer">{item.label}</span> : null
    );

    const { getByTestId } = renderPalette({ selectedIndex: 1, getFooter });

    expect(getFooter).toHaveBeenCalledWith(items[1]);
    expect(getByTestId("footer").textContent).toBe("Bravo");
  });

  it("calls getFooter with null when results are empty", () => {
    const getFooter = vi.fn((item: Item | null) =>
      item ? (
        <span data-testid="footer">{item.label}</span>
      ) : (
        <span data-testid="footer">empty</span>
      )
    );

    const { getByTestId } = renderPalette({ results: [], selectedIndex: -1, getFooter });

    expect(getFooter).toHaveBeenCalledWith(null);
    expect(getByTestId("footer").textContent).toBe("empty");
  });

  it("getFooter takes precedence over the static footer prop", () => {
    const { getByTestId, queryByTestId } = renderPalette({
      footer: <span data-testid="static-footer">static</span>,
      getFooter: () => <span data-testid="dynamic-footer">dynamic</span>,
    });

    expect(getByTestId("dynamic-footer")).toBeTruthy();
    expect(queryByTestId("static-footer")).toBeNull();
  });

  it("renders the static footer when getFooter is omitted", () => {
    const { getByTestId } = renderPalette({
      footer: <span data-testid="static-footer">static</span>,
    });

    expect(getByTestId("static-footer").textContent).toBe("static");
  });

  it("falls back to default keyboard hints when neither prop is provided", () => {
    renderPalette();

    expect(document.body.textContent).toContain("to select");
  });

  it("does not render an aria-live region for the footer", () => {
    renderPalette({
      getFooter: (item) => (item ? <span>{item.label}</span> : null),
    });

    expect(document.body.querySelector("[aria-live]")).toBeNull();
  });

  it("getActionLabel composes a custom verb into the default footer hint", () => {
    renderPalette({
      selectedIndex: 1,
      getActionLabel: (item) => (item ? `Switch to ${item.label}` : "Switch"),
    });

    expect(document.body.textContent).toContain("to switch to bravo");
    expect(document.body.textContent).not.toContain("to select");
  });

  it("getActionLabel receives null when results are empty", () => {
    const fn = vi.fn((item: Item | null) => (item ? `Switch ${item.label}` : "Pick"));
    renderPalette({ results: [], selectedIndex: -1, getActionLabel: fn });

    expect(fn).toHaveBeenCalledWith(null);
    expect(document.body.textContent).toContain("to pick");
  });

  it("getFooter takes precedence over getActionLabel", () => {
    const { getByTestId } = renderPalette({
      getFooter: () => <span data-testid="dynamic-footer">dynamic</span>,
      getActionLabel: () => "Switch terminal",
    });

    expect(getByTestId("dynamic-footer")).toBeTruthy();
    expect(document.body.textContent).not.toContain("to switch terminal");
  });

  it("static footer takes precedence over getActionLabel", () => {
    const { getByTestId } = renderPalette({
      footer: <span data-testid="static-footer">static</span>,
      getActionLabel: () => "Switch terminal",
    });

    expect(getByTestId("static-footer")).toBeTruthy();
    expect(document.body.textContent).not.toContain("to switch terminal");
  });

  it("falls back to 'Select' when getActionLabel returns a blank string", () => {
    renderPalette({ getActionLabel: () => "   " });
    expect(document.body.textContent).toContain("to select");
  });

  it("explicit footer={false} suppresses both the action-label path and the default hints", () => {
    renderPalette({ footer: false, getActionLabel: () => "Switch terminal" });
    expect(document.body.textContent).not.toContain("to switch terminal");
    expect(document.body.textContent).not.toContain("to select");
  });
});
