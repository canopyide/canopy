import { useEffect, useRef } from "react";
import { useAnnouncerStore } from "@/store/accessibilityAnnouncerStore";

const ANNOUNCEMENT_DELAY_MS = 100;

function announceToRegion(
  entry: { msg: string; id: number } | null,
  elRef: React.RefObject<HTMLDivElement | null>,
  pendingRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  channel: "polite" | "assertive"
) {
  const el = elRef.current;
  if (!el) return;

  if (pendingRef.current) {
    clearTimeout(pendingRef.current);
    pendingRef.current = null;
  }

  const msg = entry?.msg ?? null;

  if (!msg) {
    el.textContent = "";
    return;
  }

  const entryId = entry!.id;

  el.textContent = "";
  pendingRef.current = setTimeout(() => {
    pendingRef.current = null;
    const current = useAnnouncerStore.getState()[channel];
    if (!current || current.id !== entryId) return;
    if (elRef.current) {
      elRef.current.textContent = msg;
    }
  }, ANNOUNCEMENT_DELAY_MS);
}

export function AccessibilityAnnouncer() {
  const polite = useAnnouncerStore((s) => s.polite);
  const assertive = useAnnouncerStore((s) => s.assertive);

  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);

  const pendingPoliteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAssertiveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    announceToRegion(polite, politeRef, pendingPoliteRef, "polite");
    return () => {
      if (pendingPoliteRef.current) {
        clearTimeout(pendingPoliteRef.current);
        pendingPoliteRef.current = null;
      }
    };
  }, [polite]);

  useEffect(() => {
    announceToRegion(assertive, assertiveRef, pendingAssertiveRef, "assertive");
    return () => {
      if (pendingAssertiveRef.current) {
        clearTimeout(pendingAssertiveRef.current);
        pendingAssertiveRef.current = null;
      }
    };
  }, [assertive]);

  return (
    <>
      <div ref={politeRef} className="sr-only" aria-live="polite" aria-atomic="false" />
      <div ref={assertiveRef} className="sr-only" aria-live="assertive" aria-atomic="false" />
    </>
  );
}
