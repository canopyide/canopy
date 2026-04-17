// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUpdateListener } from "../useUpdateListener";
import type { NotifyPayload } from "@/lib/notify";

interface MockNotification {
  id: string;
  dismissed?: boolean;
}

const notifyMock = vi.fn<(payload: NotifyPayload) => string>().mockReturnValue("toast-1");

vi.mock("@/lib/notify", () => ({
  notify: (...args: [NotifyPayload]) => notifyMock(...args),
}));

const updateNotificationMock = vi.fn();
const addNotificationMock = vi.fn().mockReturnValue("fresh-toast");

const storeState: { notifications: MockNotification[] } = { notifications: [] };
const subscribers = new Set<(state: typeof storeState) => void>();

function setMockNotifications(next: MockNotification[]): void {
  storeState.notifications = next;
  for (const cb of subscribers) cb(storeState);
}

function addMockNotification(id: string): void {
  setMockNotifications([...storeState.notifications, { id, dismissed: false }]);
}

function dismissMockNotification(id: string): void {
  setMockNotifications(
    storeState.notifications.map((n) => (n.id === id ? { ...n, dismissed: true } : n))
  );
}

vi.mock("@/store/notificationStore", () => ({
  useNotificationStore: Object.assign(() => ({}), {
    getState: () => ({
      updateNotification: updateNotificationMock,
      addNotification: addNotificationMock,
      notifications: storeState.notifications,
    }),
    subscribe: (listener: (state: typeof storeState) => void) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
  }),
}));

type AvailableCallback = (info: { version: string }) => void;
type ProgressCallback = (info: { percent: number }) => void;
type DownloadedCallback = (info: { version: string }) => void;

let capturedAvailable: AvailableCallback | null = null;
let capturedProgress: ProgressCallback | null = null;
let capturedDownloaded: DownloadedCallback | null = null;

const cleanupAvailable = vi.fn();
const cleanupProgress = vi.fn();
const cleanupDownloaded = vi.fn();
const notifyDismissMock = vi.fn().mockResolvedValue(undefined);

describe("useUpdateListener", () => {
  beforeEach(() => {
    capturedAvailable = null;
    capturedProgress = null;
    capturedDownloaded = null;
    cleanupAvailable.mockClear();
    cleanupProgress.mockClear();
    cleanupDownloaded.mockClear();
    notifyMock.mockClear().mockImplementation(() => {
      // Default: each notify() call registers a new notification so dedup
      // checks against the store find a live entry. Returns a unique-ish id
      // per call so consecutive notifies don't collide.
      const id = `toast-${storeState.notifications.length + 1}`;
      addMockNotification(id);
      return id;
    });
    updateNotificationMock.mockClear();
    addNotificationMock.mockClear().mockImplementation(() => {
      const id = `fresh-toast-${storeState.notifications.length + 1}`;
      addMockNotification(id);
      return id;
    });
    notifyDismissMock.mockClear();
    subscribers.clear();
    storeState.notifications = [];

    window.electron = {
      update: {
        onUpdateAvailable: vi.fn((cb: AvailableCallback) => {
          capturedAvailable = cb;
          return cleanupAvailable;
        }),
        onDownloadProgress: vi.fn((cb: ProgressCallback) => {
          capturedProgress = cb;
          return cleanupProgress;
        }),
        onUpdateDownloaded: vi.fn((cb: DownloadedCallback) => {
          capturedDownloaded = cb;
          return cleanupDownloaded;
        }),
        quitAndInstall: vi.fn(),
        checkForUpdates: vi.fn(),
        notifyDismiss: notifyDismissMock,
      },
    } as unknown as typeof window.electron;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).electron;
  });

  it("subscribes to all three update events and cleans up on unmount", () => {
    const { unmount } = renderHook(() => useUpdateListener());

    expect(window.electron.update.onUpdateAvailable).toHaveBeenCalledTimes(1);
    expect(window.electron.update.onDownloadProgress).toHaveBeenCalledTimes(1);
    expect(window.electron.update.onUpdateDownloaded).toHaveBeenCalledTimes(1);

    unmount();
    expect(cleanupAvailable).toHaveBeenCalledTimes(1);
    expect(cleanupProgress).toHaveBeenCalledTimes(1);
    expect(cleanupDownloaded).toHaveBeenCalledTimes(1);
  });

  it("calls notify with persistent toast on update-available", () => {
    renderHook(() => useUpdateListener());

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        title: "Update Available",
        message: "Version 2.5.0 is downloading...",
        duration: 0,
        priority: "high",
      })
    );
  });

  it("includes the manual-check hint in the inbox message", () => {
    renderHook(() => useUpdateListener());

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });

    const payload = notifyMock.mock.calls[0][0];
    expect(payload.inboxMessage).toContain("Check for Updates");
  });

  it("updates toast in-place with progress bar on download-progress", () => {
    renderHook(() => useUpdateListener());

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });

    act(() => {
      capturedProgress!({ percent: 42.7 });
    });

    expect(updateNotificationMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        title: "Downloading Update",
        inboxMessage: "Downloading update: 43%",
      })
    );
    // message should be a ReactNode (the DownloadProgress component)
    const patch = updateNotificationMock.mock.calls[0][1];
    expect(typeof patch.message).not.toBe("string");
  });

  it("updates toast to downloaded state with restart action", () => {
    renderHook(() => useUpdateListener());

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });

    act(() => {
      capturedDownloaded!({ version: "2.5.0" });
    });

    expect(updateNotificationMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: "success",
        title: "Update Ready",
        message: "Version 2.5.0 is ready to install.",
        duration: 0,
        dismissed: false,
        action: expect.objectContaining({ label: "Restart to Update" }),
      })
    );

    // Clicking the action should call quitAndInstall
    const patch = updateNotificationMock.mock.calls[0][1];
    patch.action!.onClick();
    expect(window.electron.update.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("skips progress when toast was not created (quiet period)", () => {
    notifyMock.mockImplementation(() => "");
    renderHook(() => useUpdateListener());

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });

    act(() => {
      capturedProgress!({ percent: 50 });
    });

    expect(updateNotificationMock).not.toHaveBeenCalled();
  });

  it("creates fresh notification on downloaded when quiet period was active", () => {
    notifyMock.mockImplementation(() => "");
    renderHook(() => useUpdateListener());

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });

    act(() => {
      capturedDownloaded!({ version: "2.5.0" });
    });

    expect(addNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "Update Ready",
        message: "Version 2.5.0 is ready to install.",
        priority: "high",
        duration: 0,
        action: expect.objectContaining({ label: "Restart to Update" }),
      })
    );
  });

  it("does not crash when window.electron is undefined", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).electron;
    expect(() => renderHook(() => useUpdateListener())).not.toThrow();
  });

  it("handles downloaded before available (no prior toast)", () => {
    renderHook(() => useUpdateListener());

    // Skip calling available, go straight to downloaded
    act(() => {
      capturedDownloaded!({ version: "3.0.0" });
    });

    expect(addNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "Update Ready",
        priority: "high",
      })
    );
  });

  it("dedupes repeat update-available for the same version while the toast is still live", () => {
    renderHook(() => useUpdateListener());

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });
    expect(notifyMock).toHaveBeenCalledTimes(1);

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });
    // Second IPC event for the same live version must not create a new toast.
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("creates a fresh toast when update-available fires for a newer version", () => {
    renderHook(() => useUpdateListener());

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });
    expect(notifyMock).toHaveBeenCalledTimes(1);

    act(() => {
      capturedAvailable!({ version: "2.5.1" });
    });
    expect(notifyMock).toHaveBeenCalledTimes(2);
  });

  it("allows a new toast if the prior same-version toast was already dismissed", () => {
    renderHook(() => useUpdateListener());

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });
    const firstId = notifyMock.mock.results[0].value as string;

    // User dismisses the toast — which also fires our dismiss subscriber.
    act(() => {
      dismissMockNotification(firstId);
    });

    // Main fires again (e.g., on the next periodic poll). Renderer should
    // show a fresh toast since the prior one is no longer live — the
    // 24h cooldown against same-version re-notification is enforced in
    // main, not the renderer.
    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });
    expect(notifyMock).toHaveBeenCalledTimes(2);
  });

  it("calls notifyDismiss on main when the tracked toast is dismissed", () => {
    renderHook(() => useUpdateListener());

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });
    const toastId = notifyMock.mock.results[0].value as string;

    act(() => {
      dismissMockNotification(toastId);
    });

    expect(notifyDismissMock).toHaveBeenCalledTimes(1);
    expect(notifyDismissMock).toHaveBeenCalledWith("2.5.0");
  });

  it("does not call notifyDismiss twice when the store emits further changes after dismiss", () => {
    renderHook(() => useUpdateListener());

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });
    const toastId = notifyMock.mock.results[0].value as string;

    act(() => {
      dismissMockNotification(toastId);
    });
    expect(notifyDismissMock).toHaveBeenCalledTimes(1);

    // A subsequent unrelated store change (e.g., another notification added)
    // must not re-fire the dismiss handler for the already-dismissed toast.
    act(() => {
      addMockNotification("unrelated");
    });
    expect(notifyDismissMock).toHaveBeenCalledTimes(1);
  });

  it("does not call notifyDismiss after unmount", () => {
    const { unmount } = renderHook(() => useUpdateListener());

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });
    const toastId = notifyMock.mock.results[0].value as string;

    unmount();

    act(() => {
      dismissMockNotification(toastId);
    });

    expect(notifyDismissMock).not.toHaveBeenCalled();
  });

  it("still creates the Update Ready toast after the Available toast was dismissed", () => {
    renderHook(() => useUpdateListener());

    act(() => {
      capturedAvailable!({ version: "2.5.0" });
    });
    const firstId = notifyMock.mock.results[0].value as string;

    // User dismisses the Available toast.
    act(() => {
      dismissMockNotification(firstId);
    });

    // Download finishes — Downloaded-stage toast must not be swallowed by
    // the Available-stage dismissal.
    act(() => {
      capturedDownloaded!({ version: "2.5.0" });
    });

    expect(addNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "Update Ready",
      })
    );
  });
});
