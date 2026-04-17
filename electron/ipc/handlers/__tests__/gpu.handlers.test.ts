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

vi.mock("electron", () => ({
  ipcMain: ipcMainMock,
  app: appMock,
}));

const storeMock = vi.hoisted(() => ({
  get: vi.fn(() => undefined),
  set: vi.fn(),
}));

vi.mock("../../../store.js", () => ({ store: storeMock }));

const gpuMonitorMock = vi.hoisted(() => ({
  isGpuDisabledByFlag: vi.fn(() => false),
  writeGpuDisabledFlag: vi.fn(),
  clearGpuDisabledFlag: vi.fn(),
}));

vi.mock("../../../services/GpuCrashMonitorService.js", () => gpuMonitorMock);

const telemetryServiceMock = vi.hoisted(() => ({
  closeTelemetry: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../services/TelemetryService.js", () => telemetryServiceMock);

import { registerGpuHandlers } from "../app/gpu.js";

describe("GPU_SET_HARDWARE_ACCELERATION handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcMainMock._handlers.clear();
  });

  it("disables GPU, then calls relaunch, closeTelemetry, exit(0) — in order", async () => {
    const callOrder: string[] = [];
    gpuMonitorMock.writeGpuDisabledFlag.mockImplementation(() => callOrder.push("writeFlag"));
    appMock.relaunch.mockImplementation(() => callOrder.push("relaunch"));
    telemetryServiceMock.closeTelemetry.mockImplementation(async () => {
      callOrder.push("closeTelemetry");
    });
    appMock.exit.mockImplementation(() => callOrder.push("exit"));

    registerGpuHandlers();
    const handler = ipcMainMock._handlers.get("gpu:set-hardware-acceleration")!;
    expect(handler).toBeDefined();

    await handler({} as Electron.IpcMainInvokeEvent, false);

    expect(callOrder).toEqual(["writeFlag", "relaunch", "closeTelemetry", "exit"]);
    expect(appMock.exit).toHaveBeenCalledWith(0);
    expect(storeMock.set).toHaveBeenCalledWith("gpu", { hardwareAccelerationDisabled: true });
  });

  it("enables GPU: clears flag, relaunch, closeTelemetry, exit(0) — in order", async () => {
    const callOrder: string[] = [];
    gpuMonitorMock.clearGpuDisabledFlag.mockImplementation(() => callOrder.push("clearFlag"));
    appMock.relaunch.mockImplementation(() => callOrder.push("relaunch"));
    telemetryServiceMock.closeTelemetry.mockImplementation(async () => {
      callOrder.push("closeTelemetry");
    });
    appMock.exit.mockImplementation(() => callOrder.push("exit"));

    registerGpuHandlers();
    const handler = ipcMainMock._handlers.get("gpu:set-hardware-acceleration")!;

    await handler({} as Electron.IpcMainInvokeEvent, true);

    expect(callOrder).toEqual(["clearFlag", "relaunch", "closeTelemetry", "exit"]);
    expect(storeMock.set).toHaveBeenCalledWith("gpu", { hardwareAccelerationDisabled: false });
  });
});
