// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerFleetInputBroadcastHandler,
  resetFleetInputBroadcastHandlerForTests,
  writeTerminalInputOrFleet,
} from "../fleetInputRouter";
import { useFleetArmingStore } from "@/store/fleetArmingStore";

const writeMock = vi.hoisted(() => vi.fn<(id: string, data: string) => void>());

vi.mock("@/clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/clients")>();
  return {
    ...actual,
    terminalClient: {
      ...actual.terminalClient,
      write: writeMock,
    },
  };
});

describe("writeTerminalInputOrFleet", () => {
  beforeEach(() => {
    writeMock.mockReset();
    resetFleetInputBroadcastHandlerForTests();
    useFleetArmingStore.setState({
      armedIds: new Set<string>(),
      armOrder: [],
      armOrderById: {},
      lastArmedId: null,
      broadcastSignal: 0,
      previewArmedIds: new Set<string>(),
    });
  });

  it("writes to the origin terminal when no fleet handler is registered", () => {
    writeTerminalInputOrFleet("t1", "hello");

    expect(writeMock).toHaveBeenCalledWith("t1", "hello");
  });

  it("does not single-write when the registered fleet handler accepts the input", () => {
    const handler = vi.fn(() => true);
    registerFleetInputBroadcastHandler(handler);

    writeTerminalInputOrFleet("t1", "npm test\r");

    expect(handler).toHaveBeenCalledWith("t1", "npm test\r");
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("falls back to a single write when the fleet handler rejects the input", () => {
    const handler = vi.fn(() => false);
    registerFleetInputBroadcastHandler(handler);

    writeTerminalInputOrFleet("t1", "local-only");

    expect(handler).toHaveBeenCalledWith("t1", "local-only");
    expect(writeMock).toHaveBeenCalledWith("t1", "local-only");
  });

  it("unregisters only the active handler", () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const unregisterFirst = registerFleetInputBroadcastHandler(first);
    registerFleetInputBroadcastHandler(second);

    unregisterFirst();
    writeTerminalInputOrFleet("t1", "still-fleet");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("t1", "still-fleet");
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("ignores empty raw input", () => {
    const handler = vi.fn(() => true);
    registerFleetInputBroadcastHandler(handler);

    writeTerminalInputOrFleet("t1", "");

    expect(handler).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("increments broadcastSignal once per accepted fleet write", () => {
    registerFleetInputBroadcastHandler(() => true);

    expect(useFleetArmingStore.getState().broadcastSignal).toBe(0);
    writeTerminalInputOrFleet("t1", "a");
    expect(useFleetArmingStore.getState().broadcastSignal).toBe(1);
    writeTerminalInputOrFleet("t1", "b");
    writeTerminalInputOrFleet("t1", "c");
    expect(useFleetArmingStore.getState().broadcastSignal).toBe(3);
  });

  it("does not increment broadcastSignal when no fleet handler is registered", () => {
    writeTerminalInputOrFleet("t1", "hello");
    expect(useFleetArmingStore.getState().broadcastSignal).toBe(0);
  });

  it("does not increment broadcastSignal when the fleet handler rejects the input", () => {
    registerFleetInputBroadcastHandler(() => false);
    writeTerminalInputOrFleet("t1", "local-only");
    expect(useFleetArmingStore.getState().broadcastSignal).toBe(0);
  });

  it("does not increment broadcastSignal on empty input even with a fleet handler", () => {
    registerFleetInputBroadcastHandler(() => true);
    writeTerminalInputOrFleet("t1", "");
    expect(useFleetArmingStore.getState().broadcastSignal).toBe(0);
  });
});
