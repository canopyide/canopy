// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import type { TerminalInstance } from "@shared/types";

// Mock xterm stack — we're testing composition and reactivity here, not
// the xterm lifecycle (that's covered in MirrorTile.test.tsx).
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    rows = 24;
    open = vi.fn();
    dispose = vi.fn();
    write = vi.fn();
    refresh = vi.fn();
    loadAddon = vi.fn();
  },
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));
vi.mock("@xterm/addon-serialize", () => ({
  SerializeAddon: class {
    serialize = vi.fn(() => "");
  },
}));
vi.mock("@/clients/terminalClient", () => ({
  terminalClient: {
    onData: vi.fn(() => () => {}),
  },
}));
vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: vi.fn() },
}));

// ClusterAttentionPill depends on the WorktreeStore context (via
// useAgentClusters). Stub it to keep the test focused on Deck composition.
vi.mock("../ClusterAttentionPill", () => ({
  ClusterAttentionPill: () => null,
}));

// FleetComposer reaches into terminal focus/scope infrastructure; stub to
// a dumb span for composition tests.
vi.mock("../FleetComposer", () => ({
  FleetComposer: () => <span data-testid="fleet-composer-stub" />,
}));

import { FleetDeck } from "../FleetDeck";
import { useFleetDeckStore } from "@/store/fleetDeckStore";
import { useFleetArmingStore } from "@/store/fleetArmingStore";
import { usePanelStore } from "@/store/panelStore";
import { useWorktreeSelectionStore } from "@/store/worktreeStore";

function makeAgent(id: string, overrides: Partial<TerminalInstance> = {}): TerminalInstance {
  return {
    id,
    title: id,
    kind: "agent",
    agentId: "claude",
    worktreeId: "wt-1",
    location: "grid",
    hasPty: true,
    agentState: "idle",
    ...overrides,
  } as TerminalInstance;
}

function seedPanels(agents: TerminalInstance[]): void {
  const panelsById: Record<string, TerminalInstance> = {};
  const panelIds: string[] = [];
  for (const a of agents) {
    panelsById[a.id] = a;
    panelIds.push(a.id);
  }
  usePanelStore.setState({ panelsById, panelIds });
}

function reorderPanels(newOrder: string[]): void {
  // Simulate a drag-reorder: panelsById stays the same, panelIds changes.
  const current = usePanelStore.getState();
  usePanelStore.setState({ panelsById: current.panelsById, panelIds: newOrder });
}

function resetStores(): void {
  useFleetDeckStore.setState({
    isOpen: true,
    edge: "right",
    width: 480,
    height: 320,
    scope: "all",
    stateFilter: "all",
    pinnedLiveIds: new Set<string>(),
    isHydrated: true,
  });
  useFleetArmingStore.setState({
    armedIds: new Set<string>(),
    armOrder: [],
    armOrderById: {},
    lastArmedId: null,
  });
  usePanelStore.setState({ panelsById: {}, panelIds: [] });
  useWorktreeSelectionStore.setState({ activeWorktreeId: "wt-1" });
}

function withNonZeroLayout(): () => void {
  const origW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const origH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 320;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 200;
    },
  });
  return () => {
    if (origW) Object.defineProperty(HTMLElement.prototype, "clientWidth", origW);
    if (origH) Object.defineProperty(HTMLElement.prototype, "clientHeight", origH);
  };
}

function installResizeObserverMock(): () => void {
  class MockRO {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = MockRO as unknown as typeof ResizeObserver;
  return () => {
    globalThis.ResizeObserver = original;
  };
}

describe("FleetDeck", () => {
  let restoreLayout: () => void;
  let restoreRO: () => void;

  beforeEach(() => {
    resetStores();
    restoreLayout = withNonZeroLayout();
    restoreRO = installResizeObserverMock();
  });

  afterEach(() => {
    restoreLayout();
    restoreRO();
  });

  it("renders nothing when the deck is closed", () => {
    useFleetDeckStore.setState({ isOpen: false });
    seedPanels([makeAgent("a")]);
    const { container } = render(<FleetDeck />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a tile per eligible agent when open", () => {
    seedPanels([makeAgent("a"), makeAgent("b"), makeAgent("c")]);
    const { getAllByTestId } = render(<FleetDeck />);
    expect(getAllByTestId("fleet-mirror-tile")).toHaveLength(3);
  });

  it("re-renders tiles when panelIds is reordered", async () => {
    seedPanels([makeAgent("a"), makeAgent("b"), makeAgent("c"), makeAgent("d"), makeAgent("e")]);
    const { getAllByTestId } = render(<FleetDeck />);
    const initialOrder = getAllByTestId("fleet-mirror-tile").map(
      (el) => el.getAttribute("data-terminal-id") ?? ""
    );
    expect(initialOrder).toEqual(["a", "b", "c", "d", "e"]);

    await act(async () => {
      reorderPanels(["e", "d", "c", "b", "a"]);
    });

    const newOrder = getAllByTestId("fleet-mirror-tile").map(
      (el) => el.getAttribute("data-terminal-id") ?? ""
    );
    expect(newOrder).toEqual(["e", "d", "c", "b", "a"]);
  });

  it("live tiles respect the 4-slot cap with priority ordering", () => {
    seedPanels([
      makeAgent("a", { agentState: "idle" }),
      makeAgent("b", { agentState: "waiting" }),
      makeAgent("c", { agentState: "working" }),
      makeAgent("d", { agentState: "idle" }),
      makeAgent("e", { agentState: "idle" }),
    ]);
    useFleetArmingStore.setState({
      armedIds: new Set(["d"]),
      armOrder: ["d"],
      armOrderById: { d: 1 },
      lastArmedId: "d",
    });
    const { getAllByTestId } = render(<FleetDeck />);
    const tiles = getAllByTestId("fleet-mirror-tile");
    const liveTiles = tiles.filter((el) => el.getAttribute("data-live") === "true");
    expect(liveTiles).toHaveLength(4);
    // Armed "d" (tier 1) > waiting "b" (tier 2) > working "c" (tier 3) >
    // first idle "a" (tier 4). "e" (second idle) is the odd one out.
    const ids = liveTiles.map((el) => el.getAttribute("data-terminal-id"));
    expect(ids).toContain("d");
    expect(ids).toContain("b");
    expect(ids).toContain("c");
    expect(ids).not.toContain("e");
  });
});
