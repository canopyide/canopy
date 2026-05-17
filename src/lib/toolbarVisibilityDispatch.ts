import { useAgentSettingsStore } from "@/store/agentSettingsStore";
import { useCliAvailabilityStore } from "@/store/cliAvailabilityStore";
import { useToolbarPreferencesStore } from "@/store/toolbarPreferencesStore";
import { BUILT_IN_AGENT_ID_SET, isAgentToolbarVisible } from "@shared/utils/agentPinned";
import type { AnyToolbarButtonId } from "@/../../shared/types/toolbar";

/**
 * Single dispatch point for toolbar visibility changes. Routes built-in agent
 * IDs to `agentSettingsStore` (preserving the tri-state semantics from #7673)
 * and every other ID — including `agent-tray` and plugin buttons — to
 * `toolbarPreferencesStore.toggleButtonVisibility`.
 *
 * Pass `explicitPinned: false` for "Unpin from toolbar" actions where the
 * intent is to hide regardless of the current state; omit it for checkbox
 * toggles that should flip whatever is currently visible. The flag is ignored
 * for non-agent IDs (their store has no tri-state — visibility is a plain
 * `pinnedButtons[id] !== false`).
 *
 * `side` is forwarded to `toggleButtonVisibility` for non-agent IDs only —
 * agent IDs ignore it. Right-click "unpin" callers that don't have a side
 * available may pass `"left"` as a sentinel.
 */
export function dispatchToolbarVisibility(
  buttonId: AnyToolbarButtonId,
  side: "left" | "right",
  explicitPinned?: boolean
): void {
  if (BUILT_IN_AGENT_ID_SET.has(buttonId)) {
    const nextPinned =
      explicitPinned ??
      !isAgentToolbarVisible(
        useAgentSettingsStore.getState().settings?.agents?.[buttonId],
        useCliAvailabilityStore.getState().availability?.[buttonId]
      );
    void useAgentSettingsStore.getState().setAgentPinned(buttonId, nextPinned);
    return;
  }
  useToolbarPreferencesStore.getState().toggleButtonVisibility(buttonId, side);
}
