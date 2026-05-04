import { useEffect, useState } from "react";
import type { McpRuntimeSnapshot } from "@shared/types";
import { safeFireAndForget } from "@/utils/safeFireAndForget";

const INITIAL_SNAPSHOT: McpRuntimeSnapshot = {
  enabled: false,
  state: "disabled",
  port: null,
  lastError: null,
};

/**
 * Reactive hook for the in-process MCP server's runtime state. Subscribes
 * to push transitions from main and hydrates once on mount so a window
 * opened after the initial transitions settled doesn't see `disabled`
 * forever (each `WebContentsView` has an isolated store, so push-only
 * delivery is insufficient). `cancelled` ignores updates after unmount;
 * `receivedPush` ignores the hydration result if a push raced ahead of
 * `getRuntimeState()` on a slow round trip.
 */
export function useMcpReadiness(): McpRuntimeSnapshot {
  const [snapshot, setSnapshot] = useState<McpRuntimeSnapshot>(INITIAL_SNAPSHOT);

  useEffect(() => {
    let cancelled = false;
    let receivedPush = false;

    const cleanup = window.electron.mcpServer.onRuntimeStateChanged((next) => {
      if (cancelled) return;
      receivedPush = true;
      setSnapshot(next);
    });

    safeFireAndForget(
      window.electron.mcpServer
        .getRuntimeState()
        .then((next) => {
          if (cancelled || receivedPush) return;
          setSnapshot(next);
        })
        .catch(() => {
          // Best-effort hydration — push events still drive subsequent updates.
        }),
      { context: "useMcpReadiness:hydration" }
    );

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return snapshot;
}
