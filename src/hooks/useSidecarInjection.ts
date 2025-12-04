import { useCallback, useState } from "react";
import { useSidecarStore } from "@/store/sidecarStore";

export interface UseSidecarInjectionReturn {
  injectToSidecar: (text: string) => Promise<boolean>;
  isInjecting: boolean;
  error: string | null;
  canInject: boolean;
}

export function useSidecarInjection(): UseSidecarInjectionReturn {
  const [isInjecting, setIsInjecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = useSidecarStore((s) => s.isOpen);
  const activeTabId = useSidecarStore((s) => s.activeTabId);

  const canInject = isOpen && activeTabId !== null;

  const injectToSidecar = useCallback(
    async (text: string): Promise<boolean> => {
      if (!canInject) {
        setError("No active sidecar tab");
        return false;
      }

      setIsInjecting(true);
      setError(null);

      try {
        const result = await window.electron.sidecar.inject({ text });

        if (result.success) {
          return true;
        } else {
          setError(result.error || "Injection failed");
          return false;
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Injection failed";
        setError(message);
        return false;
      } finally {
        setIsInjecting(false);
      }
    },
    [canInject]
  );

  return { injectToSidecar, isInjecting, error, canInject };
}
