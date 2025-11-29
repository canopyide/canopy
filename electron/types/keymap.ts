/**
 * Keymap runtime values for configurable keyboard shortcuts
 *
 * Type definitions are imported from @shared/types.
 * This file contains keymap constants and helper functions.
 */

import type { KeyAction, KeymapPreset, KeyMapConfig } from "@shared/types/index.js";

// Re-export types for backward compatibility with existing imports
export type { KeyAction, KeymapPreset, KeyMapConfig } from "@shared/types/index.js";

/**
 * Standard keymap preset bindings.
 * Uses familiar arrow key navigation.
 */
export const STANDARD_KEYMAP: Record<KeyAction, string[]> = {
  // Navigation
  "nav.up": ["up"],
  "nav.down": ["down"],
  "nav.left": ["left"],
  "nav.right": ["right"],
  "nav.pageUp": ["pageup"],
  "nav.pageDown": ["pagedown"],
  "nav.home": ["home"],
  "nav.end": ["end"],
  "nav.expand": ["right", "l"],
  "nav.collapse": ["left", "h"],
  "nav.primary": ["return", "enter"],

  // File operations
  "file.open": ["o"],
  "file.copyPath": ["y"],
  "file.copyTree": ["c"],

  // UI actions
  "ui.refresh": ["r"],
  "ui.escape": ["escape", "q"],

  // Git/Worktree
  "git.toggle": ["g"],
  "worktree.next": ["w"],
  "worktree.panel": ["W"],

  // System
  "app.quit": ["q"],
  "app.forceQuit": ["Q"],
};

/**
 * Vim-style keymap preset bindings.
 * Uses hjkl navigation and vim conventions.
 */
export const VIM_KEYMAP: Record<KeyAction, string[]> = {
  // Navigation (vim-style)
  "nav.up": ["k", "up"],
  "nav.down": ["j", "down"],
  "nav.left": ["h", "left"],
  "nav.right": ["l", "right"],
  "nav.pageUp": ["ctrl+u", "pageup"],
  "nav.pageDown": ["ctrl+d", "pagedown"],
  "nav.home": ["gg"],
  "nav.end": ["G"],
  "nav.expand": ["l", "right"],
  "nav.collapse": ["h", "left"],
  "nav.primary": ["return", "enter"],

  // File operations
  "file.open": ["o"],
  "file.copyPath": ["yy"],
  "file.copyTree": ["yc"],

  // UI actions
  "ui.refresh": ["r"],
  "ui.escape": ["escape"],

  // Git/Worktree
  "git.toggle": ["gs"],
  "worktree.next": ["gw"],
  "worktree.panel": ["gW"],

  // System
  "app.quit": [":q"],
  "app.forceQuit": [":q!"],
};

/**
 * Get the keymap for a given preset.
 */
export function getPresetKeymap(preset: KeymapPreset): Record<KeyAction, string[]> {
  switch (preset) {
    case "vim":
      return VIM_KEYMAP;
    case "standard":
    default:
      return STANDARD_KEYMAP;
  }
}

/**
 * Merge a keymap config with its base preset.
 * Returns a complete keymap with all actions bound.
 */
export function resolveKeymap(config?: KeyMapConfig): Record<KeyAction, string[]> {
  const preset = config?.preset ?? "standard";
  const base = getPresetKeymap(preset);

  if (!config?.overrides) {
    return base;
  }

  return {
    ...base,
    ...config.overrides,
  } as Record<KeyAction, string[]>;
}
