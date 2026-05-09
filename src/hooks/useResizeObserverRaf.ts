import { useLayoutEffect, useRef, useEffectEvent } from "react";

export function useResizeObserverRaf(
  element: HTMLElement | null,
  onResize: (entry: ResizeObserverEntry) => void
): void {
  const onResizeStable = useEffectEvent(onResize);
  const rafIdRef = useRef<number | null>(null);
  const latestEntryRef = useRef<ResizeObserverEntry | null>(null);

  useLayoutEffect(() => {
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      latestEntryRef.current = entry;
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const latest = latestEntryRef.current;
        latestEntryRef.current = null;
        if (latest) {
          onResizeStable(latest);
        }
      });
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [element]);
}
