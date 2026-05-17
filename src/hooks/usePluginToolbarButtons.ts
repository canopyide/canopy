import { useState, useEffect } from "react";
import type { ToolbarButtonConfig } from "@shared/config/toolbarButtonRegistry";
import type { PluginToolbarButtonId } from "@shared/types/toolbar";
import { useToolbarPreferencesStore } from "@/store";
import { logWarn } from "@/utils/logger";

export interface PluginToolbarButtonState {
  buttonIds: PluginToolbarButtonId[];
  configs: Map<string, ToolbarButtonConfig>;
  isRegistered: (id: string) => boolean;
}

/**
 * Pull plugin-contributed toolbar buttons on mount and keep them in sync with
 * main's authoritative set via push. Pull-on-mount is a safety net for cached
 * `WebContentsView`s that may have missed a broadcast; push is authoritative —
 * once a push arrives, a later-resolving mount-time pull is dropped to avoid
 * rolling back state (mirrors `usePluginPanelKinds`).
 *
 * Each accepted snapshot also sweeps stale `plugin.` entries from the
 * `toolbarPreferencesStore` `pinnedButtons` map. That map is renderer-local
 * persisted state with no main-process access, so an uninstalled plugin's
 * leftover hide entry can only be pruned here off the lifecycle snapshot.
 */
export function usePluginToolbarButtons(): PluginToolbarButtonState {
  const [configs, setConfigs] = useState<Map<string, ToolbarButtonConfig>>(new Map());

  useEffect(() => {
    let disposed = false;
    let pushReceived = false;

    const sync = (buttons: ToolbarButtonConfig[]): void => {
      if (disposed) return;
      const map = new Map<string, ToolbarButtonConfig>();
      for (const btn of buttons) {
        map.set(btn.id, btn);
      }
      setConfigs(map);
      useToolbarPreferencesStore.getState().sweepStalePluginPinnedButtons(Array.from(map.keys()));
    };

    const electron = typeof window !== "undefined" ? window.electron : undefined;
    if (!electron?.plugin) return;

    void electron.plugin
      .toolbarButtons()
      .then((buttons) => {
        if (disposed) return;
        if (pushReceived) return;
        sync(buttons);
      })
      .catch((err: unknown) => {
        logWarn("[PluginToolbarButtons] Failed to fetch initial plugin toolbar buttons", {
          error: err,
        });
      });

    const cleanup = electron.plugin.onToolbarButtonsChanged((payload) => {
      pushReceived = true;
      sync(payload.buttons);
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  const buttonIds = Array.from(configs.keys()) as PluginToolbarButtonId[];
  const isRegistered = (id: string) => id.startsWith("plugin.") && configs.has(id);

  return { buttonIds, configs, isRegistered };
}
