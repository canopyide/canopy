/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import { useDevPreviewConsoleCapture } from "../useDevPreviewConsoleCapture";
import { useConsoleCaptureStore } from "@/store/consoleCaptureStore";
import type { SerializedConsoleRow } from "@shared/types/ipc/webviewConsole";

const PANE_ID = "pane-1";
const WC_ID = 42;

let messageCb: ((row: SerializedConsoleRow) => void) | undefined;
let clearedCb: ((p: { paneId: string; navigationGeneration: number }) => void) | undefined;
const offMessage = vi.fn();
const offCleared = vi.fn();

const startConsoleCapture = vi.fn(() => Promise.resolve());
const stopConsoleCapture = vi.fn(() => Promise.resolve());

function makeWebviewRef(): React.RefObject<Electron.WebviewTag | null> {
  return createRef<Electron.WebviewTag>();
}

function row(overrides: Partial<SerializedConsoleRow> = {}): SerializedConsoleRow {
  return {
    id: Math.floor(Math.random() * 1e9),
    paneId: PANE_ID,
    level: "error",
    cdpType: "error",
    args: [],
    summaryText: "boom",
    timestamp: Date.now(),
    navigationGeneration: 1,
    groupDepth: 0,
    ...overrides,
  };
}

beforeEach(() => {
  messageCb = undefined;
  clearedCb = undefined;
  vi.clearAllMocks();
  useConsoleCaptureStore.setState({ messages: new Map(), counters: new Map() });
  (window as unknown as { electron: Record<string, unknown> }).electron = {
    webview: {
      startConsoleCapture,
      stopConsoleCapture,
      onConsoleMessage: vi.fn((cb: (r: SerializedConsoleRow) => void) => {
        messageCb = cb;
        return offMessage;
      }),
      onConsoleContextCleared: vi.fn(
        (cb: (p: { paneId: string; navigationGeneration: number }) => void) => {
          clearedCb = cb;
          return offCleared;
        }
      ),
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDevPreviewConsoleCapture", () => {
  it("starts capture when the webview is ready and not evicted", () => {
    const ref = makeWebviewRef();
    ref.current = { getWebContentsId: () => WC_ID } as unknown as Electron.WebviewTag;
    renderHook(() => useDevPreviewConsoleCapture(PANE_ID, ref, true, false));
    expect(startConsoleCapture).toHaveBeenCalledWith(WC_ID, PANE_ID);
  });

  it("does not start capture before the webview is ready", () => {
    const ref = makeWebviewRef();
    ref.current = { getWebContentsId: () => WC_ID } as unknown as Electron.WebviewTag;
    renderHook(() => useDevPreviewConsoleCapture(PANE_ID, ref, false, false));
    expect(startConsoleCapture).not.toHaveBeenCalled();
  });

  it("does not start capture while evicted", () => {
    const ref = makeWebviewRef();
    ref.current = { getWebContentsId: () => WC_ID } as unknown as Electron.WebviewTag;
    renderHook(() => useDevPreviewConsoleCapture(PANE_ID, ref, true, true));
    expect(startConsoleCapture).not.toHaveBeenCalled();
  });

  it("does not start capture when getWebContentsId throws", () => {
    const ref = makeWebviewRef();
    ref.current = {
      getWebContentsId: () => {
        throw new Error("not attached");
      },
    } as unknown as Electron.WebviewTag;
    renderHook(() => useDevPreviewConsoleCapture(PANE_ID, ref, true, false));
    expect(startConsoleCapture).not.toHaveBeenCalled();
  });

  it("stops capture and unsubscribes on unmount", () => {
    const ref = makeWebviewRef();
    ref.current = { getWebContentsId: () => WC_ID } as unknown as Electron.WebviewTag;
    const { unmount } = renderHook(() => useDevPreviewConsoleCapture(PANE_ID, ref, true, false));
    unmount();
    expect(offMessage).toHaveBeenCalledTimes(1);
    expect(offCleared).toHaveBeenCalledTimes(1);
    expect(stopConsoleCapture).toHaveBeenCalledWith(WC_ID, PANE_ID);
  });

  it("stops capture when the panel becomes evicted", () => {
    const ref = makeWebviewRef();
    ref.current = { getWebContentsId: () => WC_ID } as unknown as Electron.WebviewTag;
    const { rerender } = renderHook(
      ({ evicted }: { evicted: boolean }) =>
        useDevPreviewConsoleCapture(PANE_ID, ref, true, evicted),
      { initialProps: { evicted: false } }
    );
    expect(startConsoleCapture).toHaveBeenCalledTimes(1);

    rerender({ evicted: true });
    expect(stopConsoleCapture).toHaveBeenCalledWith(WC_ID, PANE_ID);
  });

  it("routes only matching-pane console messages into the store", () => {
    const ref = makeWebviewRef();
    ref.current = { getWebContentsId: () => WC_ID } as unknown as Electron.WebviewTag;
    renderHook(() => useDevPreviewConsoleCapture(PANE_ID, ref, true, false));

    messageCb?.(row({ paneId: "other-pane" }));
    expect(useConsoleCaptureStore.getState().getMessages(PANE_ID)).toHaveLength(0);

    messageCb?.(row({ paneId: PANE_ID }));
    expect(useConsoleCaptureStore.getState().getMessages(PANE_ID)).toHaveLength(1);
  });

  it("marks rows stale only for the matching pane on context-cleared", () => {
    const ref = makeWebviewRef();
    ref.current = { getWebContentsId: () => WC_ID } as unknown as Electron.WebviewTag;
    renderHook(() => useDevPreviewConsoleCapture(PANE_ID, ref, true, false));

    messageCb?.(row({ paneId: PANE_ID, navigationGeneration: 1 }));
    clearedCb?.({ paneId: "other-pane", navigationGeneration: 2 });
    expect(useConsoleCaptureStore.getState().getMessages(PANE_ID)[0]?.isStale).toBe(false);

    clearedCb?.({ paneId: PANE_ID, navigationGeneration: 2 });
    expect(useConsoleCaptureStore.getState().getMessages(PANE_ID)[0]?.isStale).toBe(true);
  });

  it("drops the pane's buffered rows when the panel unmounts", () => {
    const ref = makeWebviewRef();
    ref.current = { getWebContentsId: () => WC_ID } as unknown as Electron.WebviewTag;
    const { unmount } = renderHook(() => useDevPreviewConsoleCapture(PANE_ID, ref, true, false));
    messageCb?.(row({ paneId: PANE_ID }));
    expect(useConsoleCaptureStore.getState().getMessages(PANE_ID)).toHaveLength(1);

    unmount();
    expect(useConsoleCaptureStore.getState().getMessages(PANE_ID)).toHaveLength(0);
  });
});
