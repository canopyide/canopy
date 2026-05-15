import { useEffect, useRef } from "react";
import { logError } from "@/utils/logger";
import { notify } from "@/lib/notify";
import { safeFireAndForget } from "@/utils/safeFireAndForget";
import { useDistributionStore } from "@/store/distributionStore";

const STORE_UPDATE_CORRELATION_ID = "app-update-store";

function showStoreUpdateNotification(info: { version: string; storeUrl: string }): void {
  notify({
    type: "info",
    // priority:"low" routes inbox-only — no toast and no OS notification.
    // The Store handles the actual install, so a heads-up belongs in the
    // history list rather than competing with active work for attention.
    priority: "low",
    title: "Update available",
    message: `Version ${info.version} is available in the Microsoft Store.`,
    correlationId: STORE_UPDATE_CORRELATION_ID,
    duration: 0,
    action: {
      label: "Open Microsoft Store",
      onClick: () => {
        const promise = window.electron?.system?.openExternal(info.storeUrl);
        if (promise) {
          safeFireAndForget(promise, { context: "Open Microsoft Store for update" });
        }
      },
    },
  });
}

export function useStoreUpdateListener(): void {
  const isWindowsStore = useDistributionStore((s) => s.isWindowsStore);
  const lastNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isWindowsStore) return;
    if (!window.electron?.storeUpdate) return;

    const surface = (info: { version: string; storeUrl: string }) => {
      if (lastNotifiedRef.current === info.version) return;
      lastNotifiedRef.current = info.version;
      showStoreUpdateNotification(info);
      // Persist immediately so the next session doesn't re-notify even if the
      // user never clicks the CTA or dismisses the inbox entry.
      const promise = window.electron?.storeUpdate?.dismiss(info.version);
      promise?.catch((err) => logError("[useStoreUpdateListener] dismiss failed", err));
    };

    // Hydrate from the main-process cache so an update detected during the
    // launch jitter window (before the renderer subscribed) still surfaces.
    const hydrate = window.electron.storeUpdate.getLatest();
    hydrate
      ?.then((info) => {
        if (info) surface(info);
      })
      .catch((err) => logError("[useStoreUpdateListener] getLatest failed", err));

    const cleanup = window.electron.storeUpdate.onUpdateAvailable(surface);

    return () => {
      cleanup();
    };
  }, [isWindowsStore]);
}
