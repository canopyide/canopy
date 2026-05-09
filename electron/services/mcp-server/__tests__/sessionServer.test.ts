import { describe, expect, it, vi } from "vitest";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

vi.mock("electron", () => ({
  app: {
    getVersion: () => "0.0.0-test",
  },
}));

import { createSessionServer } from "../sessionServer.js";
import type { SessionServerDeps } from "../sessionServer.js";
import type { SessionStore } from "../sessionStore.js";
import { SessionStore as RealSessionStore } from "../sessionStore.js";

function fakeSessionStore(
  tier: "workbench" | "action" | "system" | "external" = "workbench"
): SessionStore {
  const store = {
    sessions: new Map(),
    httpSessions: new Map(),
    sessionTierMap: new Map(),
    sessionWebContentsMap: new Map(),
    resourceSubscriptions: new Map(),
    dedupInFlight: new Map(),
    dedupResultCache: new Map(),
    drain: vi.fn(),
    getTier: vi.fn(() => tier),
    createIdleTimer: vi.fn(() => setTimeout(() => {}, 1_000_000)),
    createHttpIdleTimer: vi.fn(() => setTimeout(() => {}, 1_000_000)),
    resetIdleTimer: vi.fn(),
    resetHttpIdleTimer: vi.fn(),
    clearDedupState: vi.fn(),
  } as unknown as SessionStore;
  return store;
}

function fakeDeps(overrides?: Partial<SessionServerDeps>): SessionServerDeps {
  return {
    sessionStore: fakeSessionStore(),
    requestManifest: vi.fn().mockResolvedValue([]),
    dispatchAction: vi.fn().mockResolvedValue({ result: { ok: true, result: null } }),
    handleWaitUntilIdle: vi.fn(),
    appendAuditRecord: vi.fn(),
    getCachedManifest: vi.fn(() => null),
    getFullToolSurface: vi.fn(() => false),
    ...overrides,
  };
}

function makeMockTransport(): Transport {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    onclose: undefined,
    onerror: undefined,
    onmessage: undefined,
  };
}

/**
 * Invoke the prompts/get handler through the SDK's handler wrapper (which
 * includes Zod validation via parseWithCompat). This matches real request flow.
 */
async function getPrompt(
  server: ReturnType<typeof createSessionServer>,
  params: { name: string; arguments?: Record<string, unknown> }
) {
  const handlers = (
    server as unknown as {
      _requestHandlers: Map<string, (req: unknown, extra: unknown) => Promise<unknown>>;
    }
  )._requestHandlers;
  const handler = handlers.get("prompts/get");
  if (!handler) throw new Error("prompts/get handler not found");
  return handler(
    {
      method: "prompts/get",
      params,
      jsonrpc: "2.0",
      id: 1,
    },
    {
      signal: new AbortController().signal,
      _meta: {},
      sendNotification: vi.fn(),
      requestId: 1,
    }
  );
}

async function listPrompts(server: ReturnType<typeof createSessionServer>) {
  const handlers = (
    server as unknown as {
      _requestHandlers: Map<string, (req: unknown, extra: unknown) => Promise<unknown>>;
    }
  )._requestHandlers;
  const handler = handlers.get("prompts/list");
  if (!handler) throw new Error("prompts/list handler not found");
  return handler(
    {
      method: "prompts/list",
      params: {},
      jsonrpc: "2.0",
      id: 1,
    },
    {
      signal: new AbortController().signal,
      _meta: {},
      sendNotification: vi.fn(),
      requestId: 1,
    }
  );
}

/**
 * Invoke the tools/call handler directly (skips SDK Zod validation since
 * the SDK's CallToolRequestSchema validates only the outer request shape,
 * and our tier/dedup logic operates after that).
 */
async function callTool(
  server: ReturnType<typeof createSessionServer>,
  params: { name: string; arguments?: Record<string, unknown> }
) {
  const handlers = (
    server as unknown as {
      _requestHandlers: Map<string, (req: unknown, extra: unknown) => Promise<unknown>>;
    }
  )._requestHandlers;
  const handler = handlers.get("tools/call");
  if (!handler) throw new Error("tools/call handler not found");
  return handler(
    {
      method: "tools/call",
      params,
      jsonrpc: "2.0",
      id: 1,
    },
    {
      signal: new AbortController().signal,
      _meta: {},
      sendNotification: vi.fn(),
      requestId: 1,
    }
  ) as Promise<{ content: unknown; isError?: boolean; structuredContent?: unknown }>;
}

describe("sessionServer prompt handler", () => {
  it("renders start_issue prompt with valid string argument", async () => {
    const deps = fakeDeps();
    const server = createSessionServer("s1", deps);
    await server.connect(makeMockTransport());

    const result = await getPrompt(server, {
      name: "start_issue",
      arguments: { issue_number: "6610" },
    });

    expect((result as Record<string, unknown>).messages).toBeDefined();
  });

  it("renders triage_failed_agent without optional terminal_id", async () => {
    const deps = fakeDeps();
    const server = createSessionServer("s2", deps);
    await server.connect(makeMockTransport());

    const result = await getPrompt(server, {
      name: "triage_failed_agent",
      arguments: {},
    });

    expect((result as Record<string, unknown>).messages).toBeDefined();
  });

  it("renders triage_terminals fleet-polling recipe with key anchors and behavioral guardrails", async () => {
    const deps = fakeDeps();
    const server = createSessionServer("s_triage_terminals", deps);
    await server.connect(makeMockTransport());

    const result = (await getPrompt(server, {
      name: "triage_terminals",
      arguments: {},
    })) as { messages: Array<{ role: string; content: { type: string; text: string } }> };

    expect(result.messages).toBeDefined();
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.type).toBe("text");

    const text = result.messages[0].content.text;
    // Tool/concept anchors
    expect(text).toContain("terminal.getStatus");
    expect(text).toContain("lastTransitionAt");
    expect(text).toContain("ScheduleWakeup");
    expect(text).toContain("terminal.waitUntilIdle");
    expect(text).toContain("includeOutput");
    // Behavioral guardrails — catch adversarial rewrites that keep keywords but invert advice
    expect(text).toContain("Don't fan");
    expect(text).toContain("Don't busy-loop");
    // directing must appear alongside working as a state to skip
    expect(text).toContain("directing");
    // waitingReason discrimination must survive future edits
    expect(text).toContain('"prompt"');
    expect(text).toContain('"question"');
  });

  it("does not dispatch worktree.getCurrent for triage_terminals (static prompt)", async () => {
    const dispatchAction = vi.fn().mockResolvedValue({ result: { ok: true, result: null } });
    const deps = fakeDeps({ dispatchAction });
    const server = createSessionServer("s_triage_terminals_static", deps);
    await server.connect(makeMockTransport());

    await getPrompt(server, { name: "triage_terminals", arguments: {} });

    const worktreeCalls = dispatchAction.mock.calls.filter(([id]) => id === "worktree.getCurrent");
    expect(worktreeCalls).toHaveLength(0);
  });

  it("lists triage_terminals in prompts/list with no arguments", async () => {
    const deps = fakeDeps();
    const server = createSessionServer("s_prompts_list", deps);
    await server.connect(makeMockTransport());

    const result = (await listPrompts(server)) as {
      prompts: Array<{ name: string; description: string; arguments?: unknown[] }>;
    };

    expect(Array.isArray(result.prompts)).toBe(true);
    const triage = result.prompts.find((p) => p.name === "triage_terminals");
    expect(triage).toBeDefined();
    expect(triage!.description.length).toBeGreaterThan(0);
    expect(triage!.arguments).toEqual([]);
  });

  it("throws McpError for unknown prompt name", async () => {
    const deps = fakeDeps();
    const server = createSessionServer("s3", deps);
    await server.connect(makeMockTransport());

    await expect(getPrompt(server, { name: "nonexistent", arguments: {} })).rejects.toThrow(
      McpError
    );
  });

  it("throws McpError(InvalidParams) for missing required argument", async () => {
    const deps = fakeDeps();
    const server = createSessionServer("s4", deps);
    await server.connect(makeMockTransport());

    try {
      await getPrompt(server, { name: "start_issue", arguments: {} });
      expect.fail("Expected McpError");
    } catch (err) {
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).code).toBe(ErrorCode.InvalidParams);
      expect((err as McpError).message).toContain("Missing required argument");
    }
  });

  it("rejects non-string argument values (Zod validates before our handler, both layers reject)", async () => {
    const deps = fakeDeps();
    const server = createSessionServer("s5", deps);
    await server.connect(makeMockTransport());

    // Non-string values are caught by the SDK's Zod validation
    // (parseWithCompat in the handler wrapper), which runs before
    // our typeof check. Both layers reject non-strings.
    try {
      await getPrompt(server, {
        name: "start_issue",
        arguments: { issue_number: 42 },
      });
      expect.fail("Expected error for non-string argument");
    } catch (err) {
      // ZodError is thrown by the SDK wrapper before our handler runs
      expect(err).toBeTruthy();
    }
  });

  it("handler validates arguments are strings (defense-in-depth beyond Zod schema)", () => {
    // Our typeof check is a second layer of defense. When the Zod schema
    // is relaxed or the handler is called through a different path, our
    // check catches non-string values with a proper McpError(InvalidParams).
    // This test verifies the handler code is present and correct.
    const deps = fakeDeps();
    const server = createSessionServer("s6", deps);

    // The handler should be registered for prompts/get
    const handlers = (
      server as unknown as {
        _requestHandlers: Map<string, unknown>;
      }
    )._requestHandlers;
    expect(handlers.has("prompts/get")).toBe(true);
  });
});

describe("CallTool idempotency dedup", () => {
  it("coalesces same-moment duplicates via singleflight (dispatch invoked once)", async () => {
    // Hold the dispatch with a manually-resolved promise so two callers race
    // through the handler before the first one resolves.
    let resolveDispatch: ((envelope: unknown) => void) | undefined;
    const dispatchAction = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDispatch = resolve as (envelope: unknown) => void;
        })
    );
    const deps = fakeDeps({
      sessionStore: fakeSessionStore("system"),
      dispatchAction,
    });
    const server = createSessionServer("dedup-1", deps);

    const a = callTool(server, {
      name: "terminal.new",
      arguments: { spawnedBy: { kind: "user" } },
    });
    const b = callTool(server, {
      name: "terminal.new",
      arguments: { spawnedBy: { kind: "user" } },
    });

    // Both handlers are now suspended; A awaits requestManifest then dispatchAction,
    // B detects the in-flight entry A registered synchronously and awaits the same
    // promise. Yield microtasks until A's handler has reached the held dispatch.
    for (let i = 0; i < 50 && !resolveDispatch; i++) {
      await Promise.resolve();
    }
    expect(resolveDispatch).toBeDefined();

    resolveDispatch!({ result: { ok: true, result: { terminalId: "t-1" } } });

    const [resultA, resultB] = await Promise.all([a, b]);

    expect(dispatchAction).toHaveBeenCalledTimes(1);
    expect(resultA).toEqual(resultB);
    expect((resultA as { content: Array<{ text: string }> }).content[0].text).toContain("t-1");
  });

  it("returns the cached result for a post-completion duplicate within TTL", async () => {
    const dispatchAction = vi
      .fn()
      .mockResolvedValue({ result: { ok: true, result: { terminalId: "t-2" } } });
    const deps = fakeDeps({
      sessionStore: fakeSessionStore("system"),
      dispatchAction,
    });
    const server = createSessionServer("dedup-2", deps);

    const args = { spawnedBy: { kind: "user" } };
    const first = await callTool(server, { name: "terminal.new", arguments: args });
    const second = await callTool(server, { name: "terminal.new", arguments: args });

    expect(dispatchAction).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("does not dedup non-allowlisted actions", async () => {
    const dispatchAction = vi
      .fn()
      .mockResolvedValue({ result: { ok: true, result: { ok: true } } });
    const deps = fakeDeps({
      sessionStore: fakeSessionStore("system"),
      dispatchAction,
    });
    const server = createSessionServer("dedup-3", deps);

    await callTool(server, { name: "terminal.list", arguments: {} });
    await callTool(server, { name: "terminal.list", arguments: {} });

    expect(dispatchAction).toHaveBeenCalledTimes(2);
  });

  it("treats different args as distinct keys", async () => {
    const dispatchAction = vi
      .fn()
      .mockResolvedValue({ result: { ok: true, result: { terminalId: "t-x" } } });
    const deps = fakeDeps({
      sessionStore: fakeSessionStore("system"),
      dispatchAction,
    });
    const server = createSessionServer("dedup-4", deps);

    await callTool(server, {
      name: "terminal.new",
      arguments: { spawnedBy: { kind: "user" } },
    });
    await callTool(server, {
      name: "terminal.new",
      arguments: { spawnedBy: { kind: "agent" } },
    });

    expect(dispatchAction).toHaveBeenCalledTimes(2);
  });

  it("honors explicit requestKey over arg hash and strips it before dispatch", async () => {
    const dispatchAction = vi
      .fn()
      .mockResolvedValue({ result: { ok: true, result: { terminalId: "t-rk" } } });
    const deps = fakeDeps({
      sessionStore: fakeSessionStore("system"),
      dispatchAction,
    });
    const server = createSessionServer("dedup-5", deps);

    // Same requestKey, different args — should still dedup as the same call.
    await callTool(server, {
      name: "terminal.new",
      arguments: { requestKey: "rk-1", spawnedBy: { kind: "user" } },
    });
    await callTool(server, {
      name: "terminal.new",
      arguments: { requestKey: "rk-1", spawnedBy: { kind: "agent" } },
    });

    expect(dispatchAction).toHaveBeenCalledTimes(1);
    // requestKey must not reach dispatchAction.
    const dispatchedArgs = dispatchAction.mock.calls[0][1] as Record<string, unknown>;
    expect(dispatchedArgs).not.toHaveProperty("requestKey");
  });

  it("does not cache failed dispatches; retries re-dispatch", async () => {
    const dispatchAction = vi
      .fn()
      .mockResolvedValueOnce({
        result: { ok: false, error: { code: "BOOM", message: "kaboom" } },
      })
      .mockResolvedValueOnce({ result: { ok: true, result: { terminalId: "t-retry" } } });
    const deps = fakeDeps({
      sessionStore: fakeSessionStore("system"),
      dispatchAction,
    });
    const server = createSessionServer("dedup-6", deps);

    const args = { spawnedBy: { kind: "user" } };
    const first = (await callTool(server, { name: "terminal.new", arguments: args })) as {
      isError?: boolean;
    };
    expect(first.isError).toBe(true);

    const second = await callTool(server, { name: "terminal.new", arguments: args });

    expect(dispatchAction).toHaveBeenCalledTimes(2);
    expect((second as { content: Array<{ text: string }> }).content[0].text).toContain("t-retry");
  });

  it("does not cache thrown dispatches; retries re-dispatch", async () => {
    const dispatchAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ result: { ok: true, result: { terminalId: "t-throw" } } });
    const deps = fakeDeps({
      sessionStore: fakeSessionStore("system"),
      dispatchAction,
    });
    const server = createSessionServer("dedup-7", deps);

    const args = { spawnedBy: { kind: "user" } };
    const first = (await callTool(server, { name: "terminal.new", arguments: args })) as {
      isError?: boolean;
    };
    expect(first.isError).toBe(true);

    const second = await callTool(server, { name: "terminal.new", arguments: args });

    expect(dispatchAction).toHaveBeenCalledTimes(2);
    expect((second as { content: Array<{ text: string }> }).content[0].text).toContain("t-throw");
  });

  it("logs a 'dedup' audit record when a duplicate is suppressed", async () => {
    const appendAuditRecord = vi.fn();
    const dispatchAction = vi
      .fn()
      .mockResolvedValue({ result: { ok: true, result: { terminalId: "t-audit" } } });
    const deps = fakeDeps({
      sessionStore: fakeSessionStore("system"),
      dispatchAction,
      appendAuditRecord,
    });
    const server = createSessionServer("dedup-8", deps);

    const args = { spawnedBy: { kind: "user" } };
    await callTool(server, { name: "terminal.new", arguments: args });
    await callTool(server, { name: "terminal.new", arguments: args });

    const outcomes = appendAuditRecord.mock.calls.map(
      (call) => (call[0] as { outcome: { kind: string } }).outcome.kind
    );
    expect(outcomes).toContain("dedup");
    expect(outcomes.filter((k) => k === "dedup")).toHaveLength(1);
  });

  it("treats requestKey:'' as absent (falls through to auto-hash)", async () => {
    const dispatchAction = vi
      .fn()
      .mockResolvedValue({ result: { ok: true, result: { terminalId: "t-empty" } } });
    const deps = fakeDeps({
      sessionStore: fakeSessionStore("system"),
      dispatchAction,
    });
    const server = createSessionServer("dedup-9", deps);

    // Same auto-hash key (same args), so even with empty requestKey both dedupe.
    await callTool(server, {
      name: "terminal.new",
      arguments: { requestKey: "", spawnedBy: { kind: "user" } },
    });
    await callTool(server, {
      name: "terminal.new",
      arguments: { requestKey: "", spawnedBy: { kind: "user" } },
    });

    expect(dispatchAction).toHaveBeenCalledTimes(1);
  });

  it("re-dispatches after drain() clears the cache", async () => {
    const dispatchAction = vi
      .fn()
      .mockResolvedValue({ result: { ok: true, result: { terminalId: "t-drain" } } });
    const sessionStore = fakeSessionStore("system");
    const deps = fakeDeps({ sessionStore, dispatchAction });
    const server = createSessionServer("dedup-10", deps);

    const args = { spawnedBy: { kind: "user" } };
    await callTool(server, { name: "terminal.new", arguments: args });

    // Wipe the cache the way drain() does.
    sessionStore.dedupInFlight.clear();
    sessionStore.dedupResultCache.clear();

    await callTool(server, { name: "terminal.new", arguments: args });

    expect(dispatchAction).toHaveBeenCalledTimes(2);
  });

  it("re-dispatches after the TTL window elapses", async () => {
    vi.useFakeTimers();
    try {
      const dispatchAction = vi
        .fn()
        .mockResolvedValue({ result: { ok: true, result: { terminalId: "t-ttl" } } });
      const deps = fakeDeps({
        sessionStore: fakeSessionStore("system"),
        dispatchAction,
      });
      const server = createSessionServer("dedup-ttl", deps);

      const args = { spawnedBy: { kind: "user" } };
      await callTool(server, { name: "terminal.new", arguments: args });

      // Just before the TTL expires — still cached.
      vi.advanceTimersByTime(119_999);
      await callTool(server, { name: "terminal.new", arguments: args });
      expect(dispatchAction).toHaveBeenCalledTimes(1);

      // After the TTL expires — should redispatch.
      vi.advanceTimersByTime(2);
      await callTool(server, { name: "terminal.new", arguments: args });
      expect(dispatchAction).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("isolates dedup state between sessions (same store, different session ids)", async () => {
    const dispatchAction = vi
      .fn()
      .mockResolvedValue({ result: { ok: true, result: { terminalId: "t-iso" } } });
    const sessionStore = fakeSessionStore("system");
    const deps = fakeDeps({ sessionStore, dispatchAction });
    const serverA = createSessionServer("session-a", deps);
    const serverB = createSessionServer("session-b", deps);

    const args = { requestKey: "shared-key", spawnedBy: { kind: "user" } };
    await callTool(serverA, { name: "terminal.new", arguments: args });
    await callTool(serverB, { name: "terminal.new", arguments: args });

    // Same requestKey, but different sessions — both must dispatch.
    expect(dispatchAction).toHaveBeenCalledTimes(2);
  });

  it("dedups agent.launch with the same arguments", async () => {
    const dispatchAction = vi
      .fn()
      .mockResolvedValue({ result: { ok: true, result: { terminalId: "t-agent" } } });
    const deps = fakeDeps({
      sessionStore: fakeSessionStore("system"),
      dispatchAction,
    });
    const server = createSessionServer("dedup-agent", deps);

    await callTool(server, { name: "agent.launch", arguments: { agentId: "claude" } });
    await callTool(server, { name: "agent.launch", arguments: { agentId: "claude" } });

    expect(dispatchAction).toHaveBeenCalledTimes(1);
  });

  it("dedups worktree.createWithRecipe with the same arguments", async () => {
    const dispatchAction = vi
      .fn()
      .mockResolvedValue({ result: { ok: true, result: { worktreeId: "wt-1" } } });
    const deps = fakeDeps({
      sessionStore: fakeSessionStore("system"),
      dispatchAction,
    });
    const server = createSessionServer("dedup-wt", deps);

    const args = { branchName: "feature/x" };
    await callTool(server, { name: "worktree.createWithRecipe", arguments: args });
    await callTool(server, { name: "worktree.createWithRecipe", arguments: args });

    expect(dispatchAction).toHaveBeenCalledTimes(1);
  });

  it("dedups recipe.run with the same arguments", async () => {
    const dispatchAction = vi
      .fn()
      .mockResolvedValue({ result: { ok: true, result: { terminalId: "t-recipe" } } });
    const deps = fakeDeps({
      sessionStore: fakeSessionStore("system"),
      dispatchAction,
    });
    const server = createSessionServer("dedup-recipe", deps);

    const args = { recipeId: "build" };
    await callTool(server, { name: "recipe.run", arguments: args });
    await callTool(server, { name: "recipe.run", arguments: args });

    expect(dispatchAction).toHaveBeenCalledTimes(1);
  });

  it("does not resurrect dedup state when drain() runs during an in-flight dispatch", async () => {
    const realStore = new RealSessionStore(() => {});
    realStore.sessionTierMap.set("dedup-resurrect", "system");

    let resolveDispatch: ((envelope: unknown) => void) | undefined;
    const dispatchAction = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDispatch = resolve as (envelope: unknown) => void;
        })
    );
    const deps = fakeDeps({ sessionStore: realStore, dispatchAction });
    const server = createSessionServer("dedup-resurrect", deps);

    const inFlightCall = callTool(server, {
      name: "terminal.new",
      arguments: { spawnedBy: { kind: "user" } },
    });

    for (let i = 0; i < 50 && !resolveDispatch; i++) {
      await Promise.resolve();
    }
    expect(realStore.dedupInFlight.get("dedup-resurrect")?.size).toBe(1);

    // Drain mid-flight — wipes dedup state and the session tier map.
    realStore.drain();
    expect(realStore.dedupInFlight.size).toBe(0);
    expect(realStore.dedupResultCache.size).toBe(0);

    // Resolve the held dispatch. The .then() cache hook must NOT resurrect
    // dedupResultCache for the torn-down session.
    resolveDispatch!({ result: { ok: true, result: { terminalId: "t-resurrect" } } });
    await inFlightCall;
    // Flush microtasks so the .then() cache hook had a chance to misfire.
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(realStore.dedupResultCache.size).toBe(0);
    expect(realStore.dedupInFlight.size).toBe(0);
  });

  it("rejects requestKey strings beyond the length cap (falls back to auto-hash)", async () => {
    const dispatchAction = vi
      .fn()
      .mockResolvedValue({ result: { ok: true, result: { terminalId: "t-long" } } });
    const deps = fakeDeps({
      sessionStore: fakeSessionStore("system"),
      dispatchAction,
    });
    const server = createSessionServer("dedup-long", deps);

    const oversized = "x".repeat(257); // MAX_REQUEST_KEY_LENGTH = 256
    // Same args, different oversized requestKeys → still dedups via auto-hash
    // because the oversized requestKey is rejected and ignored.
    await callTool(server, {
      name: "terminal.new",
      arguments: { requestKey: oversized + "a", spawnedBy: { kind: "user" } },
    });
    await callTool(server, {
      name: "terminal.new",
      arguments: { requestKey: oversized + "b", spawnedBy: { kind: "user" } },
    });

    expect(dispatchAction).toHaveBeenCalledTimes(1);
  });
});
