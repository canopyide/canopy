# Canopy Command Center - Technical Specification

**Version:** 1.0.0
**Status:** Draft
**Last Updated:** 2025-01-28

## Executive Summary

Canopy Command Center is an Electron-based mini IDE designed to serve as "Mission Control" for orchestrating AI coding agents. It transforms the existing Canopy CLI (a terminal-based worktree monitor) into a full-featured desktop application with integrated terminals, a visual worktree dashboard, and seamless context injection for AI agents like Claude and Gemini.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Core Features](#core-features)
4. [Data Models](#data-models)
5. [Event System & IPC](#event-system--ipc)
6. [Services](#services)
7. [UI Components](#ui-components)
8. [Migration Strategy](#migration-strategy)
9. [File Structure](#file-structure)

---

## Project Overview

### Background

The original Canopy CLI is a terminal application built with Ink (React for CLI) that:

- Monitors multiple Git worktrees in a repository
- Tracks file changes and generates AI-powered summaries
- Manages development servers per worktree
- Detects associated GitHub issues and pull requests
- Provides quick access to CopyTree for context generation

### Goals for Canopy Command Center

1. **Visual Dashboard**: Replace Ink-based terminal UI with React DOM components
2. **Integrated Terminals**: Embed xterm.js terminals with node-pty backend
3. **Agent Orchestration**: Launch and manage AI coding agents (Claude, Gemini, etc.)
4. **Context Injection**: One-click injection of CopyTree context into agent terminals
5. **Cross-Platform**: Support macOS and Windows via Electron

### Tech Stack

| Layer              | Technology                 |
| ------------------ | -------------------------- |
| Runtime            | Electron                   |
| Build              | Vite (electron-vite)       |
| UI Framework       | React 18 + TypeScript      |
| Styling            | Tailwind CSS               |
| Terminal           | xterm.js + node-pty        |
| State Management   | Zustand (or React Context) |
| Git Operations     | simple-git                 |
| Process Management | execa                      |

---

## Architecture

### Process Model

```
┌─────────────────────────────────────────────────────────────┐
│                      MAIN PROCESS                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ WorktreeService │  │ DevServerManager│  │ PtyManager  │ │
│  │   (monitoring)  │  │ (dev processes) │  │ (terminals) │ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │
│           │                    │                   │        │
│  ┌────────┴────────────────────┴───────────────────┴──────┐ │
│  │                    IPC Bridge                          │ │
│  │         (contextBridge + typed channels)               │ │
│  └────────────────────────┬───────────────────────────────┘ │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                      RENDERER PROCESS                       │
│  ┌────────────────────────┴───────────────────────────────┐ │
│  │                   React Application                     │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │ │
│  │  │   Sidebar   │  │ Terminal Grid│  │   Toolbar     │  │ │
│  │  │ (Worktrees) │  │  (xterm.js)  │  │  (Actions)    │  │ │
│  │  └─────────────┘  └──────────────┘  └───────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Main → Renderer**: Service events (worktree updates, server status) flow via IPC
2. **Renderer → Main**: User actions (start server, spawn terminal) invoke IPC handlers
3. **Terminal Data**: Bidirectional streaming via dedicated IPC channels per terminal ID

---

## Core Features

### 1. Worktree Monitoring

- Poll Git worktrees at configurable intervals (active: 1s, background: 5s)
- Track file changes with status (added, modified, deleted, renamed)
- Calculate insertion/deletion statistics
- Detect associated GitHub issues and PRs via branch naming conventions
- Generate AI-powered summaries of changes (optional, requires OpenAI key)

### 2. Development Server Management

- Auto-detect `dev`/`start` scripts from package.json
- Spawn and track dev server processes per worktree
- Parse stdout for URL/port detection
- Provide start/stop/restart controls
- Stream logs to UI with size limits

### 3. Terminal Grid

- Multiple terminal instances in a grid layout
- Each terminal backed by node-pty process
- Support for shell (zsh/bash/powershell) and agent commands
- Resize handling with proper SIGWINCH
- **Jank Fix**: CSI parser to block cursor-home jumps during scrolling

### 4. Context Injection (The Killer Feature)

**Implementation:** SDK-based via `copytree` npm package

- "Inject Context" button on worktree cards and terminal toolbar
- Uses **CopyTree SDK** (not CLI) for direct Node.js integration
- **File picker modal** allows selective context generation (choose specific files)
- **Per-agent format selection**:
  - **XML format** for Claude agents (optimized for Claude's prompt structure)
  - **Markdown format** for Gemini agents (better compatibility)
  - Configurable format for custom agents
- **Streaming progress reporting** with real-time updates:
  - Stage indicator (e.g., "Reading files", "Processing")
  - Progress percentage (0-100%)
  - Files processed count
  - Current file being processed
- Pastes the generated context directly into the active terminal
- Shows notification with file count summary upon completion
- Cancellable during generation

### 5. Agent Launchers

- Toolbar buttons to launch AI agents:
  - Claude (`claude` CLI)
  - Gemini (`gemini` CLI)
  - Generic shell
- Each agent gets its own terminal pane
- Agent terminals are pre-configured with worktree CWD

### 6. Command Palette

- Slash-command interface (`/`)
- Built-in commands: `/config`, `/refresh`, `/quit`
- Quick links from configuration
- Fuzzy search with keyboard navigation

---

## Data Models

### Worktree

```typescript
interface Worktree {
  id: string; // Unique identifier (path hash)
  path: string; // Absolute filesystem path
  name: string; // Display name (folder name)
  branch?: string; // Current Git branch
  isCurrent: boolean; // Is this the active worktree?
  summary?: string; // AI-generated summary
  modifiedCount?: number; // Number of modified files
  mood?: WorktreeMood; // Visual indicator state
  aiStatus?: AISummaryStatus; // AI summary generation status
  lastActivityTimestamp?: number; // Last file change timestamp
  aiNote?: string; // Contents of .git/canopy/note
  aiNoteTimestamp?: number; // When the note was last updated
  issueNumber?: number; // Associated GitHub issue
  prNumber?: number; // Associated pull request
  prUrl?: string; // PR URL
  prState?: "open" | "merged" | "closed";
}

type WorktreeMood = "active" | "stable" | "stale" | "error";
type AISummaryStatus = "active" | "loading" | "disabled" | "error";
```

### WorktreeState (Runtime Extension)

```typescript
interface WorktreeState extends Worktree {
  worktreeId: string;
  worktreeChanges: WorktreeChanges | null;
  lastActivityTimestamp: number | null;
  aiStatus: AISummaryStatus;
  aiNote?: string;
  aiNoteTimestamp?: number;
}
```

### WorktreeChanges

```typescript
interface WorktreeChanges {
  worktreeId: string;
  worktreePath: string;
  files: FileChangeDetail[];
  changedFileCount: number;
  insertions: number;
  deletions: number;
  latestMtime: number;
  timestamp: number;
}

interface FileChangeDetail {
  path: string;
  status: GitStatus;
  insertions: number;
  deletions: number;
  mtime?: number;
}

type GitStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked";
```

### DevServerState

```typescript
interface DevServerState {
  worktreeId: string;
  status: DevServerStatus;
  url?: string;
  port?: number;
  pid?: number;
  errorMessage?: string;
  logs: string[];
}

type DevServerStatus = "stopped" | "starting" | "running" | "error";
```

### Terminal Instance

```typescript
interface TerminalInstance {
  id: string;
  worktreeId?: string; // Associated worktree (optional)
  type: "shell" | "claude" | "gemini" | "custom";
  title: string;
  cwd: string;
  pid?: number;
  cols: number;
  rows: number;
}
```

### Configuration

```typescript
interface CanopyConfig {
  // Editor
  editor?: string;
  editorArgs?: string[];

  // Theme
  theme?: "dark" | "light";

  // Monitoring
  monitor?: {
    pollIntervalActive?: number; // ms, default 1000
    pollIntervalBackground?: number; // ms, default 5000
  };

  // AI Features
  ai?: {
    enabled?: boolean;
    summaryDebounceMs?: number; // default 2000
  };

  // Dev Server
  devServer?: {
    enabled?: boolean;
    autoStart?: boolean;
    customCommands?: Record<string, string>;
  };

  // Quick Links
  quickLinks?: {
    enabled?: boolean;
    links?: QuickLink[];
  };

  // CopyTree
  copytree?: {
    defaultProfile?: string;
    extraArgs?: string[];
  };

  // Keymap
  keymap?: {
    preset?: "standard" | "vim";
    overrides?: Record<string, string>;
  };
}
```

---

## Event System & IPC

### Event Categories

The original Canopy uses a typed event bus. For Electron, these events must be mapped to IPC channels:

#### System Events (Main → Renderer)

| Event                 | Payload                                                 | Description              |
| --------------------- | ------------------------------------------------------- | ------------------------ |
| `sys:worktree:update` | `WorktreeState`                                         | Worktree state changed   |
| `sys:worktree:remove` | `{ worktreeId }`                                        | Worktree was removed     |
| `sys:pr:detected`     | `{ worktreeId, prNumber, prUrl, prState, issueNumber }` | PR detected for worktree |
| `sys:pr:cleared`      | `{ worktreeId }`                                        | PR association cleared   |
| `sys:terminal:resize` | `{ width, height }`                                     | Window resized           |

#### Server Events (Main → Renderer)

| Event           | Payload                 | Description               |
| --------------- | ----------------------- | ------------------------- |
| `server:update` | `DevServerState`        | Dev server status changed |
| `server:error`  | `{ worktreeId, error }` | Dev server error          |

#### File Events (Renderer → Main)

| Event            | Payload                                       | Description               |
| ---------------- | --------------------------------------------- | ------------------------- |
| `file:copy-tree` | `{ rootPath?, profile?, extraArgs?, files? }` | Generate CopyTree context |
| `file:open`      | `{ path }`                                    | Open file in editor       |

#### UI Events (Renderer Only)

| Event            | Payload                  | Description       |
| ---------------- | ------------------------ | ----------------- |
| `ui:notify`      | `{ type, message, id? }` | Show notification |
| `ui:modal:open`  | `{ modalId, context }`   | Open modal        |
| `ui:modal:close` | `{ modalId? }`           | Close modal       |

#### Terminal Events (Bidirectional)

| Event             | Direction | Payload                           | Description     |
| ----------------- | --------- | --------------------------------- | --------------- |
| `terminal:spawn`  | R→M       | `{ id, cwd, shell?, cols, rows }` | Create terminal |
| `terminal:data`   | M→R       | `{ id, data }`                    | Terminal output |
| `terminal:input`  | R→M       | `{ id, data }`                    | Terminal input  |
| `terminal:resize` | R→M       | `{ id, cols, rows }`              | Resize terminal |
| `terminal:kill`   | R→M       | `{ id }`                          | Kill terminal   |

### IPC Bridge Design

```typescript
// preload.ts - Exposed to renderer
interface ElectronAPI {
  // Worktree operations
  worktree: {
    getAll(): Promise<WorktreeState[]>;
    refresh(): Promise<void>;
    onUpdate(callback: (state: WorktreeState) => void): () => void;
    onRemove(callback: (data: { worktreeId: string }) => void): () => void;
  };

  // Dev server operations
  devServer: {
    start(worktreeId: string, command?: string): Promise<void>;
    stop(worktreeId: string): Promise<void>;
    toggle(worktreeId: string): Promise<void>;
    onUpdate(callback: (state: DevServerState) => void): () => void;
  };

  // Terminal operations
  terminal: {
    spawn(options: SpawnOptions): Promise<string>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    kill(id: string): Promise<void>;
    onData(id: string, callback: (data: string) => void): () => void;
  };

  // CopyTree operations
  copyTree: {
    generate(worktreeId: string, options?: CopyTreeOptions): Promise<string>;
    injectToTerminal(terminalId: string, worktreeId: string): Promise<void>;
  };

  // System operations
  system: {
    openExternal(url: string): Promise<void>;
    openPath(path: string): Promise<void>;
    getConfig(): Promise<CanopyConfig>;
  };
}
```

---

## Services

### WorktreeService (Main Process)

**Source:** Migrated from `src/services/monitor/WorktreeService.ts`

Responsibilities:

- Maintain a map of `WorktreeMonitor` instances
- Sync monitors when worktrees are added/removed
- Ensure `.git/canopy/note` files exist
- Emit `sys:worktree:update` and `sys:worktree:remove` events via IPC

Key Methods:

```typescript
class WorktreeService {
  sync(): Promise<void>; // Refresh worktree list
  getAllStates(): Map<string, WorktreeState>;
  setActiveWorktree(id: string): void;
  dispose(): void;
}
```

### WorktreeMonitor (Main Process)

**Source:** Migrated from `src/services/monitor/WorktreeMonitor.ts`

Responsibilities:

- Poll a single worktree for changes via `simple-git`
- Track file changes and calculate stats
- Manage AI summary generation (debounced)
- Emit state updates

Key Features:

- Hash-based change detection to avoid redundant updates
- Configurable polling intervals (active vs background)
- Integration with AI services for summaries
- Note file reading from `.git/canopy/note`

### DevServerManager (Main Process)

**Source:** Migrated from `src/services/server/DevServerManager.ts`

Responsibilities:

- Spawn dev server processes via `execa`
- Track process state per worktree
- Parse stdout for URL/port detection
- Manage process lifecycle (start/stop/restart)
- Stream logs with size limits

URL Detection Patterns:

```typescript
const URL_PATTERNS = [
  /https?:\/\/localhost:\d+/,
  /https?:\/\/127\.0\.0\.1:\d+/,
  /https?:\/\/\[::1\]:\d+/,
  /Local:\s*(https?:\/\/[^\s]+)/,
  /ready on\s*(https?:\/\/[^\s]+)/,
];
```

### PtyManager (Main Process) - NEW

**Purpose:** Manage node-pty terminal instances

Responsibilities:

- Spawn PTY processes with configurable shell
- Track active terminals by ID
- Handle resize events (SIGWINCH)
- Stream data to renderer via IPC
- Clean up processes on kill

```typescript
class PtyManager {
  spawn(id: string, options: PtySpawnOptions): void;
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  kill(id: string): void;
  dispose(): void;
}

interface PtySpawnOptions {
  cwd: string;
  shell?: string; // Default: user's default shell
  args?: string[]; // Shell arguments
  env?: Record<string, string>;
  cols: number;
  rows: number;
}
```

### CopyTreeService (Main Process)

**Implementation:** `electron/services/CopyTreeService.ts`

**Purpose:** SDK-based integration with CopyTree for context generation

Responsibilities:

- Use **CopyTree SDK** (`copytree` npm package) for direct Node.js integration
- Generate context with configurable format (XML, Markdown, etc.)
- Stream progress events to renderer for UI updates
- Support selective file inclusion via file picker
- Handle cancellation of in-progress operations
- Return generated context as string with metadata

```typescript
class CopyTreeService {
  generate(
    rootPath: string,
    options?: CopyTreeOptions,
    onProgress?: ProgressCallback,
    traceId?: string
  ): Promise<CopyTreeResult>;

  cancel(opId: string): boolean;
  cancelAll(): void;
  isAvailable(): Promise<boolean>; // Always returns true (SDK is bundled)
}

interface CopyTreeOptions {
  format?: "xml" | "markdown" | "tree"; // Output format
  includePaths?: string[]; // Specific files/paths to include
  filter?: string; // File filter pattern
  exclude?: string[]; // Exclusion patterns
  always?: string[]; // Always include patterns
  modified?: boolean; // Only modified files (git)
  changed?: boolean; // Only changed files (git)
  withLineNumbers?: boolean; // Add line numbers to output
  charLimit?: number; // Character limit per file
  maxFileSize?: number; // Max individual file size
  maxTotalSize?: number; // Max total size
  maxFileCount?: number; // Max number of files
}

interface CopyTreeResult {
  content: string; // Generated context
  fileCount: number; // Number of files processed
  stats?: {
    totalSize: number; // Total bytes processed
    duration: number; // Generation time (ms)
  };
  error?: string; // Error message if failed
}

interface CopyTreeProgress {
  stage: string; // Current stage (e.g., "Reading files")
  progress: number; // Progress 0.0 to 1.0
  message: string; // Human-readable status
  filesProcessed?: number; // Files completed
  totalFiles?: number; // Total files to process
  currentFile?: string; // Current file being processed
  traceId: string; // Operation trace ID
}
```

**Key Features:**

- **Format Selection:** Automatically chooses XML for Claude agents, Markdown for Gemini
- **Streaming Progress:** Real-time updates via `onProgress` callback
- **Cancellation:** Abort controller for in-flight operations
- **Error Handling:** Graceful degradation with detailed error messages
- **SDK Benefits:** No CLI spawning overhead, better performance, richer APIs

---

## UI Components

### Layout Structure

```
┌────────────────────────────────────────────────────────────────┐
│                         Toolbar                                │
│  [Claude] [Gemini] [Shell] [+]          [Settings] [Refresh]   │
├──────────────┬─────────────────────────────────────────────────┤
│              │                                                  │
│   Sidebar    │              Terminal Grid                       │
│  (350px)     │                                                  │
│              │  ┌─────────────────┐  ┌─────────────────┐       │
│ ┌──────────┐ │  │   Terminal 1    │  │   Terminal 2    │       │
│ │Worktree 1│ │  │   (Claude)      │  │   (Shell)       │       │
│ │  Card    │ │  │                 │  │                 │       │
│ └──────────┘ │  └─────────────────┘  └─────────────────┘       │
│              │                                                  │
│ ┌──────────┐ │  ┌─────────────────┐  ┌─────────────────┐       │
│ │Worktree 2│ │  │   Terminal 3    │  │   Terminal 4    │       │
│ │  Card    │ │  │   (Gemini)      │  │   (Shell)       │       │
│ └──────────┘ │  │                 │  │                 │       │
│              │  └─────────────────┘  └─────────────────┘       │
│ ┌──────────┐ │                                                  │
│ │Worktree 3│ │                                                  │
│ │  Card    │ │                                                  │
│ └──────────┘ │                                                  │
│              │                                                  │
└──────────────┴─────────────────────────────────────────────────┘
```

### Component Hierarchy

```
App
├── Toolbar
│   ├── AgentLauncher (Claude, Gemini, Shell buttons)
│   ├── ActionButtons (Settings, Refresh)
│   └── WindowControls (minimize, maximize, close)
├── Sidebar
│   ├── WorktreeList
│   │   └── WorktreeCard (repeated)
│   │       ├── ActivityTrafficLight
│   │       ├── BranchBadge
│   │       ├── FileChangeList
│   │       ├── DevServerStatus
│   │       ├── AINote
│   │       └── ActionButtons (Copy, Code, Issue, PR)
│   └── CommandPalette (overlay)
├── TerminalGrid
│   └── TerminalPane (repeated)
│       ├── TerminalHeader (title, close)
│       ├── XtermAdapter (xterm.js instance)
│       └── TerminalToolbar (inject context, etc.)
└── NotificationStack
```

### WorktreeCard Component

**Migrated from:** `src/components/WorktreeCard.tsx`

Features:

- Activity traffic light (green → yellow → gray decay)
- Branch name with mood-based border color
- Truncated file change list with status icons
- Dev server status row with Start/Stop button
- AI note display with link highlighting
- Action buttons: Copy Tree, Open in Editor, Open Issue, Open PR

Props:

```typescript
interface WorktreeCardProps {
  worktree: WorktreeState;
  isActive: boolean;
  isFocused: boolean;
  onSelect: () => void;
  onCopyTree: () => void;
  onOpenEditor: () => void;
  onToggleServer: () => void;
}
```

### TerminalPane Component

**New for Electron**

Features:

- xterm.js terminal instance
- Header with title and close button
- Toolbar with "Inject Context" button
- Resize handling
- **Jank Fix**: Custom CSI parser to block cursor-home sequences

```typescript
interface TerminalPaneProps {
  id: string;
  title: string;
  worktreeId?: string;
  onClose: () => void;
  onFocus: () => void;
}
```

### ActivityTrafficLight Component

**Migrated from:** `src/components/ActivityTrafficLight.tsx`

Visual indicator showing recent activity:

- **Neon Green** (0-5s): Very recent activity
- **Solid Green** (5-30s): Recent activity
- **Olive** (30-90s): Moderate activity
- **Gray** (90s+): Idle

Uses CSS transitions for smooth color decay.

---

## Migration Strategy

### Phase 0: Infrastructure (Current State)

- [x] Initialize electron-vite template
- [x] Configure TypeScript for main/renderer
- [x] Set up Tailwind CSS
- [ ] Configure native module rebuilding (node-pty)
- [ ] Create IPC bridge architecture

### Phase 1: Backend Migration

1. **Copy Type Definitions**
   - Migrate `src/types/index.ts` to `electron/types/`
   - Migrate `src/types/keymap.ts`

2. **Migrate WorktreeService**
   - Copy `WorktreeService.ts` and `WorktreeMonitor.ts`
   - Replace event bus emissions with IPC sends
   - Test worktree detection in Electron main process

3. **Migrate DevServerManager**
   - Copy `DevServerManager.ts`
   - Verify `execa` works in Electron main
   - Test dev server spawning

4. **Create PtyManager**
   - New service for node-pty management
   - Implement spawn/write/resize/kill methods
   - Set up bidirectional IPC for terminal data

5. **Create CopyTreeService**
   - Wrapper around `copytree` CLI
   - Handle context generation

### Phase 2: Frontend Migration

1. **Layout Skeleton**
   - Create `AppLayout.tsx` with sidebar + terminal grid
   - Implement resizable sidebar

2. **WorktreeCard Migration**
   - Convert Ink components to DOM/Tailwind
   - Implement activity traffic light with CSS
   - Wire up IPC event listeners

3. **WorktreeList Migration**
   - Port virtualization logic (if needed)
   - Implement keyboard navigation

4. **Hooks Migration**
   - `useWorktreeMonitor` → IPC-based
   - `useDevServer` → IPC-based
   - `useKeyboard` → DOM event listeners

### Phase 3: Terminal Implementation

1. **XtermAdapter Component**
   - Initialize xterm.js with addons (fit, webgl)
   - Connect to PtyManager via IPC
   - Implement jank fix CSI parser

2. **TerminalGrid Component**
   - Grid layout management
   - Focus handling
   - Maximize/minimize terminals

3. **Agent Launchers**
   - Toolbar buttons for Claude/Gemini/Shell
   - Pre-configured spawn options

### Phase 4: Context Injection

1. **Inject Context Button**
   - Add to WorktreeCard and TerminalPane
   - Wire to CopyTreeService

2. **Injection Flow**
   - Generate context via IPC
   - Send to terminal as keystrokes
   - Show success notification

### Phase 5: Polish

1. **Window State Persistence**
   - Save/restore window size and position
   - Save/restore open terminals

2. **Performance Optimization**
   - Throttle terminal writes (60fps cap)
   - Optimize worktree list rendering

3. **Packaging**
   - Configure electron-builder
   - Create app icons
   - Test on macOS and Windows

---

## File Structure

```
canopy-app/
├── electron/
│   ├── main.ts                    # App entry point
│   ├── preload.ts                 # IPC bridge (contextBridge)
│   ├── services/
│   │   ├── WorktreeService.ts     # Worktree monitoring
│   │   ├── WorktreeMonitor.ts     # Single worktree monitor
│   │   ├── DevServerManager.ts    # Dev server management
│   │   ├── PtyManager.ts          # Terminal process management
│   │   ├── CopyTreeService.ts     # CopyTree integration
│   │   └── events.ts              # Main process event bus
│   ├── ipc/
│   │   ├── handlers.ts            # IPC handler registration
│   │   └── channels.ts            # Channel name constants
│   └── types/
│       ├── index.ts               # Shared type definitions
│       └── ipc.ts                  # IPC-specific types
├── src/
│   ├── main.tsx                   # Renderer entry point
│   ├── App.tsx                    # Root component
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── AppLayout.tsx      # Main layout container
│   │   │   ├── Sidebar.tsx        # Left sidebar container
│   │   │   └── Toolbar.tsx        # Top toolbar
│   │   ├── Worktree/
│   │   │   ├── WorktreeList.tsx   # Scrollable worktree list
│   │   │   ├── WorktreeCard.tsx   # Individual worktree card
│   │   │   ├── ActivityLight.tsx  # Traffic light indicator
│   │   │   ├── FileChangeList.tsx # File change display
│   │   │   └── DevServerStatus.tsx# Server status row
│   │   ├── Terminal/
│   │   │   ├── TerminalGrid.tsx   # Terminal grid container
│   │   │   ├── TerminalPane.tsx   # Single terminal wrapper
│   │   │   └── XtermAdapter.tsx   # xterm.js integration
│   │   ├── CommandPalette/
│   │   │   └── CommandPalette.tsx # Slash command palette
│   │   └── common/
│   │       ├── Button.tsx
│   │       ├── Badge.tsx
│   │       └── Notification.tsx
│   ├── hooks/
│   │   ├── useWorktrees.ts        # Worktree state management
│   │   ├── useDevServer.ts        # Dev server controls
│   │   ├── useTerminal.ts         # Terminal instance management
│   │   ├── useKeyboard.ts         # Keyboard shortcuts
│   │   └── useElectron.ts         # Typed IPC wrapper
│   ├── store/
│   │   ├── index.ts               # Zustand store setup
│   │   ├── worktreeStore.ts       # Worktree state slice
│   │   └── terminalStore.ts       # Terminal state slice
│   ├── styles/
│   │   ├── globals.css            # Tailwind imports
│   │   └── theme.ts               # Theme tokens
│   └── utils/
│       ├── colorInterpolation.ts  # Activity light colors
│       └── constants.ts           # App constants
├── docs/
│   └── spec.md                    # This document
├── package.json
├── electron.vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── tsconfig.node.json
```

---

## Appendix: Original Canopy CLI Reference

### Key Files to Migrate

| Original File                             | Target Location                             | Notes                 |
| ----------------------------------------- | ------------------------------------------- | --------------------- |
| `src/types/index.ts`                      | `electron/types/index.ts`                   | Core type definitions |
| `src/services/events.ts`                  | `electron/services/events.ts`               | Adapt for IPC         |
| `src/services/monitor/WorktreeService.ts` | `electron/services/WorktreeService.ts`      | Main process          |
| `src/services/monitor/WorktreeMonitor.ts` | `electron/services/WorktreeMonitor.ts`      | Main process          |
| `src/services/server/DevServerManager.ts` | `electron/services/DevServerManager.ts`     | Main process          |
| `src/components/WorktreeCard.tsx`         | `src/components/Worktree/WorktreeCard.tsx`  | DOM conversion        |
| `src/components/ActivityTrafficLight.tsx` | `src/components/Worktree/ActivityLight.tsx` | CSS-based             |
| `src/hooks/useWorktreeMonitor.ts`         | `src/hooks/useWorktrees.ts`                 | IPC-based             |
| `src/hooks/useDevServer.ts`               | `src/hooks/useDevServer.ts`                 | IPC-based             |
| `src/utils/colorInterpolation.ts`         | `src/utils/colorInterpolation.ts`           | Direct copy           |
| `src/theme/colorPalette.ts`               | `src/styles/theme.ts`                       | Tailwind adaptation   |

### Event Channel Mapping

| CLI Event             | IPC Channel         | Direction |
| --------------------- | ------------------- | --------- |
| `sys:worktree:update` | `worktree:update`   | M→R       |
| `sys:worktree:remove` | `worktree:remove`   | M→R       |
| `server:update`       | `devserver:update`  | M→R       |
| `server:error`        | `devserver:error`   | M→R       |
| `file:copy-tree`      | `copytree:generate` | R→M       |
| `ui:notify`           | (renderer only)     | -         |

---

## Version History

| Version | Date       | Changes               |
| ------- | ---------- | --------------------- |
| 1.0.0   | 2025-01-28 | Initial specification |
