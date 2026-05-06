import { useEffect, useRef } from "react";
import { cliAvailabilityClient } from "@/clients";
import { logError } from "@/utils/logger";

const POLL_INTERVAL = 3000;

export type SetAvailability = (
  result: Awaited<ReturnType<typeof cliAvailabilityClient.refresh>>
) => void;

export function useAgentSetupPoll(isOpen: boolean, setAvailability: SetAvailability) {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const poll = () => {
      cliAvailabilityClient
        .refresh()
        .then((result) => {
          if (isOpenRef.current) {
            setAvailability(result);
          }
        })
        .catch((err) => logError("Failed to refresh CLI availability", err));
    };

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const startPolling = () => {
      stopPolling();
      pollRef.current = setInterval(poll, POLL_INTERVAL);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else if (isOpenRef.current) {
        poll();
        startPolling();
      }
    };

    // window.blur fires when the user switches to another OS app (Cmd+Tab).
    // Chromium's visibilitychange does not fire in that case, so the poll
    // would otherwise keep running at full rate while the wizard is hidden
    // behind another application.
    const handleBlur = () => {
      stopPolling();
    };

    // window.focus fires when the user returns to Daintree, but it also fires
    // when switching between project WebContentsViews inside the same
    // BrowserWindow. Guard with document.hasFocus() so we only resume polling
    // when the OS-level app actually regained focus. The pollRef short-circuit
    // prevents a duplicate immediate poll on unminimize, where Chromium fires
    // visibilitychange and window.focus back-to-back.
    const handleFocus = () => {
      if (!document.hasFocus() || !isOpenRef.current || document.hidden) return;
      if (pollRef.current !== null) return;
      poll();
      startPolling();
    };

    if (document.hidden || !document.hasFocus()) {
      // Defer to visibilitychange / focus — fires one refresh on regain
    } else {
      poll();
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      stopPolling();
    };
  }, [isOpen]);
}
