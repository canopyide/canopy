import { useEffect, useState } from "react";
import { keybindingService, type KeyScope } from "../services/KeybindingService";

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

export { keybindingService };
