// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/hooks", () => ({
  useOverlayState: () => {},
}));

vi.mock("@/store/paletteStore", () => ({
  usePaletteStore: { getState: () => ({ activePaletteId: null }) },
}));

import { AppPaletteDialog } from "../AppPaletteDialog";

describe("AppPaletteDialog.Empty", () => {
  it("renders children when query is empty (no-data state)", () => {
    render(
      <AppPaletteDialog.Empty query="" emptyMessage="No items available">
        <span data-testid="cta">Create a terminal</span>
      </AppPaletteDialog.Empty>
    );
    expect(screen.getByTestId("cta")).toBeTruthy();
    expect(screen.getByText("No items available")).toBeTruthy();
  });

  it("renders children when query is whitespace only", () => {
    render(
      <AppPaletteDialog.Empty query="   " emptyMessage="No items available">
        <span data-testid="cta">Create a terminal</span>
      </AppPaletteDialog.Empty>
    );
    expect(screen.getByTestId("cta")).toBeTruthy();
  });

  it("does NOT render children when query has text (no-match state)", () => {
    render(
      <AppPaletteDialog.Empty query="foo" emptyMessage="No items available">
        <span data-testid="cta">Create a terminal</span>
      </AppPaletteDialog.Empty>
    );
    expect(screen.queryByTestId("cta")).toBeNull();
    expect(screen.getByText("No results found")).toBeTruthy();
  });

  it("renders filteredEmptyContent below the no-match title when query has text", () => {
    render(
      <AppPaletteDialog.Empty
        query="foo"
        emptyMessage="No items available"
        filteredEmptyContent={<button data-testid="productive-row">Create "foo"</button>}
      >
        <span data-testid="cta">Create a terminal</span>
      </AppPaletteDialog.Empty>
    );
    expect(screen.getByTestId("productive-row")).toBeTruthy();
    expect(screen.queryByTestId("cta")).toBeNull();
    expect(screen.getByText("No results found")).toBeTruthy();
  });

  it("does NOT render filteredEmptyContent when query is empty (zero-data state)", () => {
    render(
      <AppPaletteDialog.Empty
        query=""
        emptyMessage="No items available"
        filteredEmptyContent={<button data-testid="productive-row">Create something</button>}
      />
    );
    expect(screen.queryByTestId("productive-row")).toBeNull();
  });

  it("renders without children when none provided", () => {
    render(<AppPaletteDialog.Empty query="" emptyMessage="No items available" />);
    expect(screen.getByText("No items available")).toBeTruthy();
  });

  it("shows noMatchMessage when query present and noMatchMessage provided", () => {
    render(
      <AppPaletteDialog.Empty
        query="xyz"
        emptyMessage="No items available"
        noMatchMessage="Nothing found"
      >
        <span data-testid="cta">hint</span>
      </AppPaletteDialog.Empty>
    );
    expect(screen.getByText("Nothing found")).toBeTruthy();
    expect(screen.queryByTestId("cta")).toBeNull();
  });

  it('exposes role="status" so screen readers announce the empty state', () => {
    render(<AppPaletteDialog.Empty query="" emptyMessage="No items available" />);
    const status = screen.getByRole("status");
    expect(status).toBeTruthy();
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it('also exposes role="status" with aria-live polite in the no-match case', () => {
    render(
      <AppPaletteDialog.Empty
        query="zzz"
        emptyMessage="No items available"
        noMatchMessage="Nothing found"
      />
    );
    const status = screen.getByRole("status");
    expect(status).toBeTruthy();
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it("treats whitespace-only query as the no-data state, not no-match", () => {
    render(
      <AppPaletteDialog.Empty query="   " emptyMessage="No items available">
        <span data-testid="cta">Create a terminal</span>
      </AppPaletteDialog.Empty>
    );
    expect(screen.getByText("No items available")).toBeTruthy();
    expect(screen.queryByText("No results found")).toBeNull();
    expect(screen.getByTestId("cta")).toBeTruthy();
  });
});
