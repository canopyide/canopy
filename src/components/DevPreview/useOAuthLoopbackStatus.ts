import { useState, useEffect, useRef, useCallback } from "react";
import type { OAuthPhase } from "./BlockedNavBanner";
import type { SessionStorageEntry } from "./useDevPreviewLoadLifecycle";

interface OAuthLoopbackState {
  phase: OAuthPhase | null;
  generation: number;
}

export function useOAuthLoopbackStatus(panelId: string) {
  const [state, setState] = useState<OAuthLoopbackState>({ phase: null, generation: 0 });
  const generationRef = useRef(0);

  useEffect(() => {
    const cleanup = window.electron.webview.onOAuthLoopbackStatus((payload) => {
      if (payload.panelId !== panelId) return;
      if (payload.generation < generationRef.current) return;

      generationRef.current = payload.generation;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- push channel payload shape matches OAuthPhase discriminants
      setState({
        phase: payload as OAuthPhase,
        generation: payload.generation,
      });
    });

    return cleanup;
  }, [panelId]);

  const startOAuth = useCallback(
    async (
      url: string,
      webviewElement: Electron.WebviewTag | null,
      sessionStorageSnapshot: SessionStorageEntry[]
    ) => {
      let wcId: number | undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Electron.WebviewTag getWebContentsId is not in public types yet
        wcId = (webviewElement as unknown as { getWebContentsId(): number })?.getWebContentsId();
      } catch {
        /* webview not ready */
      }
      if (wcId == null) return;

      // Increment generation before starting so stale push events are dropped
      const nextGen = generationRef.current + 1;
      generationRef.current = nextGen;
      setState({ phase: null, generation: nextGen });

      try {
        await window.electron.webview.startOAuthLoopback(
          url,
          panelId,
          wcId,
          sessionStorageSnapshot
        );
      } catch {
        setState({
          phase: { phase: "error", message: "Failed to start sign-in flow" },
          generation: nextGen,
        });
      }
    },
    [panelId]
  );

  const cancelOAuth = useCallback(async () => {
    const nextGen = generationRef.current + 1;
    generationRef.current = nextGen;
    setState({ phase: null, generation: nextGen });
    try {
      await window.electron.webview.cancelOAuthLoopback(panelId);
    } catch {
      // Cancel is fire-and-forget; server teardown races are expected
    }
  }, [panelId]);

  const dismissOAuth = useCallback(() => {
    const nextGen = generationRef.current + 1;
    generationRef.current = nextGen;
    setState({ phase: null, generation: nextGen });
  }, []);

  return {
    phase: state.phase,
    startOAuth,
    cancelOAuth,
    dismissOAuth,
  };
}
