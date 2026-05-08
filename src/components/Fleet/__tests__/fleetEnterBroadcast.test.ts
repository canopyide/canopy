// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useFleetArmingStore } from "@/store/fleetArmingStore";
import { useFleetFailureStore } from "@/store/fleetFailureStore";
import { useFleetBroadcastConfirmStore } from "@/store/fleetBroadcastConfirmStore";
import { useFleetBroadcastProgressStore } from "@/store/fleetBroadcastProgressStore";
import { useAnnouncerStore } from "@/store/accessibilityAnnouncerStore";
import { usePanelStore } from "@/store/panelStore";
import type { TerminalInstance } from "@shared/types";

const submitMock = vi.fn<(id: string, text: string) => Promise<void>>();

vi.mock("@/clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/clients")>();
  return {
    ...actual,
    terminalClient: {
      ...actual.terminalClient,
      submit: (id: string, text: string) => submitMock(id, text),
    },
  };
});

import { cancelActiveBroadcast, tryFleetBroadcastFromEditor } from "../fleetEnterBroadcast";

function makeAgent(id: string): TerminalInstance {
  return {
    id,
    title: id,
    kind: "terminal",
    detectedAgentId: "claude",
    worktreeId: "wt-1",
    projectId: "proj-1",
    location: "grid",
    agentState: "idle",
    hasPty: true,
  } as TerminalInstance;
}

function arm(ids: string[]): void {
  const panelsById: Record<string, TerminalInstance> = {};
  for (const id of ids) panelsById[id] = makeAgent(id);
  usePanelStore.setState({ panelsById, panelIds: ids });
  useFleetArmingStore.getState().armIds(ids);
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  submitMock.mockReset();
  submitMock.mockResolvedValue(undefined);
  useFleetArmingStore.setState({
    armedIds: new Set<string>(),
    armOrder: [],
    armOrderById: {},
    lastArmedId: null,
  });
  usePanelStore.setState({ panelsById: {}, panelIds: [] });
  useFleetFailureStore.getState().clear();
  useFleetBroadcastConfirmStore.setState({ pending: null });
  useFleetBroadcastProgressStore.setState({
    completed: 0,
    total: 0,
    failed: 0,
    isActive: false,
    cancelled: false,
  });
  useAnnouncerStore.setState({ polite: null, assertive: null, nextId: 1 });
  Object.assign(window, {
    electron: {
      notification: {
        playUiEvent: vi.fn().mockResolvedValue(undefined),
      },
    },
  });
});

describe("tryFleetBroadcastFromEditor — a11y announcements", () => {
  it("announces 'Broadcast sent to N terminals' on full success (plural)", async () => {
    arm(["a", "b", "c"]);
    const onSent = vi.fn();
    const consumed = tryFleetBroadcastFromEditor("a", "hello", onSent);
    expect(consumed).toBe(true);
    await flush();
    expect(useAnnouncerStore.getState().polite?.msg).toBe("Broadcast sent to 3 terminals");
    expect(onSent).toHaveBeenCalled();
  });

  it("announces singular form when exactly one target succeeds", async () => {
    // Two armed; only one fires successfully (dead pty rejects).
    submitMock.mockImplementation(async (id) => {
      if (id === "b") throw new Error("EPIPE");
    });
    arm(["a", "b"]);
    const onSent = vi.fn();
    tryFleetBroadcastFromEditor("a", "hello", onSent);
    await flush();
    // Partial failure path — N=1 success, 1 failure.
    expect(useAnnouncerStore.getState().polite?.msg).toBe("Broadcast sent to 1 — 1 failed");
  });

  it("announces partial failure with success/failure split", async () => {
    submitMock.mockImplementation(async (id) => {
      if (id === "c") throw new Error("EPIPE");
    });
    arm(["a", "b", "c"]);
    tryFleetBroadcastFromEditor("a", "hello", vi.fn());
    await flush();
    expect(useAnnouncerStore.getState().polite?.msg).toBe("Broadcast sent to 2 — 1 failed");
  });
});

describe("cancelActiveBroadcast", () => {
  it("aborts the in-flight controller so the run finalizes as cancelled", async () => {
    arm(["a", "b", "c"]);

    // Hold each submit open until we explicitly resolve it. Cancelling
    // while submits are parked guarantees the executor sees signal.aborted
    // when the non-batched allSettled finally resolves.
    const pending: Array<() => void> = [];
    submitMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          pending.push(resolve);
        })
    );

    const onSent = vi.fn();
    const consumed = tryFleetBroadcastFromEditor("a", "hello", onSent);
    expect(consumed).toBe(true);

    // Yield until the submits are in-flight.
    while (pending.length === 0) await flush();

    cancelActiveBroadcast();
    expect(useFleetBroadcastProgressStore.getState().cancelled).toBe(true);

    // Resolve the parked submits so allSettled completes; the executor
    // then evaluates signal.aborted and returns a cancelled result.
    for (const resolve of pending) resolve();
    pending.length = 0;
    for (let i = 0; i < 10; i += 1) await flush();

    expect(useFleetBroadcastProgressStore.getState().isActive).toBe(false);
    expect(useAnnouncerStore.getState().polite?.msg).toMatch(/Broadcast cancelled/);
    expect(onSent).toHaveBeenCalled();
  });

  it("is a no-op when no broadcast is active", () => {
    expect(() => cancelActiveBroadcast()).not.toThrow();
    expect(useFleetBroadcastProgressStore.getState().isActive).toBe(false);
  });
});
