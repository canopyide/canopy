import { useCallback, useSyncExternalStore } from "react";
import { logWarn } from "@/utils/logger";

export interface AudioDevice {
  value: string;
  label: string;
}

interface Snapshot {
  devices: AudioDevice[];
  loading: boolean;
  error: string | null;
}

let cachedDevices: AudioDevice[] | null = null;
let cachedError: string | null = null;
let cachedLoading = true;
let listeners: Array<() => void> = [];
let subscribedToDeviceChange = false;
let stableSnapshot: Snapshot = {
  devices: [{ value: "", label: "System default" }],
  loading: true,
  error: null,
};

function notifyListeners() {
  // Always update the stable snapshot before firing listeners
  stableSnapshot = {
    devices: cachedDevices ?? [{ value: "", label: "System default" }],
    loading: cachedLoading,
    error: cachedError,
  };
  for (const listener of listeners) {
    listener();
  }
}

async function refreshDevices(): Promise<void> {
  if (!navigator?.mediaDevices?.enumerateDevices) {
    cachedDevices = [{ value: "", label: "System default" }];
    cachedError = "Media devices API not available";
    cachedLoading = false;
    notifyListeners();
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === "audioinput");
    cachedDevices = [
      { value: "", label: "System default" },
      ...audioInputs.map((d, i) => ({
        value: d.deviceId,
        label: d.label || `Microphone ${i + 1}`,
      })),
    ];
    cachedError = null;
  } catch (err) {
    cachedDevices = [{ value: "", label: "System default" }];
    cachedError = `Could not enumerate audio devices: ${err instanceof Error ? err.message : String(err)}`;
    logWarn("useAudioDevices enumerateDevices failed", { err });
  }

  cachedLoading = false;
  notifyListeners();
}

function getSnapshot(): Snapshot {
  return stableSnapshot;
}

function subscribe(callback: () => void): () => void {
  listeners = [...listeners, callback];

  if (!subscribedToDeviceChange && navigator?.mediaDevices?.addEventListener) {
    subscribedToDeviceChange = true;
    navigator.mediaDevices.addEventListener("devicechange", () => {
      cachedLoading = true;
      notifyListeners();
      void refreshDevices();
    });

    void refreshDevices();
  } else if (cachedDevices === null) {
    void refreshDevices();
  }

  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

export function useAudioDevices(): Snapshot & { refresh: () => void } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refresh = useCallback(() => {
    cachedLoading = true;
    notifyListeners();
    void refreshDevices();
  }, []);

  return { ...snapshot, refresh };
}

/** Reset all module-level state. Only for test isolation. */
export function __resetForTesting(): void {
  cachedDevices = null;
  cachedError = null;
  cachedLoading = true;
  listeners = [];
  subscribedToDeviceChange = false;
  stableSnapshot = {
    devices: [{ value: "", label: "System default" }],
    loading: true,
    error: null,
  };
}
