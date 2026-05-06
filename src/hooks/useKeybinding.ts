import { useEffect, useMemo, useState } from "react";
import { keybindingService, type KeyScope } from "../services/KeybindingService";
import { comboToAriaKeyshortcuts } from "../lib/kbdShortcut";
import { isMac } from "../lib/platform";

export function useKeybindingScope(scope: KeyScope, active: boolean = true): void {
  useEffect(() => {
    if (!active) return;

    keybindingService.setScope(scope);

    return () => {
      keybindingService.restoreScope(scope);
    };
  }, [scope, active]);
}

export function useKeybindingDisplay(actionId: string): string {
  const [displayCombo, setDisplayCombo] = useState(() =>
    keybindingService.getDisplayCombo(actionId)
  );

  useEffect(() => {
    const updateDisplay = () => {
      setDisplayCombo(keybindingService.getDisplayCombo(actionId));
    };

    updateDisplay();
    return keybindingService.subscribe(updateDisplay);
  }, [actionId]);

  return displayCombo;
}

export function useEffectiveCombo(actionId: string): string | undefined {
  const [combo, setCombo] = useState<string | undefined>(() =>
    keybindingService.getEffectiveCombo(actionId)
  );

  useEffect(() => {
    const update = () => {
      setCombo(keybindingService.getEffectiveCombo(actionId));
    };

    update();
    return keybindingService.subscribe(update);
  }, [actionId]);

  return combo;
}

/**
 * Returns the canonical combo for `actionId` formatted for `aria-keyshortcuts`
 * (e.g. `"Meta+Shift+P"` on macOS, `"Control+Shift+P"` on Win/Linux). Returns
 * `undefined` when no binding exists so callers can spread `aria-keyshortcuts`
 * conditionally without rendering an empty attribute.
 */
export function useAriaKeyshortcuts(actionId: string): string | undefined {
  const combo = useEffectiveCombo(actionId);
  const mac = useMemo(() => isMac(), []);
  return useMemo(() => comboToAriaKeyshortcuts(combo, mac), [combo, mac]);
}

export { keybindingService };
