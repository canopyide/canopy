# Development Guide

## Prerequisites

- Node.js 18+ (v20 recommended)
- npm 8+
- Git 2.30+

## Setup

### Clone and Install

```bash
git clone https://github.com/gregpriday/canopy-electron.git
cd canopy-electron
npm install
```

**Important:** Always use `npm install`, never `npm ci`. The `package-lock.json` is gitignored, so `npm ci` will fail.

### Native Modules

node-pty is a native module that must be rebuilt for Electron's Node version. The postinstall script handles this automatically, but if you encounter errors:

```bash
npm run rebuild
```

## Development Commands

### Primary Commands

```bash
# Start development (Electron + Vite concurrently)
npm run dev

# Start only Vite dev server (renderer hot reload)
npm run dev:vite

# Start only Electron (requires build:main first)
npm run dev:electron

# Build main process TypeScript
npm run build:main
```

### Code Quality

```bash
# Run all checks (typecheck + lint + format) - use before committing
npm run check

# Auto-fix formatting and lint issues
npm run fix

# Individual commands
npm run typecheck     # TypeScript type checking
npm run lint          # Run ESLint
npm run lint:fix      # Run ESLint with auto-fix
npm run format        # Format with Prettier
npm run format:check  # Check formatting
```

### Testing

```bash
npm run test          # Run tests once
npm run test:watch    # Watch mode
npm run test:ui       # Vitest UI
```

### Building & Packaging

```bash
# Full production build
npm run build

# Package for distribution (auto-detects platform)
npm run package

# Platform-specific
npm run package:mac
npm run package:win
npm run package:linux
```

## Development Workflow

### Hot Reloading

- **Renderer process:** Changes to `src/` trigger Vite hot module replacement
- **Main process:** Changes to `electron/` require restarting Electron (nodemon handles this with `npm run dev`)

### IPC Development

1. Define channel names in [`electron/ipc/channels.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/ipc/channels.ts)
2. Add handlers in [`electron/ipc/handlers.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/ipc/handlers.ts)
3. Expose via preload in [`electron/preload.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/preload.ts)
4. Update TypeScript declarations in [`src/types/electron.d.ts`](https://github.com/gregpriday/canopy-electron/blob/main/src/types/electron.d.ts)

### Adding Services

Services live in `electron/services/`. See [Services Reference](services.md) for existing services.

1. Create service class in `electron/services/`
2. Initialize in main process (typically in `main.ts` or via handlers)
3. Expose IPC methods if needed

## Debugging

### Renderer Process

Use Chrome DevTools (View → Toggle Developer Tools or Cmd+Opt+I):

- Console for logs
- Network for API calls
- React DevTools (if installed)

### Main Process

Logs appear in the terminal where you ran `npm run dev`. Use the logger utility:

```typescript
import { logInfo, logError, logWarn, logDebug } from "./utils/logger";

logInfo("MyService", "Message");
logError("MyService", "Error", { details });
```

### Event Inspector

Canopy includes a built-in event inspector for debugging IPC:

1. Open the Event Inspector panel (View menu or keyboard shortcut)
2. Filter by source or event type
3. Inspect event payloads

### Common Issues

**node-pty errors:**

```bash
npm run rebuild
```

**TypeScript errors in Electron code:**

```bash
npm run build:main
```

**Stale cache:**

```bash
rm -rf node_modules/.vite
npm run dev
```

## Environment Variables

| Variable   | Purpose                          |
| ---------- | -------------------------------- |
| `NODE_ENV` | Set to `development` in dev mode |

OpenAI API key and other secrets are stored via electron-store, not environment variables.

## Continuous Integration

GitHub Actions runs automatically on all PRs and pushes to `main`. The CI workflow includes:

### Quality Checks (Ubuntu)

- **TypeScript**: Runs `npm run typecheck` across all tsconfig files
- **ESLint**: Lints code with `npm run lint`
- **Prettier**: Checks formatting with `npm run format:check`
- **Vitest**: Runs tests with `npm run test`

### Cross-Platform Builds

Builds run on macOS, Linux, and Windows to verify:

- Native module compilation (`node-pty` via `electron-rebuild`)
- TypeScript compilation for main and preload processes
- Vite production build for renderer

Tests also run on Windows to catch OS-specific issues (path separators, line endings, permissions).

### Native Module Notes

The postinstall script runs `electron-rebuild -f -w node-pty` automatically. CI relies on this to rebuild native modules for each platform.

**Windows requirements**: The Windows build job includes Python and configures `msvs_version 2022` to ensure node-gyp can compile native modules with the Visual Studio Build Tools available on GitHub's Windows runners.

### CI Status

[![CI](https://github.com/gregpriday/canopy-electron/actions/workflows/ci.yml/badge.svg)](https://github.com/gregpriday/canopy-electron/actions/workflows/ci.yml)

View the workflow configuration at [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
