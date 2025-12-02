# Canopy Command Center - GEMINI Context

## Project Overview

Canopy Command Center is an **Electron-based IDE** designed to orchestrate AI coding agents (like Claude and Gemini). It evolved from a CLI tool into a full desktop application that monitors Git worktrees, manages development servers, and provides integrated terminals with "Context Injection" capabilities.

**Key Goal:** Act as "Mission Control" for AI-assisted development, allowing users to spawn agents, inject codebase context (via `copytree`), and monitor multiple worktrees simultaneously.

## Architecture

The application follows the standard Electron **Main/Renderer** process model, heavily relying on **IPC** for communication.

### Main Process (`electron/`)

- **Entry:** `electron/main.ts`
- **Role:** Handles native operations (node-pty, file system, git), manages application state via Services.
- **Services:**
  - `PtyManager`: Manages terminal processes (node-pty).
  - `WorktreeService`: Monitors git worktrees.
  - `DevServerManager`: Spawns and tracks local dev servers.
  - `AgentStateMachine`: Tracks agent states (idle, working, waiting) via output heuristics.
  - `ProjectStore`: Manages multi-project configurations.

### Renderer Process (`src/`)

- **Entry:** `src/main.tsx` -> `src/App.tsx`
- **Stack:** React 18, TypeScript, Tailwind CSS v4, Zustand (state).
- **Key Components:**
  - `TerminalGrid`: Renders xterm.js instances.
  - `WorktreeCard`: Visualizes worktree status (git changes, dev server).
  - `AppLayout`: Main application structure.

### IPC Bridge

- **Definition:** `electron/ipc/channels.ts` defines all typed channel names.
- **Preload:** `electron/preload.ts` exposes safe APIs to `window.electron`.
- **Pattern:** Renderer invokes methods via `window.electron.*`, Main sends updates via `webContents.send`.

## Development Workflow

### Build & Run

- **Start Dev (Concurrent):** `npm run dev` (Recommended)
- **Start Renderer Only:** `npm run dev:vite`
- **Start Electron Only:** `npm run dev:electron`
- **Build Production:** `npm run build`
- **Rebuild Native Modules:** `npm run rebuild` (Crucial for `node-pty`)

### Code Standards

- **Formatting:** Prettier (`npm run format`)
- **Linting:** ESLint (`npm run lint`)
- **Typecheck:** TypeScript (`npm run typecheck`)
- **Tests:** Vitest (`npm run test`)

### Code Commenting Guidelines

**Optimize for Token Efficiency**

This project is AI-first. Comments must be minimal to preserve the context window.

- **No Decoration:** Strictly avoid decorative separator lines (e.g., `=====`, `-----`) or block framing.
- **Be Terse:** Use direct, brief language. Avoid conversational filler.
- **High Signal:** Only document non-obvious logic, complex rationale, or edge cases.
- **No Redundancy:** Do not restate information that is already obvious from variable names or types.

## Key Concepts & Features

### 1. Worktrees

The core unit of organization. Canopy monitors folders (usually git worktrees) for changes.

- **Status:** Tracks git status (modified/added/deleted).
- **Dev Server:** Can auto-detect and launch `npm start`/`npm run dev`.

### 2. Agents & Terminals

- **Terminals:** Powered by `xterm.js` (frontend) and `node-pty` (backend).
- **Agents:** Specialized terminal sessions running CLI tools (`claude`, `gemini`).
- **State Machine:** The backend analyzes terminal output to detect if an agent is "working", "waiting for input", or "idle".

### 3. Context Injection

- **Feature:** "Inject Context" button.
- **Mechanism:** Invokes `copytree` (external CLI tool) to pack the codebase into a single prompt-friendly string and pastes it into the active terminal.

### 4. Event Inspector

- **Debug Tool:** A built-in panel to view internal events flowing through the system.
- **Implementation:** `EventBuffer` in Main process captures events and streams them to Renderer when subscribed.

## Directory Structure

```
/
├── electron/           # Main process source
│   ├── ipc/            # IPC definitions & handlers
│   ├── services/       # Business logic (Pty, Worktree, etc.)
│   ├── main.ts         # Entry point
│   └── preload.ts      # Context Bridge
├── src/                # Renderer process source (React)
│   ├── components/     # UI Components
│   ├── hooks/          # React hooks (IPC integration)
│   ├── store/          # Zustand stores
│   └── App.tsx         # Root component
├── docs/               # Documentation & Specs
└── package.json        # Scripts & Dependencies
```

## Important Files

- `electron/ipc/channels.ts`: The source of truth for IPC channel names.
- `electron/services/AgentStateMachine.ts`: Logic for interpreting agent terminal output.
- `src/types/index.ts`: Shared type definitions (mirrored or imported).
- `CLAUDE.md`: Detailed context for AI coding assistants (contains migration history).

## Common Tasks

- **Adding a new IPC channel:**
  1. Define const in `electron/ipc/channels.ts`.
  2. Add handler in `electron/ipc/handlers.ts`.
  3. Expose in `electron/preload.ts`.
  4. Add typed method in `src/types/electron.d.ts`.
- **Debugging Native Modules:** If `node-pty` fails, run `npm run rebuild`.
