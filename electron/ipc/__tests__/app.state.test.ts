import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getVersion: vi.fn(() => "1.0.0"), getPath: vi.fn(() => "/tmp") },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    fromWebContents: vi.fn(() => null),
  },
}));

vi.mock("../../store.js", () => ({
  store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  consumePendingSettingsRecovery: vi.fn(() => null),
  windowStatesStore: { get: vi.fn(), set: vi.fn() },
}));

vi.mock("../../services/CrashRecoveryService.js", () => ({
  getCrashRecoveryService: () => ({
    scheduleBackup: vi.fn(),
    consumePanelFilter: vi.fn(() => null),
    startBackupTimer: vi.fn(),
    resetToFresh: vi.fn(),
    restoreBackup: vi.fn(() => false),
    setPanelFilter: vi.fn(),
  }),
  initializeCrashRecoveryService: vi.fn(),
}));

vi.mock("../../services/ProjectStore.js", () => ({
  projectStore: {
    getCurrentProject: vi.fn(() => null),
    getProjectStateWithRecovery: vi.fn(),
    saveProjectState: vi.fn(),
  },
}));

vi.mock("../../utils/gpuDetection.js", () => ({
  getGpuFeatureStatus: vi.fn(() => ({ webgl2: "hardware" })),
  isWebGLHardwareAccelerated: vi.fn(() => true),
}));

vi.mock("../../services/GpuCrashMonitorService.js", () => ({
  isGpuDisabledByFlag: vi.fn(() => false),
}));

vi.mock("../../services/CrashLoopGuardService.js", () => ({
  getCrashLoopGuard: () => ({
    isSafeMode: vi.fn(() => false),
    getCrashCount: vi.fn(() => 0),
    getLastCrashTimestamp: vi.fn(() => null),
    resetForNormalBoot: vi.fn(),
  }),
}));

vi.mock("../../services/TelemetryService.js", () => ({
  closeTelemetry: vi.fn(),
}));

vi.mock("../../window/deferredInitQueue.js", () => ({
  signalFirstInteractive: vi.fn(),
}));

vi.mock("../../utils/performance.js", () => ({
  markPerformance: vi.fn(),
  isPerformanceCaptureEnabled: vi.fn(() => false),
  sampleIpcTiming: vi.fn(),
}));

vi.mock("../../services/prefetchHydrateCache.js", () => ({
  consumePrefetchedHydrateResult: vi.fn(() => null),
}));

vi.mock("../../window/webContentsRegistry.js", () => ({
  getWindowForWebContents: vi.fn(() => null),
  getAppWebContents: vi.fn(() => null),
  getAllAppWebContents: vi.fn(() => []),
}));

vi.mock("../../ipc/utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../ipc/utils.js")>();
  return {
    ...actual,
    assertIpcSecurityReady: vi.fn(),
  };
});

import { CRASH_CRITICAL_FIELDS } from "../handlers/app/state.js";

function shouldTriggerBackup(updates: Record<string, unknown>): boolean {
  return Object.keys(updates).some((k) => CRASH_CRITICAL_FIELDS.has(k));
}

describe("CRASH_CRITICAL_FIELDS", () => {
  it("includes terminals", () => {
    expect(CRASH_CRITICAL_FIELDS.has("terminals")).toBe(true);
  });

  it("includes panelGridConfig", () => {
    expect(CRASH_CRITICAL_FIELDS.has("panelGridConfig")).toBe(true);
  });

  it("includes focusMode", () => {
    expect(CRASH_CRITICAL_FIELDS.has("focusMode")).toBe(true);
  });

  it("includes focusPanelState", () => {
    expect(CRASH_CRITICAL_FIELDS.has("focusPanelState")).toBe(true);
  });

  it("includes activeWorktreeId", () => {
    expect(CRASH_CRITICAL_FIELDS.has("activeWorktreeId")).toBe(true);
  });

  it("includes recipes", () => {
    expect(CRASH_CRITICAL_FIELDS.has("recipes")).toBe(true);
  });

  it("includes mruList", () => {
    expect(CRASH_CRITICAL_FIELDS.has("mruList")).toBe(true);
  });

  it("includes actionMruList", () => {
    expect(CRASH_CRITICAL_FIELDS.has("actionMruList")).toBe(true);
  });

  it("includes developerMode", () => {
    expect(CRASH_CRITICAL_FIELDS.has("developerMode")).toBe(true);
  });

  it("includes fleetScopeMode", () => {
    expect(CRASH_CRITICAL_FIELDS.has("fleetScopeMode")).toBe(true);
  });

  it("does NOT include sidebarWidth", () => {
    expect(CRASH_CRITICAL_FIELDS.has("sidebarWidth")).toBe(false);
  });

  it("does NOT include diagnosticsHeight", () => {
    expect(CRASH_CRITICAL_FIELDS.has("diagnosticsHeight")).toBe(false);
  });

  it("does NOT include hasSeenWelcome", () => {
    expect(CRASH_CRITICAL_FIELDS.has("hasSeenWelcome")).toBe(false);
  });

  it("does NOT include unknown fields", () => {
    expect(CRASH_CRITICAL_FIELDS.has("unknownField")).toBe(false);
  });

  it("has exactly 10 fields", () => {
    expect(CRASH_CRITICAL_FIELDS.size).toBe(10);
  });
});

describe("shouldTriggerBackup", () => {
  it("returns true for a single critical field", () => {
    expect(shouldTriggerBackup({ focusMode: true })).toBe(true);
  });

  it("returns true for terminals", () => {
    expect(shouldTriggerBackup({ terminals: [] })).toBe(true);
  });

  it("returns true for panelGridConfig", () => {
    expect(shouldTriggerBackup({ panelGridConfig: { strategy: "automatic", value: 3 } })).toBe(
      true
    );
  });

  it("returns true for activeWorktreeId", () => {
    expect(shouldTriggerBackup({ activeWorktreeId: "wt-1" })).toBe(true);
  });

  it("returns true for recipes", () => {
    expect(shouldTriggerBackup({ recipes: [] })).toBe(true);
  });

  it("returns true for mruList", () => {
    expect(shouldTriggerBackup({ mruList: [] })).toBe(true);
  });

  it("returns true for actionMruList", () => {
    expect(shouldTriggerBackup({ actionMruList: [] })).toBe(true);
  });

  it("returns true for developerMode", () => {
    expect(shouldTriggerBackup({ developerMode: { enabled: true } })).toBe(true);
  });

  it("returns true for fleetScopeMode", () => {
    expect(shouldTriggerBackup({ fleetScopeMode: "scoped" })).toBe(true);
  });

  it("returns false for sidebarWidth-only mutation", () => {
    expect(shouldTriggerBackup({ sidebarWidth: 350 })).toBe(false);
  });

  it("returns false for diagnosticsHeight-only mutation", () => {
    expect(shouldTriggerBackup({ diagnosticsHeight: 400 })).toBe(false);
  });

  it("returns false for hasSeenWelcome-only mutation", () => {
    expect(shouldTriggerBackup({ hasSeenWelcome: true })).toBe(false);
  });

  it("returns true for mixed critical+cosmetic mutation", () => {
    expect(shouldTriggerBackup({ focusMode: true, sidebarWidth: 350, hasSeenWelcome: true })).toBe(
      true
    );
  });

  it("returns false for empty object", () => {
    expect(shouldTriggerBackup({})).toBe(false);
  });
});
