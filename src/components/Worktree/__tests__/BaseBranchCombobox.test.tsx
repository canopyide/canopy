/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createRef } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BaseBranchCombobox } from "../views/BaseBranchCombobox";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(cleanup);

function renderCombobox(overrides: Partial<Parameters<typeof BaseBranchCombobox>[0]> = {}) {
  return render(
    <TooltipProvider>
      <BaseBranchCombobox
        baseBranch="develop"
        branchPickerOpen
        onOpenChange={() => {}}
        branchQuery=""
        onQueryChange={() => {}}
        branchRows={[]}
        selectableRows={[]}
        selectedIndex={-1}
        selectedBranchLabel="develop"
        onKeyDown={() => {}}
        onSelect={() => {}}
        branchInputRef={createRef<HTMLInputElement>()}
        branchListRef={createRef<HTMLDivElement>()}
        branchOptionsLength={0}
        onClose={() => {}}
        {...overrides}
      />
    </TooltipProvider>
  );
}

describe("BaseBranchCombobox empty states", () => {
  it("renders zero-data EmptyState when no branches and no query", () => {
    renderCombobox({ branchQuery: "", selectableRows: [] });
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No branches available");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.hasAttribute("aria-describedby")).toBe(false);
  });

  it("renders filtered-empty EmptyState with interpolated query", () => {
    renderCombobox({ branchQuery: "feature/foo", selectableRows: [] });
    const status = screen.getByRole("status");
    expect(status.textContent).toContain('No matches for "feature/foo"');
  });

  it("falls back to zero-data copy for whitespace-only query", () => {
    renderCombobox({ branchQuery: "   ", selectableRows: [] });
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No branches available");
  });
});
