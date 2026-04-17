import { describe, it, expect, vi, beforeEach } from "vitest";

const ipcMainMock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
    _handlers: handlers,
  };
});

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(() => "/tmp/user-data"),
  relaunch: vi.fn(),
  exit: vi.fn(),
}));

const shellMock = vi.hoisted(() => ({ showItemInFolder: vi.fn() }));
const sessionMock = vi.hoisted(() => ({
  defaultSession: {
    clearCache: vi.fn(() => Promise.resolve()),
    clearCodeCaches: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("electron", () => ({
  ipcMain: ipcMainMock,
  app: appMock,
  shell: shellMock,
  session: sessionMock,
}));

const storeMock = vi.hoisted(() => ({
  get: vi.fn(() => undefined),
  set: vi.fn(),
}));

vi.mock("../../../store.js", () => ({ store: storeMock }));

const telemetryServiceMock = vi.hoisted(() => ({
  closeTelemetry: vi.fn(() => Promise.resolve()),
  getTelemetryLevel: vi.fn(() => "off"),
  setTelemetryLevel: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../services/TelemetryService.js", () => telemetryServiceMock);

import { registerPrivacyHandlers } from "../privacy.js";

describe("PRIVACY_RESET_ALL_DATA handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcMainMock._handlers.clear();
  });

  it("calls relaunch, then closeTelemetry, then exit(0) — in that order", async () => {
    const callOrder: string[] = [];
    appMock.relaunch.mockImplementation(() => callOrder.push("relaunch"));
    telemetryServiceMock.closeTelemetry.mockImplementation(async () => {
      callOrder.push("closeTelemetry");
    });
    appMock.exit.mockImplementation(() => callOrder.push("exit"));

    registerPrivacyHandlers();
    const handler = ipcMainMock._handlers.get("privacy:reset-all-data")!;
    expect(handler).toBeDefined();

    await handler();

    expect(callOrder).toEqual(["relaunch", "closeTelemetry", "exit"]);
    expect(appMock.exit).toHaveBeenCalledWith(0);
  });

  it("calls relaunch with --reset-data arg", async () => {
    registerPrivacyHandlers();
    const handler = ipcMainMock._handlers.get("privacy:reset-all-data")!;

    await handler();

    expect(appMock.relaunch).toHaveBeenCalledWith({
      args: expect.arrayContaining(["--reset-data"]),
    });
  });
});
