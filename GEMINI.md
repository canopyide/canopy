# Canopy Command Center

**Overview:** Electron-based IDE for orchestrating AI coding agents (Claude, Gemini, Codex). Acts as "Mission Control" for AI-assisted development: spawn agents, inject codebase context, monitor worktrees.
**Stack:** Electron 33, React 19, Vite 6, TypeScript, Tailwind CSS v4, Zustand, node-pty, simple-git.

## Critical Rules

1. **Dependencies:** Use `npm install`, never `npm ci` (package-lock is ignored).
2. **Native Modules:** Run `npm run rebuild` if node-pty errors occur.
3. **Code Style:** Minimal comments, no decorative headers, high signal-to-noise.

## Commands

```bash
npm run dev          # Vite + Electron concurrent
npm run build        # Production build
npm run check        # typecheck + lint + format
npm run fix          # Auto-fix lint/format
npm run rebuild      # Rebuild node-pty
```

## Architecture

- **Main (`electron/`):** Node.js. Handles node-pty, git, services, IPC.
- **Renderer (`src/`):** React 19. Communicates via `window.electron`.

### IPC Bridge (`window.electron`)

Namespaced API exposed via `electron/preload.ts`:

- `worktree`: getAll, refresh, setActive, onUpdate
- `terminal`: spawn, write, resize, kill, onData, onExit
- `devServer`: start, stop, toggle, getLogs
- `copyTree`: generate, injectToTerminal, onProgress

## Key Features

- **Worktrees:** `WorktreeService` polls git status, tracks file changes.
- **Terminals:** `PtyManager` (Main) + xterm.js (Renderer).
- **Agent State:** `AgentStateMachine` detects idle/working/waiting from output.
- **Context Injection:** `CopyTreeService` generates context, pastes into terminal.
- **Dev Server:** `DevServerManager` auto-detects and manages package.json scripts.

## Directory Map

```text
electron/
├── main.ts              # Entry point
├── preload.ts           # IPC bridge
├── ipc/
│   ├── channels.ts      # Channel constants
│   └── handlers.ts      # IPC implementations
└── services/
    ├── PtyManager.ts        # Terminal processes
    ├── WorktreeService.ts   # Git monitoring
    ├── AgentStateMachine.ts # Agent state tracking
    └── DevServerManager.ts  # Dev server lifecycle

src/
├── components/
│   ├── Terminal/        # Xterm.js grid
│   ├── Worktree/        # Dashboard cards
│   └── Layout/          # App structure
├── store/               # Zustand stores
├── hooks/               # React hooks
└── types/electron.d.ts  # window.electron types
```

## Common Tasks

**Adding IPC channel:**

1. Define in `electron/ipc/channels.ts`
2. Implement in `electron/ipc/handlers.ts`
3. Expose in `electron/preload.ts`
4. Type in `src/types/electron.d.ts`
