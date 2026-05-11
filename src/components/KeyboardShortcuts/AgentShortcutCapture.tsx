import { useCallback } from "react";
import { isMac } from "@/lib/platform";
import { SettingsShortcutCapture } from "./SettingsShortcutCapture";
import type { BuiltInAgentId } from "@shared/config/agentIds";

export interface AgentShortcutCaptureProps {
  agentId: BuiltInAgentId;
  onCapture: (combo: string) => void;
  onCancel: () => void;
}

const AGENT_COMBO_PATTERN_MAC = /^Cmd\+Alt\+[A-Za-z]$/;
const AGENT_COMBO_PATTERN_WIN_LINUX = /^Cmd\+Alt\+[A-Za-z]$/;

/**
 * Thin wrapper around SettingsShortcutCapture that enforces the agent-shortcut
 * convention (Cmd+Alt+letter on Mac, Ctrl+Alt+letter elsewhere). The internal
 * combo format uses "Cmd+" on both platforms — SettingsShortcutCapture's
 * keydown handler maps ctrlKey to "Cmd" on non-Mac. We compare against that
 * canonical internal format, not the display form, so the validator stays
 * consistent with stored bindings in defaultKeybindings.ts.
 */
export function AgentShortcutCapture({ agentId, onCapture, onCancel }: AgentShortcutCaptureProps) {
  const actionId = `agent.${agentId}`;
  const mac = isMac();

  const validateCombo = useCallback(
    (combo: string): string | null => {
      // Single-stroke combos only (no chords) for agent shortcuts.
      if (combo.includes(" ")) {
        return mac ? "Agent shortcuts use ⌘⌥ + letter" : "Agent shortcuts use Ctrl+Alt+letter";
      }
      const pattern = mac ? AGENT_COMBO_PATTERN_MAC : AGENT_COMBO_PATTERN_WIN_LINUX;
      if (!pattern.test(combo)) {
        return mac ? "Agent shortcuts use ⌘⌥ + letter" : "Agent shortcuts use Ctrl+Alt+letter";
      }
      return null;
    },
    [mac]
  );

  return (
    <SettingsShortcutCapture
      onCapture={onCapture}
      onCancel={onCancel}
      excludeActionId={actionId}
      validateCombo={validateCombo}
    />
  );
}
