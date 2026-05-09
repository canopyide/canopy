import { describe, expect, it, vi } from "vitest";
import type { ActionCallbacks, ActionRegistry, AnyActionDefinition } from "../../actionTypes";

vi.mock("@/store/panelStore", () => ({
  usePanelStore: { getState: vi.fn() },
}));
vi.mock("@/clients", () => ({ terminalClient: { submit: vi.fn() } }));
vi.mock("@shared/config/panelKindRegistry", () => ({
  panelKindHasPty: () => true,
}));

import { registerTerminalQueryActions } from "../terminalQueryActions";

function setupActions(): ActionRegistry {
  const actions: ActionRegistry = new Map();
  registerTerminalQueryActions(actions, {} as ActionCallbacks);
  return actions;
}

describe("terminal.waitUntilIdle action definition", () => {
  it("registers a manifest entry with query/safe/renderer metadata", () => {
    const def = setupActions().get("terminal.waitUntilIdle")?.() as AnyActionDefinition;
    expect(def).toBeDefined();
    expect(def.id).toBe("terminal.waitUntilIdle");
    expect(def.kind).toBe("query");
    expect(def.danger).toBe("safe");
    expect(def.scope).toBe("renderer");
    expect(def.mcpAnnotations?.readOnlyHint).toBe(true);
    expect(def.mcpAnnotations?.idempotentHint).toBe(false);
    expect(def.mcpAnnotations?.destructiveHint).toBe(false);
    expect(def.rawOutputSchema).toBeDefined();
  });

  it("validates required terminalId via the Zod argsSchema", () => {
    const def = setupActions().get("terminal.waitUntilIdle")?.() as AnyActionDefinition;
    expect(def.argsSchema?.safeParse({ terminalId: "term-1" }).success).toBe(true);
    expect(def.argsSchema?.safeParse({ terminalId: "" }).success).toBe(false);
    expect(def.argsSchema?.safeParse({}).success).toBe(false);
    expect(def.argsSchema?.safeParse({ terminalId: "term-1", timeoutMs: 0 }).success).toBe(true);
    // Negative timeout — rejected by min(0).
    expect(def.argsSchema?.safeParse({ terminalId: "term-1", timeoutMs: -1 }).success).toBe(false);
  });

  it("throws when run() is invoked through renderer dispatch", async () => {
    // Guard for the manifest-only registration: the action exists in the
    // registry purely so `ActionService.list()` advertises it through the
    // standard MCP manifest. Execution must stay in the main process — if
    // the renderer ever dispatches it directly (bypassing the CallTool
    // short-circuit), the throw catches the bug at the callsite rather
    // than silently returning a malformed result.
    const def = setupActions().get("terminal.waitUntilIdle")?.() as AnyActionDefinition;
    await expect(def.run({ terminalId: "term-1" }, {} as never)).rejects.toThrow(
      /must be invoked through the MCP main-process path/
    );
  });
});
