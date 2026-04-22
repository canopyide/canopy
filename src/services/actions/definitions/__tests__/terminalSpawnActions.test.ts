import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionCallbacks, ActionRegistry, AnyActionDefinition } from "../../actionTypes";
import type { AddPanelOptions } from "@/store/slices/panelRegistry/types";

const panelStoreMock = vi.hoisted(() => ({ getState: vi.fn() }));
const layoutUndoMock = vi.hoisted(() => ({
  getState: vi.fn(() => ({ pushLayoutSnapshot: vi.fn() })),
}));
const buildPanelDuplicateOptionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/store/panelStore", () => ({ usePanelStore: panelStoreMock }));
vi.mock("@/store/layoutUndoStore", () => ({ useLayoutUndoStore: layoutUndoMock }));
vi.mock("@/services/terminal/panelDuplicationService", () => ({
  buildPanelDuplicateOptions: buildPanelDuplicateOptionsMock,
}));

vi.mock("@shared/config/panelKindRegistry", () => ({
  getDefaultPanelTitle: (kind: string, agentId?: string) => {
    if (kind === "agent" && agentId === "claude") return "Claude";
    if (kind === "agent" && agentId === "gemini") return "Gemini";
    if (kind === "terminal") return "Terminal";
    if (kind === "browser") return "Browser";
    if (kind === "notes") return "Notes";
    if (kind === "dev-preview") return "Dev Preview";
    return kind.charAt(0).toUpperCase() + kind.slice(1);
  },
}));

import { registerTerminalSpawnActions } from "../terminalSpawnActions";

function setupActions() {
  const actions: ActionRegistry = new Map();
  const callbacks: ActionCallbacks = {
    getDefaultCwd: () => "/cwd",
    getActiveWorktreeId: () => "wt-1",
  } as unknown as ActionCallbacks;
  registerTerminalSpawnActions(actions, callbacks);
  return async (id: string, args?: unknown): Promise<unknown> => {
    const factory = actions.get(id);
    if (!factory) throw new Error(`missing ${id}`);
    const def = factory() as AnyActionDefinition;
    return def.run(args, {} as never);
  };
}

type MockPanel = {
  id: string;
  location: "grid" | "dock" | "trash";
  kind?: "agent" | "terminal" | "browser" | "notes" | "dev-preview";
  type?: string;
  agentId?: string;
  title?: string;
};

function setPanelState(options: {
  focusedId?: string | null;
  panels?: MockPanel[];
  addPanel?: ReturnType<typeof vi.fn>;
  lastClosedConfig?: AddPanelOptions | null;
}) {
  const panels = options.panels ?? [];
  const panelsById: Record<string, MockPanel> = {};
  for (const p of panels) panelsById[p.id] = p;
  panelStoreMock.getState.mockReturnValue({
    focusedId: options.focusedId ?? null,
    panelIds: panels.map((p) => p.id),
    panelsById,
    addPanel: options.addPanel ?? vi.fn().mockResolvedValue(undefined),
    lastClosedConfig: options.lastClosedConfig ?? null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  buildPanelDuplicateOptionsMock.mockImplementation(
    async (panel: MockPanel, location: "grid" | "dock") => ({
      kind: panel.kind ?? "terminal",
      type: panel.type,
      agentId: panel.agentId,
      title: panel.title,
      location,
      cwd: "",
    })
  );
});

describe("terminal.duplicate (copy) suffix", () => {
  it("does not append (copy) when agent panel title matches the default", async () => {
    const addPanel = vi.fn().mockResolvedValue(undefined);
    setPanelState({
      focusedId: "p1",
      panels: [{ id: "p1", location: "grid", kind: "agent", agentId: "claude", title: "Claude" }],
      addPanel,
    });
    const run = setupActions();
    await run("terminal.duplicate");

    expect(addPanel).toHaveBeenCalledTimes(1);
    expect(addPanel.mock.calls[0]![0].title).toBe("Claude");
  });

  it("appends (copy) when agent panel title is user-customized", async () => {
    const addPanel = vi.fn().mockResolvedValue(undefined);
    setPanelState({
      focusedId: "p1",
      panels: [{ id: "p1", location: "grid", kind: "agent", agentId: "claude", title: "API work" }],
      addPanel,
    });
    const run = setupActions();
    await run("terminal.duplicate");

    expect(addPanel.mock.calls[0]![0].title).toBe("API work (copy)");
  });

  it("does not append (copy) for a default-titled terminal panel", async () => {
    const addPanel = vi.fn().mockResolvedValue(undefined);
    setPanelState({
      focusedId: "p1",
      panels: [
        { id: "p1", location: "grid", kind: "terminal", type: "terminal", title: "Terminal" },
      ],
      addPanel,
    });
    const run = setupActions();
    await run("terminal.duplicate");

    expect(addPanel.mock.calls[0]![0].title).toBe("Terminal");
  });

  it("appends (copy) when Gemini panel is renamed", async () => {
    const addPanel = vi.fn().mockResolvedValue(undefined);
    setPanelState({
      focusedId: "p1",
      panels: [
        { id: "p1", location: "grid", kind: "agent", agentId: "gemini", title: "Refactor run" },
      ],
      addPanel,
    });
    const run = setupActions();
    await run("terminal.duplicate");

    expect(addPanel.mock.calls[0]![0].title).toBe("Refactor run (copy)");
  });

  it("leaves title untouched when source panel has no title", async () => {
    const addPanel = vi.fn().mockResolvedValue(undefined);
    setPanelState({
      focusedId: "p1",
      panels: [{ id: "p1", location: "grid", kind: "terminal", type: "terminal" }],
      addPanel,
    });
    const run = setupActions();
    await run("terminal.duplicate");

    expect(addPanel.mock.calls[0]![0].title).toBeUndefined();
  });

  it("does not append (copy) for a default-titled browser panel", async () => {
    const addPanel = vi.fn().mockResolvedValue(undefined);
    setPanelState({
      focusedId: "p1",
      panels: [{ id: "p1", location: "grid", kind: "browser", title: "Browser" }],
      addPanel,
    });
    const run = setupActions();
    await run("terminal.duplicate");

    expect(addPanel.mock.calls[0]![0].title).toBe("Browser");
  });
});
