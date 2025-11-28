/**
 * Keymap types for configurable keyboard shortcuts
 * Migrated from the original Canopy CLI
 */

/**
 * Semantic actions that can be triggered by keyboard shortcuts.
 * Actions are namespaced by category for organization.
 */
export type KeyAction =
  // Navigation actions
  | 'nav.up'
  | 'nav.down'
  | 'nav.left'
  | 'nav.right'
  | 'nav.pageUp'
  | 'nav.pageDown'
  | 'nav.home'
  | 'nav.end'
  | 'nav.expand'
  | 'nav.collapse'
  | 'nav.primary'

  // File operations
  | 'file.open'
  | 'file.copyPath'
  | 'file.copyTree'

  // UI actions
  | 'ui.refresh'
  | 'ui.escape'

  // Git/Worktree actions
  | 'git.toggle'
  | 'worktree.next'
  | 'worktree.panel'

  // System actions
  | 'app.quit'
  | 'app.forceQuit';

/**
 * Available keymap presets.
 * - 'standard': Default keybindings (arrow keys, etc.)
 * - 'vim': Vim-style keybindings (hjkl navigation, etc.)
 */
export type KeymapPreset = 'standard' | 'vim';

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

/**
 * Standard keymap preset bindings.
 * Uses familiar arrow key navigation.
 */
export const STANDARD_KEYMAP: Record<KeyAction, string[]> = {
  // Navigation
  'nav.up': ['up'],
  'nav.down': ['down'],
  'nav.left': ['left'],
  'nav.right': ['right'],
  'nav.pageUp': ['pageup'],
  'nav.pageDown': ['pagedown'],
  'nav.home': ['home'],
  'nav.end': ['end'],
  'nav.expand': ['right', 'l'],
  'nav.collapse': ['left', 'h'],
  'nav.primary': ['return', 'enter'],

  // File operations
  'file.open': ['o'],
  'file.copyPath': ['y'],
  'file.copyTree': ['c'],

  // UI actions
  'ui.refresh': ['r'],
  'ui.escape': ['escape', 'q'],

  // Git/Worktree
  'git.toggle': ['g'],
  'worktree.next': ['w'],
  'worktree.panel': ['W'],

  // System
  'app.quit': ['q'],
  'app.forceQuit': ['Q'],
};

/**
 * Vim-style keymap preset bindings.
 * Uses hjkl navigation and vim conventions.
 */
export const VIM_KEYMAP: Record<KeyAction, string[]> = {
  // Navigation (vim-style)
  'nav.up': ['k', 'up'],
  'nav.down': ['j', 'down'],
  'nav.left': ['h', 'left'],
  'nav.right': ['l', 'right'],
  'nav.pageUp': ['ctrl+u', 'pageup'],
  'nav.pageDown': ['ctrl+d', 'pagedown'],
  'nav.home': ['gg'],
  'nav.end': ['G'],
  'nav.expand': ['l', 'right'],
  'nav.collapse': ['h', 'left'],
  'nav.primary': ['return', 'enter'],

  // File operations
  'file.open': ['o'],
  'file.copyPath': ['yy'],
  'file.copyTree': ['yc'],

  // UI actions
  'ui.refresh': ['r'],
  'ui.escape': ['escape'],

  // Git/Worktree
  'git.toggle': ['gs'],
  'worktree.next': ['gw'],
  'worktree.panel': ['gW'],

  // System
  'app.quit': [':q'],
  'app.forceQuit': [':q!'],
};

/**
 * Get the keymap for a given preset.
 */
export function getPresetKeymap(preset: KeymapPreset): Record<KeyAction, string[]> {
  switch (preset) {
    case 'vim':
      return VIM_KEYMAP;
    case 'standard':
    default:
      return STANDARD_KEYMAP;
  }
}

/**
 * Merge a keymap config with its base preset.
 * Returns a complete keymap with all actions bound.
 */
export function resolveKeymap(config?: KeyMapConfig): Record<KeyAction, string[]> {
  const preset = config?.preset ?? 'standard';
  const base = getPresetKeymap(preset);

  if (!config?.overrides) {
    return base;
  }

  return {
    ...base,
    ...config.overrides,
  } as Record<KeyAction, string[]>;
}
