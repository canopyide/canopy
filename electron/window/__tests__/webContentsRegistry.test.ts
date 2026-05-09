import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow, WebContents, WebContentsView } from "electron";

const electronMock = vi.hoisted(() => ({
  fromWebContents: vi.fn(() => null),
  getAllWindows: vi.fn(() => []),
  fromId: vi.fn(() => null),
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: electronMock.fromWebContents,
    getAllWindows: electronMock.getAllWindows,
  },
  WebContentsView: vi.fn(),
  webContents: {
    fromId: electronMock.fromId,
  },
}));

type MockWebContents = EventEmitter & {
  id: number;
  isDestroyed: ReturnType<typeof vi.fn>;
  setDestroyed: (next: boolean) => void;
  emitDestroyed: () => void;
};

function createWebContents(id: number): MockWebContents {
  let destroyed = false;
  const wc = new EventEmitter() as MockWebContents;
  wc.id = id;
  wc.isDestroyed = vi.fn(() => destroyed);
  wc.setDestroyed = (next: boolean) => {
    destroyed = next;
  };
  wc.emitDestroyed = () => {
    destroyed = true;
    wc.emit("destroyed");
  };
  return wc;
}

function createWindow(id: number): BrowserWindow {
  return {
    id,
    webContents: createWebContents(10_000 + id) as unknown as WebContents,
    isDestroyed: vi.fn(() => false),
  } as unknown as BrowserWindow;
}

function createView(webContents: MockWebContents): WebContentsView {
  return { webContents: webContents as unknown as WebContents } as unknown as WebContentsView;
}

async function loadRegistry() {
  vi.resetModules();
  electronMock.fromWebContents.mockReset();
  electronMock.fromWebContents.mockReturnValue(null);
  electronMock.getAllWindows.mockReset();
  electronMock.getAllWindows.mockReturnValue([]);
  electronMock.fromId.mockReset();
  electronMock.fromId.mockReturnValue(null);
  return import("../webContentsRegistry.js");
}

describe("webContentsRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not add duplicate destroyed listeners when an app view is reactivated", async () => {
    const { getAppWebContents, registerAppView } = await loadRegistry();
    const win = createWindow(1);
    const wc = createWebContents(101);
    const view = createView(wc);

    for (let i = 0; i < 20; i += 1) {
      registerAppView(win, view);
    }

    expect(wc.listenerCount("destroyed")).toBe(2);
    expect(getAppWebContents(win)).toBe(wc);

    wc.emitDestroyed();

    expect(wc.listenerCount("destroyed")).toBe(0);
    expect(getAppWebContents(win)).toBe(win.webContents);
  });

  it("keeps ProjectViewManager cold-start registration to one listener per concern", async () => {
    const { getProjectForWebContents, registerAppView, registerProjectView, registerWebContents } =
      await loadRegistry();
    const win = createWindow(1);
    const wc = createWebContents(102);
    const view = createView(wc);

    registerProjectView("project-a", wc as unknown as WebContents);
    registerWebContents(wc as unknown as WebContents, win);
    registerAppView(win, view);

    for (let i = 0; i < 20; i += 1) {
      registerWebContents(wc as unknown as WebContents, win);
      registerAppView(win, view);
      registerProjectView("project-a", wc as unknown as WebContents);
    }

    expect(wc.listenerCount("destroyed")).toBe(3);
    expect(getProjectForWebContents(wc.id)).toBe("project-a");
  });

  it("allows unregister and later re-register without leaving stale listener state", async () => {
    const { registerWebContents, unregisterWebContents } = await loadRegistry();
    const firstWindow = createWindow(1);
    const secondWindow = createWindow(2);
    const wc = createWebContents(103);

    registerWebContents(wc as unknown as WebContents, firstWindow);
    registerWebContents(wc as unknown as WebContents, firstWindow);
    expect(wc.listenerCount("destroyed")).toBe(1);

    unregisterWebContents(wc as unknown as WebContents);
    expect(wc.listenerCount("destroyed")).toBe(0);

    registerWebContents(wc as unknown as WebContents, secondWindow);
    expect(wc.listenerCount("destroyed")).toBe(1);
  });
});
