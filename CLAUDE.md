# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**See @docs/spec.md for the complete technical specification, architecture, and data models.**

## Project Overview

Canopy Command Center is an Electron-based mini IDE for orchestrating AI coding agents. It's a migration of the original Canopy CLI (terminal-based worktree monitor built with Ink) into a full desktop application with integrated terminals, a visual worktree dashboard, and context injection for AI agents.

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

# Lint
npm run lint
```

## Architecture

### Two-Process Model

- **Main Process** (`electron/`): Node.js environment running Electron. Handles native modules (node-pty), file system access, git operations, and IPC.
- **Renderer Process** (`src/`): Browser environment with React. Communicates with main process via IPC bridge.

### IPC Bridge Pattern

All main/renderer communication goes through `contextBridge` in `electron/preload.ts`:

```typescript
// Renderer calls:
window.electron.sendKeystroke(data)
window.electron.onTerminalData(callback)

// Main process handles via ipcMain:
ipcMain.on('terminal-keystroke', handler)
mainWindow.webContents.send('terminal-incoming', data)
```

### Key Technologies

| Component | Technology |
|-----------|------------|
| Terminal emulation | xterm.js + @xterm/addon-fit |
| PTY (pseudo-terminal) | node-pty (native module) |
| Git operations | simple-git |
| Styling | Tailwind CSS v4 |

## Project Structure

```
electron/
├── main.ts          # Electron entry, window creation, PTY setup
├── preload.ts       # IPC bridge (contextBridge.exposeInMainWorld)
└── tsconfig.json    # Separate tsconfig for main process

src/
├── App.tsx          # React root with xterm.js terminal
├── components/ui/   # Shared UI components (shadcn/ui style)
├── lib/utils.ts     # Utility functions (cn for classnames)
└── types/electron.d.ts  # TypeScript declarations for window.electron
```

## Native Module Handling

node-pty is a native module that must be rebuilt for Electron's Node version:

```bash
# Runs automatically on npm install (postinstall hook)
npm run rebuild
```

If you encounter native module errors, run `npm run rebuild` manually.

## Documentation

- **Technical Specification:** `docs/spec.md` - Complete architecture, data models, and migration plan
- **GitHub Issues:** See pinned issue #22 for the master development plan with dependency flow graph

## Migration Context

This project migrates code from the original Canopy CLI. When working on migration tasks:

1. Source files are in `/Users/gpriday/Projects/CopyTree/canopy`
2. Services (WorktreeService, DevServerManager) move to `electron/services/`
3. UI components (WorktreeCard, etc.) convert from Ink to React DOM with Tailwind
4. Event bus (`events.emit()`) calls become IPC sends (`webContents.send()`)

**Use Codex MCP to explore the original CLI:** When you have questions about the original Canopy CLI implementation, use the Codex MCP tool with `cwd: "/Users/gpriday/Projects/CopyTree/canopy"` to analyze the source code.

## Current State

The app currently has:
- Basic Electron window with xterm.js terminal
- Single PTY process connected to user's shell
- IPC bridge for terminal data and resize

Remaining work is tracked in GitHub issues - see the master plan (#22) for the dependency flow.
