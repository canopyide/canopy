import { useEffect, useCallback } from "react";
import { keybindingService, type KeyScope } from "../services/KeybindingService";

export interface UseKeybindingOptions {
  enabled?: boolean;
  scope?: KeyScope;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export function useKeybinding(
  actionId: string,
  callback: (e: KeyboardEvent) => void,
  options: UseKeybindingOptions = {}
): void {
  const { enabled = true, scope, preventDefault = true, stopPropagation = true } = options;

  // Memoize handler to prevent unnecessary re-registrations
  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const binding = keybindingService.getBinding(actionId);
      if (!binding) return;

      // Don't intercept shortcuts if user is typing in an input/textarea or editable content
      // Exception: terminal scope bindings and terminal.* actions are allowed
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      const isInTerminal = target.closest(".xterm") !== null;
      const isTerminalAction = actionId.startsWith("terminal.");

      if (isEditable && binding.scope !== "terminal") {
        return;
      }

      // Allow terminal actions when inside xterm, but block other actions
      if (isInTerminal && !isTerminalAction && binding.scope !== "terminal") {
        return;
      }

      const currentScope = scope ?? keybindingService.getScope();
      const bindingScope = binding.scope;

      // Global bindings fire unless we're in a more specific scope with a conflicting binding
      // Scoped bindings only fire when in their scope
      if (bindingScope !== "global" && bindingScope !== currentScope) {
        return;
      }

      if (!keybindingService.matchesEvent(e, binding.combo)) {
        return;
      }

      if (preventDefault) {
        e.preventDefault();
      }
      if (stopPropagation) {
        e.stopPropagation();
      }
      callback(e);
    },
    [actionId, callback, enabled, scope, preventDefault, stopPropagation]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler, enabled]);
}

export function useKeybindingScope(scope: KeyScope, active: boolean = true): void {
  useEffect(() => {
    if (!active) return;

    const previousScope = keybindingService.getScope();
    keybindingService.setScope(scope);

    return () => {
      // Only restore if we're still the active scope
      if (keybindingService.getScope() === scope) {
        keybindingService.setScope(previousScope);
      }
    };
  }, [scope, active]);
}

export function useKeybindingDisplay(actionId: string): string {
  return keybindingService.getDisplayCombo(actionId);
}

export { keybindingService };
