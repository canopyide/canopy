/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExistingBranchPicker } from "../ExistingBranchPicker";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(cleanup);

function renderPicker(overrides: Partial<Parameters<typeof ExistingBranchPicker>[0]> = {}) {
  return render(
    <ExistingBranchPicker
      open
      onOpenChange={() => {}}
      selectedBranch={null}
      query=""
      onQueryChange={() => {}}
      filteredBranches={[]}
      onSelect={() => {}}
      {...overrides}
    />
  );
}

describe("ExistingBranchPicker empty states", () => {
  it("renders zero-data EmptyState when no branches and no query", () => {
    renderPicker({ query: "", filteredBranches: [] });
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No available local branches");
  });

  it("renders filtered-empty EmptyState with interpolated query", () => {
    renderPicker({ query: "feature/foo", filteredBranches: [] });
    const status = screen.getByRole("status");
    expect(status.textContent).toContain('No matches for "feature/foo"');
  });

  it("falls back to zero-data copy for whitespace-only query", () => {
    renderPicker({ query: "   ", filteredBranches: [] });
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No available local branches");
  });
});
