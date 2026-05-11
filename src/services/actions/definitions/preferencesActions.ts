import type { ActionCallbacks, ActionRegistry } from "../actionTypes";
import { registerPrefsUiActions } from "./prefsUiActions";
import { registerWindowActions } from "./windowActions";
import { registerKeybindingActions } from "./keybindingActions";
import { registerHelpActions } from "./helpActions";
import { registerTerminalConfigActions } from "./terminalConfigActions";
import { registerAppConfigActions } from "./appConfigActions";

export function registerPreferencesActions(
  actions: ActionRegistry,
  callbacks: ActionCallbacks
): void {
  registerPrefsUiActions(actions, callbacks);
  registerWindowActions(actions, callbacks);
  registerKeybindingActions(actions, callbacks);
  registerHelpActions(actions, callbacks);
  registerTerminalConfigActions(actions, callbacks);
  registerAppConfigActions(actions, callbacks);
}
