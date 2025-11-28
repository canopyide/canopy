/**
 * Configuration type definitions for Canopy Command Center
 * Migrated from the original Canopy CLI
 */

import type { KeyMapConfig } from './keymap.js';

// ============================================================================
// Opener Configuration
// ============================================================================

/** Configuration for opening files with external applications */
export interface OpenerConfig {
  /** Command to execute (editor name or path) */
  cmd: string;
  /** Arguments to pass to command */
  args: string[];
}

/** Configuration for file openers with pattern matching */
export interface OpenersConfig {
  /** Fallback opener used when no patterns match */
  default: OpenerConfig;
  /** Extension-based opener mapping (e.g., { '.md': { cmd: 'typora', args: [] } }) */
  byExtension: Record<string, OpenerConfig>;
  /** Glob pattern-based opener mapping */
  byGlob: Record<string, OpenerConfig>;
}

// ============================================================================
// Quick Links Configuration
// ============================================================================

/** A configurable quick link for external tools (chat clients, dashboards, etc.) */
export interface QuickLink {
  /** Display label for the link */
  label: string;
  /** URL to open in default browser */
  url: string;
  /** Optional keyboard shortcut number (1-9) for Cmd+{num} access */
  shortcut?: number;
  /** Optional slash command name (e.g., "gemini" for /gemini) */
  command?: string;
}

/** Configuration for the quick links feature */
export interface QuickLinksConfig {
  /** Enable/disable the quick links feature (default: true) */
  enabled: boolean;
  /** Configured links */
  links: QuickLink[];
}

// ============================================================================
// Monitor Configuration
// ============================================================================

/**
 * Configuration for worktree monitor polling intervals.
 * Allows tuning for large monorepos or resource-constrained environments.
 */
export interface MonitorConfig {
  /** Polling interval for active worktree in ms (default: 2000, min: 500, max: 60000) */
  pollIntervalActive?: number;
  /** Polling interval for background worktrees in ms (default: 10000, min: 5000, max: 300000) */
  pollIntervalBackground?: number;
}

// ============================================================================
// AI Configuration
// ============================================================================

/** Configuration for AI-powered features */
export interface AIConfig {
  /** Debounce interval for AI summary generation in ms (default: 10000, min: 1000, max: 60000) */
  summaryDebounceMs?: number;
}

/**
 * Configuration for the AI note feature.
 * Allows AI agents to communicate status by writing to a well-known file.
 */
export interface NoteConfig {
  /** Enable/disable the AI note feature (default: true) */
  enabled?: boolean;
  /** Override the note filename (default: 'canopy/note') */
  filename?: string;
}

// ============================================================================
// Dev Server Configuration
// ============================================================================

/** Configuration for development server management */
export interface DevServerConfig {
  /** Custom dev server command (e.g., "npm run start:frontend") */
  command?: string;
  /** Auto-start servers on application launch (default: false) */
  autoStart?: boolean;
  /** Enable/disable dev server feature (default: false, must be explicitly enabled) */
  enabled?: boolean;
}

// ============================================================================
// UI Configuration
// ============================================================================

/** Configuration for UI behavior and appearance */
export interface UIConfig {
  /** Action to perform on left click ('open' opens file, 'select' selects it) */
  leftClickAction?: 'open' | 'select';
  /** Use compact mode for denser information display */
  compactMode?: boolean;
  /** Highlight the active path in the tree */
  activePathHighlight?: boolean;
  /** Color for active path highlight */
  activePathColor?: 'cyan' | 'blue' | 'green';
}

/** Configuration for worktree features */
export interface WorktreesConfig {
  /** Master toggle for worktree features */
  enable: boolean;
  /** Show/hide worktree indicator in header */
  showInHeader: boolean;
}

/** Configuration for git-related display */
export interface GitDisplayConfig {
  /** Style for git status indicators ('letter' = M/A/D, 'glyph' = colored dots) */
  statusStyle?: 'letter' | 'glyph';
  /** Enable folder heat coloring based on changes */
  folderHeatMap?: boolean;
  /** Intensity of heat map coloring */
  heatMapIntensity?: 'subtle' | 'normal' | 'intense';
}

// ============================================================================
// Main Configuration Interface
// ============================================================================

/** Complete application configuration */
export interface CanopyConfig {
  /** Default editor command */
  editor: string;
  /** Arguments to pass to the editor */
  editorArgs: string[];
  /** Theme mode */
  theme: 'auto' | 'dark' | 'light';
  /** Optional path to custom theme JSON file */
  customTheme?: string;
  /** Show hidden files in file tree */
  showHidden: boolean;
  /** Show git status indicators */
  showGitStatus: boolean;
  /** Show file sizes */
  showFileSize: boolean;
  /** Show last modified times */
  showModifiedTime: boolean;
  /** Respect .gitignore rules */
  respectGitignore: boolean;
  /** Additional ignore patterns */
  customIgnores: string[];
  /** Default settings for copytree operations */
  copytreeDefaults: {
    /** Output format */
    format: string;
    /** Use as reference mode */
    asReference: boolean;
  };
  /** File opener configurations */
  openers?: OpenersConfig;
  /** Enable automatic refresh on file changes */
  autoRefresh: boolean;
  /** Debounce time for refresh in ms */
  refreshDebounce: number;
  /** Use polling instead of native file watching */
  usePolling: boolean;
  /** Indentation size for tree display */
  treeIndent: number;
  /** Maximum depth for tree display (null for unlimited) */
  maxDepth: number | null;
  /** Sort files by this property */
  sortBy: 'name' | 'size' | 'modified' | 'type';
  /** Sort direction */
  sortDirection: 'asc' | 'desc';
  /** UI-related configuration */
  ui?: UIConfig;
  /** Worktree feature configuration */
  worktrees?: WorktreesConfig;
  /** Git display configuration */
  git?: GitDisplayConfig;
  /** Keyboard shortcuts configuration */
  keys?: KeyMapConfig;
  /** Quick links configuration */
  quickLinks?: QuickLinksConfig;
  /** Dev server configuration */
  devServer?: DevServerConfig;
  /** Monitor polling configuration */
  monitor?: MonitorConfig;
  /** AI feature configuration */
  ai?: AIConfig;
  /** AI note display feature */
  note?: NoteConfig;
}

// ============================================================================
// Default Configuration
// ============================================================================

/** Default configuration values */
export const DEFAULT_CONFIG: CanopyConfig = {
  editor: 'code',
  editorArgs: ['-r'],
  theme: 'auto',
  showHidden: false,
  showGitStatus: true,
  showFileSize: false,
  showModifiedTime: false,
  respectGitignore: true,
  customIgnores: [
    '**/.git/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.DS_Store',
    '**/coverage/**',
    '**/__pycache__/**',
  ],
  copytreeDefaults: {
    format: 'xml',
    asReference: true,
  },
  openers: {
    default: { cmd: 'code', args: ['-r'] },
    byExtension: {},
    byGlob: {},
  },
  autoRefresh: true,
  refreshDebounce: 100,
  usePolling: true,
  treeIndent: 2,
  maxDepth: null,
  sortBy: 'name',
  sortDirection: 'asc',
  ui: {
    leftClickAction: 'open',
    compactMode: true,
    activePathHighlight: true,
    activePathColor: 'cyan',
  },
  worktrees: {
    enable: true,
    showInHeader: true,
  },
  git: {
    statusStyle: 'glyph',
    folderHeatMap: true,
    heatMapIntensity: 'normal',
  },
  quickLinks: {
    enabled: true,
    links: [],
  },
  devServer: {
    enabled: false,
    autoStart: false,
  },
  monitor: {
    pollIntervalActive: 2000,
    pollIntervalBackground: 10000,
  },
  ai: {
    summaryDebounceMs: 10000,
  },
  note: {
    enabled: true,
    filename: 'canopy/note',
  },
};
