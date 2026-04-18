// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { StrictMode } from "react";
import { act, render } from "@testing-library/react";
import type { TerminalInstance } from "@shared/types";

const {
  terminalInstances,
  dataCallbacks,
  fitInstances,
  serializeInstances,
  dataCleanups,
  onDataBehavior,
} = vi.hoisted(() => ({
  terminalInstances: [] as Array<{
    open: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    loadAddon: ReturnType<typeof vi.fn>;
    rows: number;
  }>,
  dataCallbacks: new Map<string, Set<(data: string) => void>>(),
  fitInstances: [] as Array<{ fit: ReturnType<typeof vi.fn> }>,
  serializeInstances: [] as Array<{
    serialize: ReturnType<typeof vi.fn>;
  }>,
  dataCleanups: [] as Array<ReturnType<typeof vi.fn>>,
  onDataBehavior: { shouldThrow: false },
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class MockTerminal {
    rows = 24;
    open = vi.fn();
    dispose = vi.fn();
    write = vi.fn();
    refresh = vi.fn();
    loadAddon = vi.fn();
    constructor() {
      terminalInstances.push(this as unknown as (typeof terminalInstances)[number]);
    }
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class MockFitAddon {
    fit = vi.fn();
    constructor() {
      fitInstances.push(this as unknown as (typeof fitInstances)[number]);
    }
  },
}));

vi.mock("@xterm/addon-serialize", () => ({
  SerializeAddon: class MockSerializeAddon {
    serialize = vi.fn(() => "<serialized>");
    constructor() {
      serializeInstances.push(this as unknown as (typeof serializeInstances)[number]);
    }
  },
}));

vi.mock("@/clients/terminalClient", () => ({
  terminalClient: {
    onData: vi.fn((id: string, cb: (data: string) => void) => {
      if (onDataBehavior.shouldThrow) {
        throw new Error("simulated onData failure");
      }
      let set = dataCallbacks.get(id);
      if (!set) {
        set = new Set();
        dataCallbacks.set(id, set);
      }
      set.add(cb);
      const cleanup = vi.fn(() => {
        set?.delete(cb);
      });
      dataCleanups.push(cleanup);
      return cleanup;
    }),
  },
}));

vi.mock("@/services/ActionService", () => ({
  actionService: { dispatch: vi.fn() },
}));

import { MirrorTile } from "../MirrorTile";
import { usePanelStore } from "@/store/panelStore";
import { useFleetArmingStore } from "@/store/fleetArmingStore";
import { useFleetDeckStore } from "@/store/fleetDeckStore";

function resetAll(): void {
  terminalInstances.length = 0;
  fitInstances.length = 0;
  serializeInstances.length = 0;
  dataCleanups.length = 0;
  dataCallbacks.clear();
  onDataBehavior.shouldThrow = false;
  useFleetArmingStore.setState({
    armedIds: new Set<string>(),
    armOrder: [],
    armOrderById: {},
    lastArmedId: null,
  });
  useFleetDeckStore.setState({
    isOpen: false,
    pinnedLiveIds: new Set<string>(),
  });
  usePanelStore.setState({ panelsById: {}, panelIds: [] });
}

function seedPanel(id: string, overrides: Partial<TerminalInstance> = {}): void {
  const t = {
    id,
    title: id,
    location: "grid",
    ...overrides,
  } as TerminalInstance;
  usePanelStore.setState({
    panelsById: { [id]: t },
    panelIds: [id],
  });
}

function withNonZeroLayout(): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const originalH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
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
    if (original) Object.defineProperty(HTMLElement.prototype, "clientWidth", original);
    if (originalH) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalH);
  };
}

function installResizeObserverMock(): () => void {
  class MockResizeObserver {
    // The callback is stored so tests could fire it, but for our purposes
    // the initial mount path (triggered from requestAnimationFrame) is the
    // one that matters. The callback would otherwise re-fit on layout.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_cb: ResizeObserverCallback) {}
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  return () => {
    globalThis.ResizeObserver = original;
  };
}

async function flushRaf(): Promise<void> {
  // Run pending microtasks + macrotasks until our rAF-driven mount path settles.
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("MirrorTile", () => {
  let restoreLayout: () => void;
  let restoreRO: () => void;

  beforeEach(() => {
    resetAll();
    restoreLayout = withNonZeroLayout();
    restoreRO = installResizeObserverMock();
    // Use a fast-forward rAF.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(0), 0) as unknown as number;
    });
  });

  afterEach(() => {
    restoreLayout();
    restoreRO();
    vi.unstubAllGlobals();
  });

  it("mounts a live Terminal when isLive=true and disposes on unmount", async () => {
    seedPanel("t1", { agentState: "working" });
    const { unmount } = render(<MirrorTile terminalId="t1" isLive={true} />);
    await act(async () => {
      await flushRaf();
    });
    expect(terminalInstances).toHaveLength(1);
    expect(terminalInstances[0]!.open).toHaveBeenCalled();
    expect(fitInstances[0]!.fit).toHaveBeenCalled();
    expect(terminalInstances[0]!.dispose).not.toHaveBeenCalled();

    unmount();
    expect(terminalInstances[0]!.dispose).toHaveBeenCalled();
  });

  it("writes initial snapshot on live mount", async () => {
    seedPanel("t1");
    render(<MirrorTile terminalId="t1" isLive={true} initialSnapshot="hello-world" />);
    await act(async () => {
      await flushRaf();
    });
    expect(terminalInstances[0]!.write).toHaveBeenCalledWith("hello-world");
  });

  it("subscribes to terminalClient.onData and unsubscribes on unmount", async () => {
    seedPanel("t1");
    const { unmount } = render(<MirrorTile terminalId="t1" isLive={true} />);
    await act(async () => {
      await flushRaf();
    });
    expect(dataCallbacks.get("t1")?.size).toBe(1);
    unmount();
    expect(dataCleanups[0]).toHaveBeenCalled();
  });

  it("captures a snapshot on teardown via onCaptureSnapshot", async () => {
    seedPanel("t1");
    const capture = vi.fn();
    const { unmount } = render(
      <MirrorTile terminalId="t1" isLive={true} onCaptureSnapshot={capture} />
    );
    await act(async () => {
      await flushRaf();
    });
    unmount();
    expect(capture).toHaveBeenCalledWith("t1", "<serialized>");
  });

  it("does NOT instantiate a Terminal when isLive=false", async () => {
    seedPanel("t1");
    render(<MirrorTile terminalId="t1" isLive={false} initialSnapshot="static snapshot" />);
    await act(async () => {
      await flushRaf();
    });
    expect(terminalInstances).toHaveLength(0);
  });

  it("swapping from live to static disposes the Terminal and preserves the snapshot branch", async () => {
    seedPanel("t1");
    const capture = vi.fn();
    const { rerender } = render(
      <MirrorTile terminalId="t1" isLive={true} onCaptureSnapshot={capture} />
    );
    await act(async () => {
      await flushRaf();
    });
    expect(terminalInstances).toHaveLength(1);

    rerender(
      <MirrorTile
        terminalId="t1"
        isLive={false}
        initialSnapshot="<serialized>"
        onCaptureSnapshot={capture}
      />
    );
    await act(async () => {
      await flushRaf();
    });
    expect(terminalInstances[0]!.dispose).toHaveBeenCalled();
    expect(capture).toHaveBeenCalledWith("t1", "<serialized>");
  });

  it("disposes the partially-constructed Terminal when onData throws", async () => {
    seedPanel("t1");
    onDataBehavior.shouldThrow = true;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<MirrorTile terminalId="t1" isLive={true} />);
    await act(async () => {
      await flushRaf();
    });
    // One Terminal was created before onData threw — it must be disposed
    // (no leak, no retry) even though no ref was ever published.
    expect(terminalInstances).toHaveLength(1);
    expect(terminalInstances[0]!.dispose).toHaveBeenCalled();
    expect(dataCallbacks.get("t1")).toBeUndefined();
    // The live-error surface is shown.
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("survives React 19 StrictMode double-invoke with exactly one active subscription", async () => {
    seedPanel("t1");
    const { unmount } = render(
      <StrictMode>
        <MirrorTile terminalId="t1" isLive={true} />
      </StrictMode>
    );
    await act(async () => {
      await flushRaf();
    });
    // After StrictMode's mount/cleanup/mount cycle there must be at most
    // one active data subscription (mountGeneration guard + dispose in
    // cleanup guarantees this).
    expect(dataCallbacks.get("t1")?.size ?? 0).toBe(1);
    unmount();
    expect(dataCallbacks.get("t1")?.size ?? 0).toBe(0);
  });
});
