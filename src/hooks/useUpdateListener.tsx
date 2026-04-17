import { useEffect, useRef } from "react";
import { useNotificationStore } from "@/store/notificationStore";
import { notify } from "@/lib/notify";

const AVAILABLE_HINT = 'Use "Check for Updates..." to check again.';

function DownloadProgress({ percent }: { percent: number }) {
  const pct = Math.round(percent);
  return (
    <div className="space-y-1">
      <span>{pct}% complete</span>
      <div className="h-1 w-full rounded-full bg-tint/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-daintree-accent transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function isToastLive(id: string | null): boolean {
  if (!id) return false;
  const existing = useNotificationStore.getState().notifications.find((n) => n.id === id);
  return Boolean(existing && !existing.dismissed);
}

export function useUpdateListener(suppressToasts = false): void {
  const toastIdRef = useRef<string | null>(null);
  const versionRef = useRef<string | null>(null);
  const suppressRef = useRef(suppressToasts);
  const pendingUpdateRef = useRef<{ version: string; downloaded: boolean } | null>(null);

  // Keep ref in sync
  useEffect(() => {
    suppressRef.current = suppressToasts;
  }, [suppressToasts]);

  // Surface pending update when suppression lifts
  useEffect(() => {
    if (suppressToasts) return;
    if (!pendingUpdateRef.current) return;

    const { version, downloaded } = pendingUpdateRef.current;
    pendingUpdateRef.current = null;

    if (downloaded) {
      toastIdRef.current = useNotificationStore.getState().addNotification({
        type: "success",
        title: "Update Ready",
        message: `Version ${version} is ready to install.`,
        inboxMessage: `Version ${version} ready to install`,
        priority: "high",
        duration: 0,
        action: {
          label: "Restart to Update",
          onClick: () => window.electron?.update?.quitAndInstall(),
        },
      });
      versionRef.current = version;
    } else {
      const id = notify({
        type: "info",
        title: "Update Available",
        message: `Version ${version} is downloading...`,
        inboxMessage: `Version ${version} is downloading. ${AVAILABLE_HINT}`,
        priority: "high",
        duration: 0,
      });
      toastIdRef.current = id || null;
      versionRef.current = id ? version : null;
    }
  }, [suppressToasts]);

  useEffect(() => {
    if (!window.electron?.update) return;

    let disposed = false;

    const cleanupAvailable = window.electron.update.onUpdateAvailable((info) => {
      if (suppressRef.current) {
        pendingUpdateRef.current = { version: info.version, downloaded: false };
        return;
      }
      // Dedup: if the same-version toast is still live, don't stack a duplicate.
      // A different version always shows a fresh toast (supersedes the old one
      // via the notification-store's MAX_VISIBLE_TOASTS eviction).
      if (versionRef.current === info.version && isToastLive(toastIdRef.current)) {
        return;
      }
      const id = notify({
        type: "info",
        title: "Update Available",
        message: `Version ${info.version} is downloading...`,
        inboxMessage: `Version ${info.version} is downloading. ${AVAILABLE_HINT}`,
        priority: "high",
        duration: 0,
      });
      toastIdRef.current = id || null;
      versionRef.current = id ? info.version : null;
    });

    const cleanupProgress = window.electron.update.onDownloadProgress((info) => {
      if (!toastIdRef.current) return;
      useNotificationStore.getState().updateNotification(toastIdRef.current, {
        title: "Downloading Update",
        message: <DownloadProgress percent={info.percent} />,
        inboxMessage: `Downloading update: ${Math.round(info.percent)}%`,
      });
    });

    const cleanupDownloaded = window.electron.update.onUpdateDownloaded((info) => {
      if (suppressRef.current) {
        pendingUpdateRef.current = { version: info.version, downloaded: true };
        return;
      }
      if (toastIdRef.current && isToastLive(toastIdRef.current)) {
        useNotificationStore.getState().updateNotification(toastIdRef.current, {
          type: "success",
          title: "Update Ready",
          message: `Version ${info.version} is ready to install.`,
          inboxMessage: `Version ${info.version} ready to install`,
          duration: 0,
          dismissed: false,
          action: {
            label: "Restart to Update",
            onClick: () => window.electron?.update?.quitAndInstall(),
          },
        });
      } else {
        // Either the quiet period was active when update-available fired, or
        // the user dismissed the "Available" toast. Either way, the
        // "Downloaded" stage is a distinct notification and must not be
        // swallowed by the Available-stage cooldown — create a fresh toast.
        toastIdRef.current = useNotificationStore.getState().addNotification({
          type: "success",
          title: "Update Ready",
          message: `Version ${info.version} is ready to install.`,
          inboxMessage: `Version ${info.version} ready to install`,
          priority: "high",
          duration: 0,
          action: {
            label: "Restart to Update",
            onClick: () => window.electron?.update?.quitAndInstall(),
          },
        });
      }
      versionRef.current = info.version;
    });

    // Detect when the user dismisses the live Update-Available toast and
    // forward that signal to main so the 24h cooldown starts. Kept inside
    // this effect so cleanup is atomic (lesson #4958), guarded with a
    // `disposed` flag for async-safe teardown (lesson #4754), and reads
    // both refs fresh inside the callback (lesson #5087).
    const unsubscribe = useNotificationStore.subscribe((state) => {
      if (disposed) return;
      const id = toastIdRef.current;
      const version = versionRef.current;
      if (!id || !version) return;
      const current = state.notifications.find((n) => n.id === id);
      if (!current || !current.dismissed) return;
      // Clear tracking first so the same dismissal cannot fire twice (the
      // store may emit additional change events before unsubscribe runs).
      toastIdRef.current = null;
      versionRef.current = null;
      void window.electron?.update?.notifyDismiss?.(version);
    });

    return () => {
      disposed = true;
      cleanupAvailable();
      cleanupProgress();
      cleanupDownloaded();
      unsubscribe();
    };
  }, []);
}
