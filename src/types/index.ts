/**
 * Type definitions for Canopy Command Center (Renderer Process)
 *
 * IMPORTANT: These types are duplicated from electron/types/ because the renderer
 * process uses bundler module resolution and cannot directly import from the
 * electron/ directory (which uses NodeNext resolution).
 *
 * DO NOT modify these types directly. They must be kept in sync with the canonical
 * definitions in electron/types/. When updating types:
 * 1. Modify the canonical types in electron/types/
 * 2. Run `npm run build:main` to generate .d.ts files
 * 3. Copy the type definitions here (types only, not implementations)
 *
 * For the canonical type definitions and implementations, see electron/types/
 */

// ============================================================================
// Git Types
// ============================================================================

export type GitStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'ignored' | 'renamed';

export interface FileChangeDetail {
  path: string;
  status: GitStatus;
  insertions: number | null;
  deletions: number | null;
  mtimeMs?: number;
}

export interface WorktreeChanges {
  worktreeId: string;
  rootPath: string;
  changes: FileChangeDetail[];
  changedFileCount: number;
  totalInsertions?: number;
  totalDeletions?: number;
  insertions?: number;
  deletions?: number;
  latestFileMtime?: number;
  lastUpdated: number;
}

// ============================================================================
// Worktree Types
// ============================================================================

export type WorktreeMood = 'stable' | 'active' | 'stale' | 'error';

/**
 * AI summary generation status for a worktree.
 * - 'active': AI summaries are working normally
 * - 'loading': Currently generating an AI summary
 * - 'disabled': No OPENAI_API_KEY set, AI features unavailable
 * - 'error': API errors occurred, showing fallback text
 */
export type AISummaryStatus = 'active' | 'loading' | 'disabled' | 'error';

export interface Worktree {
  id: string;
  path: string;
  name: string;
  branch?: string;
  isCurrent: boolean;
  summary?: string;
  modifiedCount?: number;
  summaryLoading?: boolean;
  changes?: FileChangeDetail[];
  mood?: WorktreeMood;
  aiStatus?: AISummaryStatus;
  lastActivityTimestamp?: number | null;
  aiNote?: string;
  aiNoteTimestamp?: number;
  issueNumber?: number;
  prNumber?: number;
  prUrl?: string;
  prState?: 'open' | 'merged' | 'closed';
}

export interface WorktreeState extends Worktree {
  worktreeId: string;
  worktreeChanges: WorktreeChanges | null;
  lastActivityTimestamp: number | null;
  aiStatus: AISummaryStatus;
}

// ============================================================================
// Dev Server Types
// ============================================================================

export type DevServerStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface DevServerState {
  worktreeId: string;
  status: DevServerStatus;
  url?: string;
  port?: number;
  pid?: number;
  errorMessage?: string;
  logs?: string[];
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType = 'info' | 'success' | 'error' | 'warning';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
}

export type NotificationPayload = Omit<Notification, 'id'> & { id?: string };

// ============================================================================
// Terminal Types
// ============================================================================

export type TerminalType = 'shell' | 'claude' | 'gemini' | 'custom';

export interface TerminalInstance {
  id: string;
  worktreeId?: string;
  type: TerminalType;
  title: string;
  cwd: string;
  pid?: number;
  cols: number;
  rows: number;
}

export interface PtySpawnOptions {
  cwd: string;
  shell?: string;
  args?: string[];
  env?: Record<string, string>;
  cols: number;
  rows: number;
}

export interface TerminalDimensions {
  width: number;
  height: number;
}

// ============================================================================
// Keymap Types
// ============================================================================

export type KeyAction =
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
  | 'file.open'
  | 'file.copyPath'
  | 'file.copyTree'
  | 'ui.refresh'
  | 'ui.escape'
  | 'git.toggle'
  | 'worktree.next'
  | 'worktree.panel'
  | 'app.quit'
  | 'app.forceQuit';

export type KeymapPreset = 'standard' | 'vim';

export interface KeyMapConfig {
  preset?: KeymapPreset;
  overrides?: Partial<Record<KeyAction, string[]>>;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface OpenerConfig {
  cmd: string;
  args: string[];
}

export interface OpenersConfig {
  default: OpenerConfig;
  byExtension: Record<string, OpenerConfig>;
  byGlob: Record<string, OpenerConfig>;
}

export interface QuickLink {
  label: string;
  url: string;
  shortcut?: number;
  command?: string;
}

export interface QuickLinksConfig {
  enabled: boolean;
  links: QuickLink[];
}

export interface MonitorConfig {
  pollIntervalActive?: number;
  pollIntervalBackground?: number;
}

export interface AIConfig {
  summaryDebounceMs?: number;
}

export interface NoteConfig {
  enabled?: boolean;
  filename?: string;
}

export interface DevServerConfig {
  command?: string;
  autoStart?: boolean;
  enabled?: boolean;
}

export interface UIConfig {
  leftClickAction?: 'open' | 'select';
  compactMode?: boolean;
  activePathHighlight?: boolean;
  activePathColor?: 'cyan' | 'blue' | 'green';
}

export interface WorktreesConfig {
  enable: boolean;
  showInHeader: boolean;
}

export interface GitDisplayConfig {
  statusStyle?: 'letter' | 'glyph';
  folderHeatMap?: boolean;
  heatMapIntensity?: 'subtle' | 'normal' | 'intense';
}

export interface CanopyConfig {
  editor: string;
  editorArgs: string[];
  theme: 'auto' | 'dark' | 'light';
  customTheme?: string;
  showHidden: boolean;
  showGitStatus: boolean;
  showFileSize: boolean;
  showModifiedTime: boolean;
  respectGitignore: boolean;
  customIgnores: string[];
  copytreeDefaults: {
    format: string;
    asReference: boolean;
  };
  openers?: OpenersConfig;
  autoRefresh: boolean;
  refreshDebounce: number;
  usePolling: boolean;
  treeIndent: number;
  maxDepth: number | null;
  sortBy: 'name' | 'size' | 'modified' | 'type';
  sortDirection: 'asc' | 'desc';
  ui?: UIConfig;
  worktrees?: WorktreesConfig;
  git?: GitDisplayConfig;
  keys?: KeyMapConfig;
  quickLinks?: QuickLinksConfig;
  devServer?: DevServerConfig;
  monitor?: MonitorConfig;
  ai?: AIConfig;
  note?: NoteConfig;
}
