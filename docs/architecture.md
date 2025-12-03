# Architecture

Canopy Command Center uses Electron's two-process architecture for security and performance.

## Two-Process Model

### Main Process

**Location:** `electron/`

The main process runs in a Node.js environment with full system access:

- Native modules (node-pty for terminal emulation)
- File system operations
- Git operations via simple-git
- Service orchestration
- IPC message handling

**Entry point:** [`electron/main.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/main.ts)

### Renderer Process

**Location:** `src/`

The renderer process runs in a browser-like environment:

- React 19 UI components
- Zustand state management
- xterm.js terminal rendering
- Tailwind CSS styling

**Entry point:** [`src/main.tsx`](https://github.com/gregpriday/canopy-electron/blob/main/src/main.tsx)

## IPC Bridge Pattern

All communication between main and renderer goes through Electron's `contextBridge` in [`electron/preload.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/preload.ts). The API is organized into namespaces:

```typescript
// Renderer calls via namespaced API:
window.electron.worktree.getAll();
window.electron.terminal.spawn(options);
window.electron.copyTree.injectToTerminal(terminalId, worktreeId);

// Event subscriptions return cleanup functions:
const cleanup = window.electron.terminal.onData(id, callback);
```

### IPC Namespaces

| Namespace        | Purpose                 | Key Methods                                  |
| ---------------- | ----------------------- | -------------------------------------------- |
| `worktree`       | Git worktree management | getAll, refresh, setActive, onUpdate         |
| `terminal`       | PTY process control     | spawn, write, resize, kill, onData           |
| `devServer`      | Dev server lifecycle    | start, stop, toggle, getState, getLogs       |
| `copyTree`       | Context generation      | generate, injectToTerminal, onProgress       |
| `project`        | Multi-project support   | getAll, add, remove, switch                  |
| `ai`             | OpenAI integration      | setKey, validateKey, generateProjectIdentity |
| `logs`           | Log aggregation         | getAll, getSources, clear, onEntry           |
| `eventInspector` | Event debugging         | getEvents, subscribe, onEvent                |
| `agent`          | Agent management        | launch, configure                            |
| `agentSettings`  | Agent configuration     | get, update                                  |
| `system`         | System operations       | openExternal, openPath, checkCommand         |
| `github`         | GitHub integration      | fetchPR, fetchIssue                          |
| `history`        | Session history         | getSessions, exportSession                   |
| `app`            | Application state       | getState, setState                           |
| `git`            | Git operations          | status, diff, commit                         |
| `error`          | Error handling          | onError, retry, openLogs                     |

Channel definitions: [`electron/ipc/channels.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/ipc/channels.ts) (109 channels)

## Project Structure

```
electron/
├── main.ts              # Electron entry, window creation
├── preload.ts           # IPC bridge (contextBridge.exposeInMainWorld)
├── menu.ts              # Application menu
├── store.ts             # electron-store wrapper
├── windowState.ts       # Window state persistence
├── ipc/
│   ├── channels.ts      # IPC channel name constants
│   ├── handlers.ts      # IPC request handlers
│   ├── types.ts         # IPC type definitions
│   └── errorHandlers.ts # Error handling utilities
├── services/            # Core business logic (see Services Reference)
├── types/               # TypeScript types for main process
└── utils/               # Utility functions (logger, git, etc.)

src/
├── App.tsx              # React root component
├── main.tsx             # React entry point
├── index.css            # Global styles (Tailwind)
├── components/
│   ├── Layout/          # AppLayout, Sidebar, Toolbar
│   ├── Terminal/        # TerminalGrid, TerminalPane, XtermAdapter
│   ├── Worktree/        # WorktreeCard, WorktreeList, FileChangeList
│   ├── TerminalPalette/ # Quick terminal switching (Cmd+T)
│   ├── TerminalRecipe/  # Saved terminal configurations
│   ├── ContextInjection/# CopyTree progress UI
│   ├── Settings/        # Settings dialog
│   ├── EventInspector/  # Event debugging panel
│   ├── Logs/            # Log viewer panel
│   └── ui/              # Shared UI components (shadcn/ui style)
├── hooks/               # React hooks for IPC and state
├── store/               # Zustand stores (terminal, worktree, errors, etc.)
├── types/               # TypeScript declarations
└── lib/                 # Utility functions
```

## Tech Stack

| Component          | Technology                        |
| ------------------ | --------------------------------- |
| Runtime            | Electron 33                       |
| UI Framework       | React 19 + TypeScript             |
| Build              | Vite 6                            |
| State Management   | Zustand                           |
| Terminal Emulation | xterm.js + @xterm/addon-fit/webgl |
| PTY                | node-pty (native module)          |
| Git Operations     | simple-git                        |
| Process Management | execa                             |
| Styling            | Tailwind CSS v4                   |
| AI Integration     | OpenAI SDK                        |

## Data Flow

### Worktree Monitoring

```
WorktreeService (orchestrator)
    │
    ├── WorktreeMonitor (per worktree)
    │       ├── Polls git status at intervals
    │       ├── Detects file changes (added/modified/deleted)
    │       └── Extracts issue numbers from branch names
    │
    ├── PullRequestService
    │       └── Fetches PR details from GitHub API
    │
    └── AI Summaries
            ├── OpenAI client generates change summaries
            └── Reads .git/canopy/note for context
```

### Terminal Lifecycle

```
Terminal spawn request (renderer)
    │
    ├── PtyManager creates node-pty process
    │
    ├── AgentStateMachine tracks state
    │       └── idle → working → waiting → completed/failed
    │
    ├── TranscriptManager records session
    │       └── ArtifactExtractor captures code blocks
    │
    └── Terminal events stream back via IPC
```

### Context Injection

```
"Inject Context" button clicked
    │
    ├── CopyTreeService generates context
    │       ├── Selects format based on agent type
    │       └── Reports progress via IPC
    │
    └── Context pasted into active terminal
```
