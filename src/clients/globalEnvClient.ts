// Singleflight + value cache around `window.electron.globalEnv.get()`.
//
// The IPC handler reads the merged "globalEnvironmentVariables" record from
// electron-store on each call. The result is session-constant: it only changes
// when the user saves new values from EnvironmentSettingsTab. There is no
// IPC change-event channel, so invalidation is explicit at the write site.
//
// Pattern mirrors `projectClient.getCurrent()` — module-level inflight, value
// cache once resolved, version counter so a fetch in flight when invalidate()
// fires does not poison the cache with stale data.

let inflight: Promise<Record<string, string>> | null = null;
let cachedValue: Record<string, string> | null = null;
let hasCachedValue = false;
let cacheVersion = 0;

export function invalidateGlobalEnvCache(): void {
  hasCachedValue = false;
  cachedValue = null;
  inflight = null;
  cacheVersion++;
}

export const globalEnvClient = {
  get: (): Promise<Record<string, string>> => {
    if (hasCachedValue && cachedValue !== null) return Promise.resolve(cachedValue);
    if (inflight) return inflight;

    if (typeof window === "undefined" || !window.electron?.globalEnv?.get) {
      return Promise.resolve({});
    }

    const version = cacheVersion;
    const promise = window.electron.globalEnv
      .get()
      .then((result) => {
        if (cacheVersion === version) {
          cachedValue = result ?? {};
          hasCachedValue = true;
        }
        return result ?? {};
      })
      .finally(() => {
        if (inflight === promise) {
          inflight = null;
        }
      });
    inflight = promise;
    return inflight;
  },

  set: async (vars: Record<string, string>): Promise<void> => {
    invalidateGlobalEnvCache();
    await window.electron.globalEnv.set(vars);
  },

  invalidate: invalidateGlobalEnvCache,
} as const;
