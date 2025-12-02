# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**See @docs/spec.md for the complete technical specification, architecture, and data models.**

## Project Overview

Canopy Command Center is a feature-rich Electron-based mini IDE for orchestrating AI coding agents. It provides integrated terminals, a visual worktree dashboard, context injection for AI agents, agent lifecycle tracking, and session transcripts.

**Original Canopy CLI location:** `/Users/gpriday/Projects/CopyTree/canopy`

## Development Commands

```bash
# Start development (Electron + Vite concurrently)
npm run dev

# Start only the Vite dev server (renderer)
npm run dev:vite

# Start only Electron (requires build:main first)
npm run dev:electron

# Build main process TypeScript
npm run build:main

# Full production build
npm run build

# Package for distribution
npm run package

# Rebuild native modules (node-pty) for Electron
npm run rebuild
```

## Code Quality

```bash
# Run all checks (typecheck + lint + format) - use before committing
npm run check

# Auto-fix formatting and lint issues
npm run fix

# Individual commands
npm run typecheck     # TypeScript type checking (all configs)
npm run lint          # Run ESLint
npm run lint:fix      # Run ESLint with auto-fix
npm run format        # Format code with Prettier
npm run format:check  # Check formatting without changes
```

## Code Commenting Guidelines

**Optimize for Token Efficiency**

This project is AI-first. Comments must be minimal to preserve the context window.

- **No Decoration:** Strictly avoid decorative separator lines (e.g., `=====`, `-----`) or block framing.
- **Be Terse:** Use direct, brief language. Avoid conversational filler.
- **High Signal:** Only document non-obvious logic, complex rationale, or edge cases.
- **No Redundancy:** Do not restate information that is already obvious from variable names or types.

## Architecture

### Two-Process Model

- **Main Process** (`electron/`): Node.js environment running Electron. Handles native modules (node-pty), file system access, git operations, services, and IPC.
- **Renderer Process** (`src/`): Browser environment with React 19. Communicates with main process via IPC bridge.

### IPC Bridge Pattern

All main/renderer communication goes through `contextBridge` in `electron/preload.ts`. The API is organized into namespaces:

```typescript
// Renderer calls via namespaced API:
window.electron.worktree.getAll();
window.electron.terminal.spawn(options);
window.electron.copyTree.injectToTerminal(terminalId, worktreeId);

// Event subscriptions return cleanup functions:
const cleanup = window.electron.terminal.onData(id, callback);
```

### Key Technologies

| Component             | Technology                        |
| --------------------- | --------------------------------- |
| Runtime               | Electron 33                       |
| UI Framework          | React 19 + TypeScript             |
| Build                 | Vite 6                            |
| State Management      | Zustand                           |
| Terminal emulation    | xterm.js + @xterm/addon-fit/webgl |
| PTY (pseudo-terminal) | node-pty (native module)          |
| Git operations        | simple-git                        |
| Process management    | execa                             |
| Styling               | Tailwind CSS v4                   |
| AI Integration        | OpenAI SDK                        |

## Project Structure

```
electron/
├── main.ts              # Electron entry, window creation
├── preload.ts           # IPC bridge (contextBridge.exposeInMainWorld)
├── menu.ts              # Application menu
├── store.ts             # electron-store wrapper
├── windowState.ts       # Window state persistence
├── ipc/
│   ├── channels.ts      # IPC channel name constants (110+ channels)
│   ├── handlers.ts      # IPC request handlers
│   ├── types.ts         # IPC type definitions
│   └── errorHandlers.ts # Error handling utilities
├── services/
│   ├── WorktreeService.ts   # Worktree monitoring orchestrator
│   ├── WorktreeMonitor.ts   # Individual worktree monitor
│   ├── DevServerManager.ts  # Dev server lifecycle management
│   ├── PtyManager.ts        # Terminal process management
│   ├── CopyTreeService.ts   # Context generation integration
│   ├── AgentStateMachine.ts # Agent state tracking
│   ├── TranscriptManager.ts # Agent session recording
│   ├── ArtifactExtractor.ts # Extract code from agent output
│   ├── ProjectStore.ts      # Multi-project management
│   ├── EventBuffer.ts       # Event inspection buffering
│   ├── LogBuffer.ts         # Log aggregation
│   ├── events.ts            # Event bus for main process
│   └── ai/                  # AI integration
│       ├── client.ts        # OpenAI client wrapper
│       ├── worktree.ts      # Worktree AI summaries
│       ├── identity.ts      # Project identity generation
│       └── issueExtractor.ts # GitHub issue detection
├── types/
│   ├── index.ts         # Core types
│   ├── config.ts        # Configuration types
│   ├── keymap.ts        # Keyboard shortcut types
│   └── recipe.ts        # Terminal recipe types
└── utils/
    ├── logger.ts        # Logging utilities
    ├── git.ts           # Git operations
    └── worktreeMood.ts  # Worktree status calculation

src/
├── App.tsx              # React root component
├── main.tsx             # React entry point
├── index.css            # Global styles (Tailwind)
├── components/
│   ├── Layout/
│   │   ├── AppLayout.tsx    # Main layout container
│   │   ├── Sidebar.tsx      # Worktree sidebar
│   │   └── Toolbar.tsx      # Top toolbar with agent launchers
│   ├── Terminal/
│   │   ├── TerminalGrid.tsx # Grid layout manager
│   │   ├── TerminalPane.tsx # Individual terminal wrapper
│   │   ├── XtermAdapter.tsx # xterm.js integration
│   │   └── BulkActionsMenu.tsx # Bulk terminal operations
│   ├── Worktree/
│   │   ├── WorktreeCard.tsx    # Worktree status card
│   │   ├── WorktreeList.tsx    # Scrollable list
│   │   ├── ActivityLight.tsx   # Activity indicator
│   │   └── FileChangeList.tsx  # Git file changes display
│   ├── TerminalPalette/    # Quick terminal switching (Cmd+T)
│   ├── TerminalRecipe/     # Saved terminal configurations
│   ├── ContextInjection/   # CopyTree progress UI
│   ├── Settings/           # Settings dialog (AI config, etc.)
│   ├── Errors/             # Error display and recovery
│   ├── Logs/               # Log viewer panel
│   ├── EventInspector/     # Event debugging panel
│   └── ui/                 # Shared UI components (shadcn/ui style)
├── hooks/
│   ├── useWorktrees.ts         # Worktree state via IPC
│   ├── useDevServer.ts         # Dev server controls
│   ├── useTerminalPalette.ts   # Terminal palette logic
│   ├── useAgentLauncher.ts     # Agent spawning
│   ├── useContextInjection.ts  # CopyTree context injection
│   └── useWorktreeTerminals.ts # Worktree terminal tracking
├── store/
│   ├── terminalStore.ts    # Terminal state (instances, focus, bulk ops)
│   ├── worktreeStore.ts    # Active worktree selection
│   ├── errorStore.ts       # Error collection
│   ├── logsStore.ts        # Log entries
│   ├── eventStore.ts       # Event inspector state
│   └── recipeStore.ts      # Terminal recipes
├── types/
│   └── electron.d.ts       # TypeScript declarations for window.electron
├── lib/
│   └── utils.ts            # Utility functions (cn for classnames)
└── utils/
    └── colorInterpolation.ts # Activity light color transitions
```

## Installing Dependencies

**IMPORTANT:** Always use `npm install`, never `npm ci`. The `package-lock.json` is gitignored in this project, so `npm ci` will fail.

```bash
npm install  # Installs deps + auto-rebuilds node-pty for Electron
```

## Native Module Handling

node-pty is a native module that must be rebuilt for Electron's Node version:

```bash
npm run rebuild  # Runs automatically on npm install (postinstall hook)
```

If you encounter native module errors, run `npm run rebuild` manually.

## Key Features

### Worktree Monitoring

- Polls Git worktrees at configurable intervals
- Tracks file changes with status (added, modified, deleted)
- Calculates insertion/deletion statistics
- Detects associated GitHub issues and PRs via branch naming
- Generates AI-powered summaries of changes (requires OpenAI key)
- Reads `.git/canopy/note` files for AI context

### Terminal Grid

- Multiple terminal instances in a grid layout
- Each terminal backed by node-pty process
- Agent launchers: Claude, Gemini, Shell
- Terminal palette for quick switching (Cmd+T)
- Terminal recipes for saved configurations
- Bulk actions (close by state, worktree, restart failed)

### Agent State Machine

- Tracks agent lifecycle: idle → working → waiting → completed/failed
- Heuristic-based state detection from terminal output
- Visual state indicators in UI
- Session transcripts with artifact extraction

### Context Injection

- "Inject Context" button on worktree cards and terminals
- Invokes CopyTree to generate context
- Progress reporting during generation
- Pastes context into active terminal

### Dev Server Management

- Auto-detect dev/start scripts from package.json
- Spawn and track dev server processes per worktree
- Parse stdout for URL/port detection
- Start/stop/restart controls
- Stream logs to UI

### OpenAI Integration

- API key management with secure storage
- Model selection (configurable)
- Worktree summary generation
- Project identity generation

## IPC API Namespaces

The preload script exposes these namespaces via `window.electron`:

- `worktree`: getAll, refresh, setActive, onUpdate, onRemove
- `devServer`: start, stop, toggle, getState, getLogs, onUpdate
- `terminal`: spawn, write, resize, kill, onData, onExit, onAgentStateChanged
- `copyTree`: generate, injectToTerminal, isAvailable, cancel, onProgress
- `system`: openExternal, openPath, getConfig, checkCommand
- `app`: getState, setState
- `logs`: getAll, getSources, clear, openFile, onEntry
- `directory`: getRecent, open, openDialog, removeRecent
- `errors`: onError, retry, openLogs
- `eventInspector`: getEvents, getFiltered, clear, subscribe, onEvent
- `project`: getAll, getCurrent, add, remove, update, switch, onSwitch
- `history`: getSessions, getSession, exportSession, deleteSession
- `ai`: getConfig, setKey, clearKey, setModel, validateKey, generateProjectIdentity

## Documentation

- **Technical Specification:** `docs/spec.md` - Complete architecture and data models
- **Multi-Project Support:** `docs/multi-project-support.md` - Implementation guide and usage
- **GitHub Issues:** See pinned issue #22 for the master development plan

## Migration Context

This project migrated code from the original Canopy CLI. **The migration is complete.** When working on related features:

1. Original source files are in `/Users/gpriday/Projects/CopyTree/canopy`
2. Services live in `electron/services/`
3. UI components are React DOM with Tailwind
4. Event bus calls became IPC sends

**Use Codex MCP to explore the original CLI:** When you have questions about the original Canopy CLI implementation, use the Codex MCP tool with `cwd: "/Users/gpriday/Projects/CopyTree/canopy"` to analyze the source code.

## Current State

The app is feature-complete for all major functionality:

- **Worktree Dashboard**: Full monitoring with AI summaries, PR detection, file change tracking
- **Terminal Grid**: Multi-terminal support with agent launchers, recipes, bulk actions
- **Context Injection**: CopyTree SDK integration with per-agent formats, file picker, streaming progress
- **Multi-Project Support**: Full project switching with state preservation, AI-generated identities
- **Dev Servers**: Auto-detection, lifecycle management, log streaming
- **Agent Tracking**: State machine, transcripts, artifact extraction
- **Settings**: OpenAI configuration, troubleshooting tools
- **Event Inspector**: Debug tool for internal events
- **Logs Panel**: Aggregated logging with filtering

### Planned Features

- Command palette (slash-command interface)
- Additional agent integrations
