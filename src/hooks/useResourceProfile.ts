import { useEffect } from "react";
import { setMaxContexts, setPassiveThreshold } from "../services/terminal/TerminalWebGLConfig";
import type { ResourceProfilePayload } from "@shared/types/resourceProfile";

export function useResourceProfile(): void {
  useEffect(() => {
    const cleanup = window.electron.system.onResourceProfileChanged(
      (payload: ResourceProfilePayload) => {
        setMaxContexts(payload.config.maxWebGLContexts);
        setPassiveThreshold(payload.config.passiveWebGLThreshold);
      }
    );
    return cleanup;
  }, []);
}
