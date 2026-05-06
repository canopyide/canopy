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

    const handleFocus = () => {
      if (!isOpenRef.current || document.hidden) return;
      poll();
      startPolling();
    };

    const handleBlur = () => {
      stopPolling();
    };

    if (document.hidden) {
      // Defer to visibilitychange — fires one refresh on regain
    } else {
      poll();
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      stopPolling();
    };
  }, [isOpen]);
}
