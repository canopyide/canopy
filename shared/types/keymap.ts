/**
 * Keymap types for configurable keyboard shortcuts
 *
 * These types define the keyboard shortcut system used throughout the application.
 */

/**
 * Semantic actions that can be triggered by keyboard shortcuts.
 * Actions are namespaced by category for organization.
 */
export type KeyAction =
  // Navigation actions
  | "nav.up"
  | "nav.down"
  | "nav.left"
  | "nav.right"
  | "nav.pageUp"
  | "nav.pageDown"
  | "nav.home"
  | "nav.end"
  | "nav.expand"
  | "nav.collapse"
  | "nav.primary"

  // File operations
  | "file.open"
  | "file.copyPath"
  | "file.copyTree"

  // UI actions
  | "ui.refresh"
  | "ui.escape"

  // Git/Worktree actions
  | "git.toggle"
  | "worktree.next"
  | "worktree.panel"

  // System actions
  | "app.quit"
  | "app.forceQuit";

/**
 * Available keymap presets.
 * - 'standard': Default keybindings (arrow keys, etc.)
 * - 'vim': Vim-style keybindings (hjkl navigation, etc.)
 */
export type KeymapPreset = "standard" | "vim";

/**
 * Configuration for keyboard shortcuts.
 * Supports preset-based configuration with optional overrides.
 */
export interface KeyMapConfig {
  /**
   * Preset keymap to use as a base.
   * The preset provides default bindings that can be customized via overrides.
   */
  preset?: KeymapPreset;

  /**
   * Override specific key bindings.
   * Maps actions to arrays of key strings (e.g., { 'nav.up': ['j', 'up'] }).
   * Multiple keys can be bound to the same action.
   */
  overrides?: Partial<Record<KeyAction, string[]>>;
}
