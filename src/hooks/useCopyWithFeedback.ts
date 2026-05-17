import { useCallback, useEffect, useRef, useState } from "react";
import { useAnnouncerStore } from "@/store/accessibilityAnnouncerStore";
import { UI_ACTION_SUCCESS_DWELL_MS } from "@/lib/animationUtils";

export interface UseCopyWithFeedbackOptions {
  /** How long the `copied` flag stays true. Defaults to UI_ACTION_SUCCESS_DWELL_MS. */
  dwellMs?: number;
  /** Polite live-region message announced on success. Defaults to "Copied". */
  announcement?: string;
}

export interface UseCopyWithFeedbackResult {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
}

/**
 * Standard clipboard-with-feedback gesture: writes text, flips a `copied` flag
 * for the dwell window, and announces once via the polite live region. The
 * announcer is the sole SR signal — callers must keep their visible
 * `aria-label` constant to avoid double-announce.
 */
export function useCopyWithFeedback(
  options: UseCopyWithFeedbackOptions = {}
): UseCopyWithFeedbackResult {
  const { dwellMs = UI_ACTION_SUCCESS_DWELL_MS, announcement = "Copied" } = options;
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return false;
      }
      if (!isMountedRef.current) return true;

      setCopied(true);
      useAnnouncerStore.getState().announce(announcement, "polite");

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        setCopied(false);
        timeoutRef.current = null;
      }, dwellMs);

      return true;
    },
    [announcement, dwellMs]
  );

  return { copied, copy };
}
