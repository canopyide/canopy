import { useCallback } from "react";
import { useToolbarPreferencesStore } from "@/store";
import { useAgentSettingsStore } from "@/store/agentSettingsStore";
import { BUILT_IN_AGENT_IDS } from "@shared/config/agentIds";
import { isAgentPinnedById } from "../../shared/utils/agentPinned";
import type { AnyToolbarButtonId } from "@/../../shared/types/toolbar";

export const AGENT_ID_SET: ReadonlySet<string> = new Set(BUILT_IN_AGENT_IDS);

export interface UnifiedToolbarVisibility {
  isEffectivelyVisible: (buttonId: AnyToolbarButtonId) => boolean;
  toggleVisibility: (buttonId: AnyToolbarButtonId, side: "left" | "right") => void;
}

/**
 * Unifies visibility reads/writes across the two toolbar configuration sources:
 * agent IDs route through `agentSettingsStore.pinned` (IPC-persisted, async);
 * everything else routes through `toolbarPreferencesStore.hiddenButtons` (synchronous,
 * localStorage). Toggle handlers call `getState()` so they don't capture stale
 * closures across async IPC settles.
 */
export function useUnifiedToolbarVisibility(): UnifiedToolbarVisibility {
  const agentSettings = useAgentSettingsStore((s) => s.settings);
  const hiddenButtons = useToolbarPreferencesStore((s) => s.layout.hiddenButtons);

  const isEffectivelyVisible = useCallback(
    (buttonId: AnyToolbarButtonId) => {
      if (AGENT_ID_SET.has(buttonId)) return isAgentPinnedById(agentSettings, buttonId);
      return !hiddenButtons.includes(buttonId);
    },
    [agentSettings, hiddenButtons]
  );

  const toggleVisibility = useCallback((buttonId: AnyToolbarButtonId, side: "left" | "right") => {
    if (AGENT_ID_SET.has(buttonId)) {
      const current = useAgentSettingsStore.getState().settings;
      const nextPinned = !isAgentPinnedById(current, buttonId);
      void useAgentSettingsStore.getState().setAgentPinned(buttonId, nextPinned);
      return;
    }
    useToolbarPreferencesStore.getState().toggleButtonVisibility(buttonId, side);
  }, []);

  return { isEffectivelyVisible, toggleVisibility };
}
