/**
 * useKeybinding Hook
 *
 * Provides a centralized way to bind keyboard shortcuts to actions.
 * Uses the KeybindingService for configuration and scope management.
 *
 * Features:
 * - Automatic scope handling
 * - Prevention of conflicts
 * - Cleanup on unmount
 */

import { useEffect, useCallback } from "react";
import { keybindingService, type KeyScope } from "../services/KeybindingService";

/**
 * Options for the useKeybinding hook
 */
export interface UseKeybindingOptions {
  /**
   * Whether the keybinding is currently enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * Override the scope for this binding
   * If not provided, uses the service's current scope
   */
  scope?: KeyScope;

  /**
   * Whether to prevent default browser behavior
   * @default true
   */
  preventDefault?: boolean;

  /**
   * Whether to stop event propagation
   * @default true
   */
  stopPropagation?: boolean;
}

/**
 * Hook to bind a keyboard shortcut to an action.
 *
 * @param actionId - The action ID from KeybindingService
 * @param callback - Function to call when shortcut is triggered
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * // Simple usage
 * useKeybinding('terminal.palette', () => openPalette());
 *
 * // With options
 * useKeybinding('terminal.close', () => closeTerminal(), {
 *   enabled: isTerminalFocused,
 *   scope: 'terminal'
 * });
 * ```
 */
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
      // Exception: terminal scope bindings are allowed (they handle their own guards)
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        target.closest(".xterm") !== null;

      if (isEditable && binding.scope !== "terminal") {
        return; // Skip this binding, let native behavior happen
      }

      // Check scope match
      const currentScope = scope ?? keybindingService.getScope();
      const bindingScope = binding.scope;

      // Determine if this binding should fire
      // Global bindings fire unless we're in a more specific scope with a conflicting binding
      // Scoped bindings only fire when in their scope
      if (bindingScope !== "global" && bindingScope !== currentScope) {
        return;
      }

      // Check if the event matches the binding's combo
      if (!keybindingService.matchesEvent(e, binding.combo)) {
        return;
      }

      // Execute the callback
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

/**
 * Hook to set the current keybinding scope.
 * Use this in components that need scope-specific shortcuts.
 *
 * @param scope - The scope to activate when component mounts
 * @param active - Whether this component currently has focus/is active
 *
 * @example
 * ```tsx
 * function Modal({ isOpen }) {
 *   useKeybindingScope('modal', isOpen);
 *   // Modal shortcuts now have priority
 * }
 * ```
 */
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

/**
 * Get the display string for a keybinding.
 * Useful for showing shortcuts in UI (tooltips, menus, etc.)
 *
 * @param actionId - The action ID
 * @returns Human-readable keybinding string (e.g., "⌘T" on Mac)
 *
 * @example
 * ```tsx
 * const shortcut = useKeybindingDisplay('terminal.palette');
 * // Returns "⌘T" on Mac, "Ctrl+T" on Windows
 * ```
 */
export function useKeybindingDisplay(actionId: string): string {
  return keybindingService.getDisplayCombo(actionId);
}

export { keybindingService };
