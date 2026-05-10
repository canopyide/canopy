import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionCallbacks, ActionRegistry, AnyActionDefinition } from "../../actionTypes";

const panelStoreMock = vi.hoisted(() => ({ getState: vi.fn() }));
const terminalInstanceServiceMock = vi.hoisted(() => ({
  focus: vi.fn(),
  cleanup: vi.fn(),
  applyRendererPolicy: vi.fn(),
  resetRenderer: vi.fn(),
}));
const terminalClientMock = vi.hoisted(() => ({
  killTerminal: vi.fn().mockResolvedValue(undefined),
}));
const fireWatchNotificationMock = vi.hoisted(() => vi.fn());

vi.mock("@/store/panelStore", () => ({ usePanelStore: panelStoreMock }));
vi.mock("@/services/terminal/TerminalInstanceService", () => ({
  terminalInstanceService: terminalInstanceServiceMock,
}));
vi.mock("@/clients", () => ({ terminalClient: terminalClientMock }));
vi.mock("@/lib/watchNotification", () => ({
  fireWatchNotification: fireWatchNotificationMock,
}));

import { registerTerminalLifecycleActions } from "../terminalLifecycleActions";

type MockPanel = { id: string; location: "grid" | "dock" | "trash" };

function setPanelState(options: {
  focusedId?: string | null;
  panels?: MockPanel[];
  trashPanel?: ReturnType<typeof vi.fn>;
  postTrashFocusedId?: string | null;
}) {
  const panels = options.panels ?? [];
  const panelsById: Record<string, MockPanel> = {};
  for (const p of panels) panelsById[p.id] = p;
  let focusedId = options.focusedId ?? null;
  const trashPanel =
    options.trashPanel ??
    vi.fn(() => {
      if (options.postTrashFocusedId !== undefined) {
        focusedId = options.postTrashFocusedId;
      }
    });
  panelStoreMock.getState.mockImplementation(() => ({
    focusedId,
    panelIds: panels.map((p) => p.id),
    panelsById,
    trashPanel,
  }));
  return { trashPanel };
}

function setupActions() {
  const actions: ActionRegistry = new Map();
  const callbacks = {} as unknown as ActionCallbacks;
  registerTerminalLifecycleActions(actions, callbacks);
  return async (id: string, args?: unknown): Promise<unknown> => {
    const factory = actions.get(id);
    if (!factory) throw new Error(`missing ${id}`);
    const def = factory() as AnyActionDefinition;
    return def.run(args, {} as never);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("terminal.close DOM focus handoff", () => {
  it("focuses the next panel after trashing the focused panel", async () => {
    const { trashPanel } = setPanelState({
      focusedId: "p1",
      panels: [
        { id: "p1", location: "grid" },
        { id: "p2", location: "grid" },
      ],
      postTrashFocusedId: "p2",
    });
    const run = setupActions();

    await run("terminal.close");

    expect(trashPanel).toHaveBeenCalledWith("p1");
    expect(terminalInstanceServiceMock.focus).toHaveBeenCalledWith("p2");
    expect(terminalInstanceServiceMock.focus).toHaveBeenCalledTimes(1);
  });

  it("does not focus anything when the last grid panel is closed", async () => {
    setPanelState({
      focusedId: "p1",
      panels: [{ id: "p1", location: "grid" }],
      postTrashFocusedId: null,
    });
    const run = setupActions();

    await run("terminal.close");

    expect(terminalInstanceServiceMock.focus).not.toHaveBeenCalled();
  });

  it("focuses the post-trash panel when called with an explicit terminalId", async () => {
    const { trashPanel } = setPanelState({
      focusedId: "p2",
      panels: [
        { id: "p1", location: "grid" },
        { id: "p2", location: "grid" },
      ],
      postTrashFocusedId: "p2",
    });
    const run = setupActions();

    await run("terminal.close", { terminalId: "p1" });

    expect(trashPanel).toHaveBeenCalledWith("p1");
    expect(terminalInstanceServiceMock.focus).toHaveBeenCalledWith("p2");
  });

  it("does not call trashPanel or focus when no targetable panel exists", async () => {
    const { trashPanel } = setPanelState({
      focusedId: null,
      panels: [{ id: "p1", location: "trash" }],
      postTrashFocusedId: null,
    });
    const run = setupActions();

    await run("terminal.close");

    expect(trashPanel).not.toHaveBeenCalled();
    expect(terminalInstanceServiceMock.focus).not.toHaveBeenCalled();
  });
});

describe("terminal.rename DOM handoff", () => {
  it("opens the inline rename input from a timer", async () => {
    vi.useFakeTimers();
    class TestCustomEvent<T = unknown> extends Event {
      readonly detail: T;

      constructor(type: string, eventInitDict?: CustomEventInit<T>) {
        super(type);
        this.detail = eventInitDict?.detail as T;
      }
    }
    const eventTarget = new EventTarget();
    const testWindow = {
      addEventListener: eventTarget.addEventListener.bind(eventTarget),
      removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    } as unknown as Window;
    vi.stubGlobal("window", testWindow);
    vi.stubGlobal("CustomEvent", TestCustomEvent);

    const renameEvents: CustomEvent[] = [];
    const handleRename = (event: Event) => {
      renameEvents.push(event as CustomEvent);
    };
    window.addEventListener("daintree:rename-terminal", handleRename);

    try {
      setPanelState({
        focusedId: "p1",
        panels: [{ id: "p1", location: "grid" }],
      });
      const run = setupActions();

      await run("terminal.rename", { terminalId: "p1" });

      expect(renameEvents).toHaveLength(0);
      await vi.runOnlyPendingTimersAsync();
      expect(renameEvents).toHaveLength(1);
      expect(renameEvents[0]?.detail).toEqual({ id: "p1" });
    } finally {
      window.removeEventListener("daintree:rename-terminal", handleRename);
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
