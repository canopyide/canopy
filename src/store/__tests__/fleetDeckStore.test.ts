import { describe, it, expect, beforeEach, vi } from "vitest";

const { setStateMock } = vi.hoisted(() => ({
  setStateMock: vi.fn((_patch: Record<string, unknown>) => Promise.resolve()),
}));

vi.mock("@/controllers/FleetDeckController", () => ({
  fleetDeckController: {
    persistOpen: (isOpen: boolean) => setStateMock({ fleetDeckOpen: isOpen }),
    persistEdge: (edge: string) => setStateMock({ fleetDeckEdge: edge }),
    persistWidth: (width: number) => setStateMock({ fleetDeckWidth: width }),
    persistHeight: (height: number) => setStateMock({ fleetDeckHeight: height }),
  },
}));

import {
  useFleetDeckStore,
  FLEET_DECK_MIN_WIDTH,
  FLEET_DECK_MAX_WIDTH,
  FLEET_DECK_DEFAULT_WIDTH,
  FLEET_DECK_MIN_HEIGHT,
  FLEET_DECK_MAX_HEIGHT,
  FLEET_DECK_DEFAULT_HEIGHT,
} from "../fleetDeckStore";

function resetStore(): void {
  useFleetDeckStore.setState({
    isOpen: false,
    edge: "right",
    width: FLEET_DECK_DEFAULT_WIDTH,
    height: FLEET_DECK_DEFAULT_HEIGHT,
    scope: "current",
    stateFilter: "all",
    pinnedLiveIds: new Set<string>(),
    isHydrated: false,
  });
  setStateMock.mockClear();
}

describe("fleetDeckStore", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("open/close/toggle", () => {
    it("opens from closed state and persists", () => {
      useFleetDeckStore.getState().open();
      expect(useFleetDeckStore.getState().isOpen).toBe(true);
      expect(setStateMock).toHaveBeenCalledWith({ fleetDeckOpen: true });
    });

    it("open is idempotent when already open", () => {
      useFleetDeckStore.getState().open();
      setStateMock.mockClear();
      useFleetDeckStore.getState().open();
      expect(setStateMock).not.toHaveBeenCalled();
    });

    it("close is idempotent when already closed", () => {
      useFleetDeckStore.getState().close();
      expect(setStateMock).not.toHaveBeenCalled();
    });

    it("toggle flips and persists", () => {
      useFleetDeckStore.getState().toggle();
      expect(useFleetDeckStore.getState().isOpen).toBe(true);
      useFleetDeckStore.getState().toggle();
      expect(useFleetDeckStore.getState().isOpen).toBe(false);
      expect(setStateMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("width clamping", () => {
    it("clamps below minimum", () => {
      useFleetDeckStore.getState().setWidth(1);
      expect(useFleetDeckStore.getState().width).toBe(FLEET_DECK_MIN_WIDTH);
    });

    it("clamps above maximum", () => {
      useFleetDeckStore.getState().setWidth(100_000);
      expect(useFleetDeckStore.getState().width).toBe(FLEET_DECK_MAX_WIDTH);
    });

    it("accepts values exactly at bounds", () => {
      useFleetDeckStore.getState().setWidth(FLEET_DECK_MIN_WIDTH);
      expect(useFleetDeckStore.getState().width).toBe(FLEET_DECK_MIN_WIDTH);
      useFleetDeckStore.getState().setWidth(FLEET_DECK_MAX_WIDTH);
      expect(useFleetDeckStore.getState().width).toBe(FLEET_DECK_MAX_WIDTH);
    });

    it("skips persistence when width does not change", () => {
      useFleetDeckStore.getState().setWidth(FLEET_DECK_DEFAULT_WIDTH);
      // Default already matches, so no persist call
      expect(setStateMock).not.toHaveBeenCalled();
    });

    it("rejects non-finite values and falls back to default", () => {
      useFleetDeckStore.getState().setWidth(Number.NaN);
      expect(useFleetDeckStore.getState().width).toBe(FLEET_DECK_DEFAULT_WIDTH);
    });
  });

  describe("height clamping", () => {
    it("clamps below minimum", () => {
      useFleetDeckStore.getState().setHeight(10);
      expect(useFleetDeckStore.getState().height).toBe(FLEET_DECK_MIN_HEIGHT);
    });

    it("clamps above maximum", () => {
      useFleetDeckStore.getState().setHeight(100_000);
      expect(useFleetDeckStore.getState().height).toBe(FLEET_DECK_MAX_HEIGHT);
    });
  });

  describe("hydrate", () => {
    it("populates fields and sets isHydrated", () => {
      useFleetDeckStore.getState().hydrate({
        isOpen: true,
        edge: "left",
        width: 500,
        height: 600,
      });
      const s = useFleetDeckStore.getState();
      expect(s.isHydrated).toBe(true);
      expect(s.isOpen).toBe(true);
      expect(s.edge).toBe("left");
      expect(s.width).toBe(500);
      expect(s.height).toBe(600);
    });

    it("ignores undefined partial fields", () => {
      useFleetDeckStore.getState().hydrate({ width: 420 });
      const s = useFleetDeckStore.getState();
      expect(s.width).toBe(420);
      expect(s.isOpen).toBe(false);
      expect(s.edge).toBe("right");
    });

    it("clamps out-of-range width on hydrate", () => {
      useFleetDeckStore.getState().hydrate({ width: 50 });
      expect(useFleetDeckStore.getState().width).toBe(FLEET_DECK_MIN_WIDTH);
    });

    it("coerces unknown edge to right", () => {
      // "bottom" not yet rendered — normalized to "right"
      useFleetDeckStore.getState().hydrate({ edge: "bottom" });
      expect(useFleetDeckStore.getState().edge).toBe("right");
    });

    it("does not persist during hydrate", () => {
      useFleetDeckStore.getState().hydrate({
        isOpen: true,
        width: 500,
      });
      expect(setStateMock).not.toHaveBeenCalled();
    });

    it("a user mutator before hydrate() wins over stale persisted values", () => {
      // Simulate: user hits Cmd+Alt+Shift+B before AppState IPC resolves
      useFleetDeckStore.getState().open();
      useFleetDeckStore.getState().setWidth(700);
      // Stale hydrate arrives with persisted closed state and old width
      useFleetDeckStore.getState().hydrate({
        isOpen: false,
        width: 480,
      });
      const s = useFleetDeckStore.getState();
      expect(s.isOpen).toBe(true);
      expect(s.width).toBe(700);
    });

    it("hydrate() becomes a no-op after first hydrate", () => {
      useFleetDeckStore.getState().hydrate({ isOpen: true, width: 500 });
      useFleetDeckStore.getState().hydrate({ isOpen: false, width: 600 });
      const s = useFleetDeckStore.getState();
      expect(s.isOpen).toBe(true);
      expect(s.width).toBe(500);
    });
  });

  describe("pin management", () => {
    it("pinLive adds to the set", () => {
      useFleetDeckStore.getState().pinLive("a");
      useFleetDeckStore.getState().pinLive("b");
      expect(useFleetDeckStore.getState().pinnedLiveIds.has("a")).toBe(true);
      expect(useFleetDeckStore.getState().pinnedLiveIds.has("b")).toBe(true);
    });

    it("pinLive is idempotent", () => {
      useFleetDeckStore.getState().pinLive("a");
      const first = useFleetDeckStore.getState().pinnedLiveIds;
      useFleetDeckStore.getState().pinLive("a");
      const second = useFleetDeckStore.getState().pinnedLiveIds;
      expect(second).toBe(first);
    });

    it("unpinLive removes from the set", () => {
      useFleetDeckStore.getState().pinLive("a");
      useFleetDeckStore.getState().unpinLive("a");
      expect(useFleetDeckStore.getState().pinnedLiveIds.has("a")).toBe(false);
    });

    it("togglePinLive flips membership", () => {
      useFleetDeckStore.getState().togglePinLive("a");
      expect(useFleetDeckStore.getState().pinnedLiveIds.has("a")).toBe(true);
      useFleetDeckStore.getState().togglePinLive("a");
      expect(useFleetDeckStore.getState().pinnedLiveIds.has("a")).toBe(false);
    });

    it("prunePins removes stale ids", () => {
      useFleetDeckStore.getState().pinLive("a");
      useFleetDeckStore.getState().pinLive("b");
      useFleetDeckStore.getState().pinLive("c");
      useFleetDeckStore.getState().prunePins(new Set(["a", "c"]));
      const pins = useFleetDeckStore.getState().pinnedLiveIds;
      expect(pins.has("a")).toBe(true);
      expect(pins.has("b")).toBe(false);
      expect(pins.has("c")).toBe(true);
    });

    it("prunePins no-ops when nothing changed", () => {
      useFleetDeckStore.getState().pinLive("a");
      const before = useFleetDeckStore.getState().pinnedLiveIds;
      useFleetDeckStore.getState().prunePins(new Set(["a"]));
      expect(useFleetDeckStore.getState().pinnedLiveIds).toBe(before);
    });
  });

  describe("scope and filter", () => {
    it("setScope updates scope without persistence", () => {
      useFleetDeckStore.getState().setScope("all");
      expect(useFleetDeckStore.getState().scope).toBe("all");
      expect(setStateMock).not.toHaveBeenCalled();
    });

    it("setStateFilter updates filter", () => {
      useFleetDeckStore.getState().setStateFilter("waiting");
      expect(useFleetDeckStore.getState().stateFilter).toBe("waiting");
    });
  });

  describe("setEdge", () => {
    it("accepts left", () => {
      useFleetDeckStore.getState().setEdge("left");
      expect(useFleetDeckStore.getState().edge).toBe("left");
      expect(setStateMock).toHaveBeenCalledWith({ fleetDeckEdge: "left" });
    });

    it("normalizes bottom to right until implemented", () => {
      useFleetDeckStore.getState().setEdge("bottom");
      expect(useFleetDeckStore.getState().edge).toBe("right");
    });
  });
});
