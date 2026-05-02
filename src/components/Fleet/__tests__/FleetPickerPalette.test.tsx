// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, screen, act } from "@testing-library/react";

vi.mock("@/components/ui/ScrollShadow", () => ({
  ScrollShadow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/animationUtils", () => ({
  UI_ENTER_DURATION: 0,
  UI_EXIT_DURATION: 0,
  UI_ENTER_EASING: "linear",
  UI_EXIT_EASING: "linear",
  UI_PALETTE_ENTER_DURATION: 0,
  UI_PALETTE_EXIT_DURATION: 0,
  getUiTransitionDuration: () => 0,
}));

vi.mock("@/hooks/useAnimatedPresence", () => ({
  useAnimatedPresence: ({ isOpen }: { isOpen: boolean }) => ({
    isVisible: isOpen,
    shouldRender: isOpen,
  }),
}));

import { FleetPickerPalette } from "../FleetPickerPalette";
import { usePanelStore } from "@/store/panelStore";
import { useFleetArmingStore } from "@/store/fleetArmingStore";
import { useWorktreeSelectionStore } from "@/store/worktreeStore";
import { useFleetPickerSessionStore } from "@/store/fleetPickerSessionStore";
import { _resetForTests as resetEscapeStack, dispatchEscape } from "@/lib/escapeStack";
import { WorktreeStoreContext } from "@/contexts/WorktreeStoreContext";
import { createWorktreeStore } from "@/store/createWorktreeStore";
import type { TerminalInstance, WorktreeSnapshot } from "@shared/types";

function makeTerminal(id: string, overrides: Partial<TerminalInstance> = {}): TerminalInstance {
  return {
    id,
    title: id,
    kind: "terminal",
    worktreeId: "wt-1",
    location: "grid",
    hasPty: true,
    agentState: "idle",
    runtimeStatus: "running",
    ...overrides,
  } as TerminalInstance;
}

function seedTerminals(terminals: TerminalInstance[]): void {
  const panelsById: Record<string, TerminalInstance> = {};
  const panelIds: string[] = [];
  for (const t of terminals) {
    panelsById[t.id] = t;
    panelIds.push(t.id);
  }
  usePanelStore.setState({ panelsById, panelIds });
}

function makeWorktreeSnap(id: string, name: string): WorktreeSnapshot {
  return {
    id,
    worktreeId: id,
    path: `/repo/${id}`,
    name,
    isCurrent: false,
  } as WorktreeSnapshot;
}

function resetStores(): void {
  useFleetArmingStore.setState({
    armedIds: new Set<string>(),
    armOrder: [],
    armOrderById: {},
    lastArmedId: null,
    previewArmedIds: new Set<string>(),
    broadcastSignal: 0,
  });
  useFleetPickerSessionStore.setState({ activeOwner: null });
  useWorktreeSelectionStore.setState({ activeWorktreeId: "wt-1" });
}

function renderPalette(
  worktrees: WorktreeSnapshot[],
  isOpen = true,
  onClose: () => void = () => {}
) {
  const store = createWorktreeStore();
  store.getState().applySnapshot(worktrees, 1);
  return render(
    <WorktreeStoreContext.Provider value={store}>
      <FleetPickerPalette isOpen={isOpen} onClose={onClose} />
    </WorktreeStoreContext.Provider>
  );
}

describe("FleetPickerPalette", () => {
  beforeEach(() => {
    resetStores();
    seedTerminals([]);
    resetEscapeStack();
    Object.assign(window, {
      electron: {
        terminal: {
          searchSemanticBuffers: vi.fn().mockResolvedValue([]),
        },
      },
    });
  });

  afterEach(() => {
    resetStores();
    resetEscapeStack();
  });

  it("renders the palette title and content when open", async () => {
    seedTerminals([makeTerminal("t1")]);
    renderPalette([makeWorktreeSnap("wt-1", "main")]);
    await act(async () => {});
    expect(screen.getByText("Select terminals to arm")).toBeTruthy();
    expect(screen.getByTestId("fleet-picker-cold-start-root")).toBeTruthy();
  });

  it("preselects active-worktree eligibles in cold-start mode", async () => {
    seedTerminals([
      makeTerminal("t1", { worktreeId: "wt-1" }),
      makeTerminal("t2", { worktreeId: "wt-1" }),
      makeTerminal("t3", { worktreeId: "wt-2" }),
    ]);
    renderPalette([makeWorktreeSnap("wt-1", "main"), makeWorktreeSnap("wt-2", "feature")]);
    await act(async () => {});
    const confirm = screen.getByTestId("fleet-picker-cold-start-confirm") as HTMLButtonElement;
    expect(confirm.textContent).toContain("Arm 2 selected");
    expect(confirm.disabled).toBe(false);
  });

  it("commit replaces the armed set via armIds", async () => {
    seedTerminals([
      makeTerminal("t1", { worktreeId: "wt-1" }),
      makeTerminal("t2", { worktreeId: "wt-1" }),
    ]);
    // Pre-existing armed terminal that is NOT in active worktree — replace
    // semantics should drop it.
    useFleetArmingStore.getState().armId("preexisting");
    seedTerminals([
      makeTerminal("preexisting", { worktreeId: "wt-2" }),
      makeTerminal("t1", { worktreeId: "wt-1" }),
      makeTerminal("t2", { worktreeId: "wt-1" }),
    ]);
    const onClose = vi.fn();
    renderPalette([makeWorktreeSnap("wt-1", "main")], true, onClose);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByTestId("fleet-picker-cold-start-confirm"));
    });
    const s = useFleetArmingStore.getState();
    // t1, t2 replaced "preexisting".
    expect(s.armOrder).toEqual(["t1", "t2"]);
    expect(s.armedIds.has("preexisting")).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it("Cancel button calls onClose without arming", async () => {
    seedTerminals([makeTerminal("t1")]);
    const onClose = vi.fn();
    renderPalette([makeWorktreeSnap("wt-1", "main")], true, onClose);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByText("Cancel"));
    });
    expect(onClose).toHaveBeenCalled();
    expect(useFleetArmingStore.getState().armedIds.size).toBe(0);
  });

  it("Esc closes the palette via the escape stack", async () => {
    seedTerminals([makeTerminal("t1")]);
    const onClose = vi.fn();
    renderPalette([makeWorktreeSnap("wt-1", "main")], true, onClose);
    await act(async () => {});
    await act(async () => {
      dispatchEscape();
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("Esc with non-empty search clears search before closing", async () => {
    seedTerminals([makeTerminal("alpha"), makeTerminal("beta")]);
    useWorktreeSelectionStore.setState({ activeWorktreeId: null });
    const onClose = vi.fn();
    renderPalette([makeWorktreeSnap("wt-1", "main")], true, onClose);
    await act(async () => {});
    const search = screen.getByTestId("fleet-picker-cold-start-search") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(search, { target: { value: "alpha" } });
    });
    await act(async () => {});
    // 1st Esc clears the query — palette stays open.
    await act(async () => {
      dispatchEscape();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByTestId("fleet-picker-cold-start-search") as HTMLInputElement).value).toBe(
      ""
    );
    // 2nd Esc closes the palette.
    await act(async () => {
      dispatchEscape();
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("disables confirm when no terminals are selected", async () => {
    seedTerminals([makeTerminal("t1")]);
    useWorktreeSelectionStore.setState({ activeWorktreeId: null });
    renderPalette([makeWorktreeSnap("wt-1", "main")]);
    await act(async () => {});
    const confirm = screen.getByTestId("fleet-picker-cold-start-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toContain("Arm selected");
  });

  it("renders blocked state when another picker holds the session", async () => {
    seedTerminals([makeTerminal("t1")]);
    useFleetPickerSessionStore.setState({ activeOwner: "ribbon-add" });
    renderPalette([makeWorktreeSnap("wt-1", "main")]);
    await act(async () => {});
    expect(screen.getByTestId("fleet-picker-cold-start-blocked")).toBeTruthy();
    expect(screen.queryByTestId("fleet-picker-cold-start-root")).toBeNull();
  });

  it("releases the picker session when the palette closes", async () => {
    seedTerminals([makeTerminal("t1")]);
    const { rerender } = renderPalette([makeWorktreeSnap("wt-1", "main")], true);
    await act(async () => {});
    expect(useFleetPickerSessionStore.getState().activeOwner).toBe("cold-start");
    rerender(
      <WorktreeStoreContext.Provider value={createWorktreeStore()}>
        <FleetPickerPalette isOpen={false} onClose={() => {}} />
      </WorktreeStoreContext.Provider>
    );
    await act(async () => {});
    expect(useFleetPickerSessionStore.getState().activeOwner).toBeNull();
  });
});
