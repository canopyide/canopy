import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Calls `fn` when the document becomes hidden and `enabled` is true.
 *
 * In Electron 41, `WebContentsView` detach (project switch, window close)
 * does not fire `beforeunload` — `visibilitychange` is the reliable signal.
 * IPC channels survive detach until the view is destroyed by LRU eviction,
 * so async flushes initiated here complete safely.
 *
 * The callback is held in a ref so unstable references (recreated each
 * render) always invoke the latest closure. Each callback is responsible
 * for its own error handling.
 */
export function useFlushOnHide(fn: () => void | Promise<void>, enabled: boolean): void {
  const callbackRef = useRef(fn);
  useLayoutEffect(() => {
    callbackRef.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;

    const handler = () => {
      if (!document.hidden) return;
      void callbackRef.current();
    };

    document.addEventListener("visibilitychange", handler);
    // Cover the race where the document is already hidden when this effect
    // runs (e.g., fast project switch between mount and listener registration).
    if (document.hidden) {
      void callbackRef.current();
    }

    return () => {
      document.removeEventListener("visibilitychange", handler);
    };
  }, [enabled]);
}
