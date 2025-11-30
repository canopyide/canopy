/**
 * KeybindingService - Centralized keybinding management
 *
 * Provides a single source of truth for keyboard shortcuts across the application.
 * Features:
 * - Scope-aware shortcuts (global, terminal, modal)
 * - Priority handling for conflict resolution
 * - Modifier key support (Cmd/Ctrl, Shift, Alt)
 */

/**
 * Scope determines where a shortcut is active:
 * - global: Active anywhere in the app (except when in terminal or modal with higher priority)
 * - terminal: Active when a terminal is focused
 * - modal: Active when a modal dialog is open
 * - worktreeList: Active when worktree list is focused
 */
export type KeyScope = "global" | "terminal" | "modal" | "worktreeList";

/**
 * Configuration for a single keybinding
 */
export interface KeybindingConfig {
  actionId: string;
  combo: string; // e.g., "Cmd+T", "Ctrl+Shift+P", "Escape"
  scope: KeyScope;
  priority: number; // Higher priority wins in conflicts (default 0)
  description?: string;
}

/**
 * Default keybindings for the application.
 * Organized by scope and functionality.
 */
const DEFAULT_KEYBINDINGS: KeybindingConfig[] = [
  // === Global shortcuts (always available unless overridden by scope) ===

  // Terminal management
  {
    actionId: "terminal.palette",
    combo: "Cmd+T",
    scope: "global",
    priority: 0,
    description: "Open terminal palette",
  },
  {
    actionId: "terminal.focusNext",
    combo: "Ctrl+Tab",
    scope: "global",
    priority: 0,
    description: "Focus next terminal",
  },
  {
    actionId: "terminal.focusPrevious",
    combo: "Ctrl+Shift+Tab",
    scope: "global",
    priority: 0,
    description: "Focus previous terminal",
  },
  {
    actionId: "terminal.maximize",
    combo: "Ctrl+Shift+F",
    scope: "global",
    priority: 0,
    description: "Toggle maximize terminal",
  },

  // Agent launchers
  {
    actionId: "agent.claude",
    combo: "Ctrl+Shift+C",
    scope: "global",
    priority: 0,
    description: "Launch Claude agent",
  },
  {
    actionId: "agent.gemini",
    combo: "Ctrl+Shift+G",
    scope: "global",
    priority: 0,
    description: "Launch Gemini agent",
  },

  // Context injection
  {
    actionId: "context.inject",
    combo: "Ctrl+Shift+I",
    scope: "global",
    priority: 0,
    description: "Inject context into focused terminal",
  },

  // Panels - unified diagnostics dock
  {
    actionId: "panel.logs",
    combo: "Ctrl+Shift+L",
    scope: "global",
    priority: 0,
    description: "Open diagnostics dock to Logs tab",
  },
  {
    actionId: "panel.events",
    combo: "Ctrl+Shift+E",
    scope: "global",
    priority: 0,
    description: "Open diagnostics dock to Events tab",
  },
  {
    actionId: "panel.problems",
    combo: "Ctrl+Shift+M",
    scope: "global",
    priority: 0,
    description: "Open diagnostics dock to Problems tab",
  },
  {
    actionId: "panel.diagnostics",
    combo: "Ctrl+`",
    scope: "global",
    priority: 0,
    description: "Toggle diagnostics dock",
  },

  // === Modal shortcuts (active in dialogs) ===
  {
    actionId: "modal.close",
    combo: "Escape",
    scope: "modal",
    priority: 10,
    description: "Close modal dialog",
  },

  // === Worktree list shortcuts (active when list is focused) ===
  {
    actionId: "worktree.up",
    combo: "ArrowUp",
    scope: "worktreeList",
    priority: 5,
    description: "Move up in worktree list",
  },
  {
    actionId: "worktree.down",
    combo: "ArrowDown",
    scope: "worktreeList",
    priority: 5,
    description: "Move down in worktree list",
  },
  {
    actionId: "worktree.upVim",
    combo: "k",
    scope: "worktreeList",
    priority: 5,
    description: "Move up in worktree list (vim)",
  },
  {
    actionId: "worktree.downVim",
    combo: "j",
    scope: "worktreeList",
    priority: 5,
    description: "Move down in worktree list (vim)",
  },
  {
    actionId: "worktree.home",
    combo: "Home",
    scope: "worktreeList",
    priority: 5,
    description: "Go to first worktree",
  },
  {
    actionId: "worktree.end",
    combo: "End",
    scope: "worktreeList",
    priority: 5,
    description: "Go to last worktree",
  },
  {
    actionId: "worktree.select",
    combo: "Enter",
    scope: "worktreeList",
    priority: 5,
    description: "Select worktree",
  },
  {
    actionId: "worktree.selectSpace",
    combo: " ",
    scope: "worktreeList",
    priority: 5,
    description: "Select worktree (space)",
  },
  {
    actionId: "worktree.copyTree",
    combo: "c",
    scope: "worktreeList",
    priority: 5,
    description: "Copy tree context",
  },
  {
    actionId: "worktree.openEditor",
    combo: "e",
    scope: "worktreeList",
    priority: 5,
    description: "Open in editor",
  },
  {
    actionId: "worktree.toggleServer",
    combo: "s",
    scope: "worktreeList",
    priority: 5,
    description: "Toggle dev server",
  },
];

/**
 * Normalize key names to a consistent format
 */
function normalizeKey(key: string): string {
  const keyMap: Record<string, string> = {
    " ": "Space",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
    escape: "Escape",
    enter: "Enter",
    return: "Enter",
    tab: "Tab",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pagedown: "PageDown",
    backspace: "Backspace",
    delete: "Delete",
  };
  return keyMap[key.toLowerCase()] || key;
}

/**
 * Parse a combo string into modifiers and key
 */
function parseCombo(combo: string): {
  cmd: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
} {
  const parts = combo.split("+").map((p) => p.trim());
  const key = normalizeKey(parts.pop() || "");

  return {
    cmd: parts.some((p) => p.toLowerCase() === "cmd" || p.toLowerCase() === "meta"),
    ctrl: parts.some((p) => p.toLowerCase() === "ctrl"),
    shift: parts.some((p) => p.toLowerCase() === "shift"),
    alt: parts.some((p) => p.toLowerCase() === "alt" || p.toLowerCase() === "option"),
    key,
  };
}

/**
 * KeybindingService manages keybindings for the application.
 * Uses a singleton pattern for global access.
 */
class KeybindingService {
  private bindings: Map<string, KeybindingConfig> = new Map();
  private currentScope: KeyScope = "global";

  constructor() {
    DEFAULT_KEYBINDINGS.forEach((binding) => {
      this.bindings.set(binding.actionId, binding);
    });
  }

  /**
   * Set the current active scope
   */
  setScope(scope: KeyScope): void {
    this.currentScope = scope;
  }

  /**
   * Get the current scope
   */
  getScope(): KeyScope {
    return this.currentScope;
  }

  /**
   * Get binding configuration for an action
   */
  getBinding(actionId: string): KeybindingConfig | undefined {
    return this.bindings.get(actionId);
  }

  /**
   * Get all bindings
   */
  getAllBindings(): KeybindingConfig[] {
    return Array.from(this.bindings.values());
  }

  /**
   * Check if a keyboard event matches a combo string
   */
  matchesEvent(event: KeyboardEvent, combo: string): boolean {
    const parsed = parseCombo(combo);

    // Handle Cmd vs Ctrl based on platform
    // On macOS, Cmd (metaKey) is the primary modifier
    // On Windows/Linux, Ctrl is the primary modifier
    const isMac =
      typeof navigator !== "undefined" &&
      navigator.platform &&
      navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const hasCmd = isMac ? event.metaKey : event.ctrlKey;

    // Check modifiers
    if (parsed.cmd && !hasCmd) return false;
    if (parsed.ctrl && !event.ctrlKey) return false;
    if (parsed.shift && !event.shiftKey) return false;
    if (parsed.alt && !event.altKey) return false;

    // Check that we don't have extra modifiers
    // (unless the combo expects them)
    if (!parsed.cmd && hasCmd) return false;
    if (!parsed.shift && event.shiftKey) return false;
    if (!parsed.alt && event.altKey) return false;
    // Ctrl check is more nuanced due to Cmd/Ctrl swap
    if (!parsed.cmd && !parsed.ctrl && event.ctrlKey && !isMac) return false;

    // Check key
    const eventKey = normalizeKey(event.key);
    if (eventKey.toLowerCase() !== parsed.key.toLowerCase()) return false;

    return true;
  }

  /**
   * Check if an action can execute in the current scope
   */
  canExecute(actionId: string): boolean {
    const binding = this.bindings.get(actionId);
    if (!binding) return false;

    // Global shortcuts always work
    if (binding.scope === "global") return true;

    // Scope-specific shortcuts only work in their scope
    return binding.scope === this.currentScope;
  }

  /**
   * Find the action that matches a keyboard event
   * Returns the highest priority match for the current scope
   */
  findMatchingAction(event: KeyboardEvent): KeybindingConfig | undefined {
    let bestMatch: KeybindingConfig | undefined;
    let bestPriority = -Infinity;

    for (const binding of this.bindings.values()) {
      if (!this.canExecute(binding.actionId)) continue;
      if (!this.matchesEvent(event, binding.combo)) continue;

      if (binding.priority > bestPriority) {
        bestMatch = binding;
        bestPriority = binding.priority;
      }
    }

    return bestMatch;
  }

  /**
   * Register a custom binding (override default)
   */
  registerBinding(config: KeybindingConfig): void {
    this.bindings.set(config.actionId, config);
  }

  /**
   * Remove a binding
   */
  removeBinding(actionId: string): void {
    this.bindings.delete(actionId);
  }

  /**
   * Get human-readable description of a keybinding
   */
  getDisplayCombo(actionId: string): string {
    const binding = this.bindings.get(actionId);
    if (!binding) return "";

    const isMac =
      typeof navigator !== "undefined" &&
      navigator.platform &&
      navigator.platform.toUpperCase().indexOf("MAC") >= 0;

    // Replace modifier names for display
    let display = binding.combo;
    if (isMac) {
      display = display.replace(/Cmd\+/gi, "⌘");
      display = display.replace(/Ctrl\+/gi, "⌃");
      display = display.replace(/Shift\+/gi, "⇧");
      display = display.replace(/Alt\+/gi, "⌥");
    } else {
      display = display.replace(/Cmd\+/gi, "Ctrl+");
    }

    return display;
  }
}

// Export singleton instance
export const keybindingService = new KeybindingService();

// Export class for testing
export { KeybindingService };
