// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { QuickSwitcherItem as QuickSwitcherItemData } from "@/hooks/useQuickSwitcher";

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

vi.mock("@/hooks/useKeybinding", () => ({
  useKeybindingDisplay: () => "",
}));

vi.mock("@/components/Terminal/TerminalIcon", () => ({
  TerminalIcon: () => <span data-testid="terminal-icon" />,
}));

vi.mock("@/components/icons", () => ({
  FolderGit2: () => <span data-testid="folder-icon" />,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { QuickSwitcher } from "./QuickSwitcher";

const terminalItem: QuickSwitcherItemData = {
  id: "terminal:t1",
  type: "terminal",
  title: "zsh",
  subtitle: "main",
  terminalKind: "shell",
};

const worktreeItem: QuickSwitcherItemData = {
  id: "worktree:wt1",
  type: "worktree",
  title: "feature-branch",
  subtitle: "/path/to/wt",
};

interface RenderArgs {
  results: QuickSwitcherItemData[];
  selectedIndex: number;
}

function renderQuickSwitcher({ results, selectedIndex }: RenderArgs) {
  return render(
    <QuickSwitcher
      isOpen
      query=""
      results={results}
      totalResults={results.length}
      selectedIndex={selectedIndex}
      isLoading={false}
      close={() => {}}
      setQuery={() => {}}
      setSelectedIndex={() => {}}
      selectPrevious={() => {}}
      selectNext={() => {}}
      selectItem={() => {}}
      confirmSelection={() => {}}
    />
  );
}

describe("QuickSwitcher dynamic footer hint", () => {
  it("shows 'Switch terminal' when a terminal row is selected", () => {
    renderQuickSwitcher({ results: [terminalItem, worktreeItem], selectedIndex: 0 });

    expect(screen.getByText("Switch terminal")).toBeTruthy();
    expect(screen.queryByText("Switch worktree")).toBeNull();
  });

  it("shows 'Switch worktree' when a worktree row is selected", () => {
    renderQuickSwitcher({ results: [terminalItem, worktreeItem], selectedIndex: 1 });

    expect(screen.getByText("Switch worktree")).toBeTruthy();
    expect(screen.queryByText("Switch terminal")).toBeNull();
  });

  it("falls back to default hints when results are empty", () => {
    renderQuickSwitcher({ results: [], selectedIndex: -1 });

    expect(document.body.textContent).toContain("to select");
    expect(screen.queryByText("Switch terminal")).toBeNull();
    expect(screen.queryByText("Switch worktree")).toBeNull();
  });

  it("wires aria-describedby on each row to the footer hint id", () => {
    renderQuickSwitcher({ results: [terminalItem, worktreeItem], selectedIndex: 0 });

    const listbox = screen.getByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(2);

    const describedBy = options[0]!.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(options[1]!.getAttribute("aria-describedby")).toBe(describedBy);

    const hintEl = document.getElementById(describedBy!);
    expect(hintEl).not.toBeNull();
    expect(hintEl?.textContent).toContain("Switch terminal");
  });

  it("does not render an aria-live region", () => {
    renderQuickSwitcher({
      results: [terminalItem, worktreeItem],
      selectedIndex: 0,
    });

    expect(document.body.querySelector("[aria-live]")).toBeNull();
  });
});
