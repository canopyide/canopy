# Multi-Process Architecture

This document describes Canopy's multi-process architecture, which isolates heavy operations from the Main process to ensure UI responsiveness.

## Overview

Canopy uses Electron's UtilityProcess API to run CPU-intensive operations in separate Node.js processes. This prevents the Main process from blocking during git operations, file I/O, or terminal data processing.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CANOPY ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │  MAIN PROCESS   │     │ WORKSPACE-HOST  │     │    PTY-HOST     │       │
│  │   (Electron)    │     │(UtilityProcess) │     │(UtilityProcess) │       │
│  ├─────────────────┤     ├─────────────────┤     ├─────────────────┤       │
│  │ Window mgmt     │     │ Git operations  │     │ Terminal I/O    │       │
│  │ IPC routing     │     │ CopyTree gen    │     │ State machine   │       │
│  │ Menu/shortcuts  │     │ DevServer parse │     │ Transcript buf  │       │
│  │ App lifecycle   │     │ Worktree poll   │     │ Agent detection │       │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘       │
│           │                       │                       │                 │
│           │      postMessage      │      postMessage      │                 │
│           └───────────────────────┴───────────────────────┘                 │
│                                   │                                         │
│                                   │ IPC                                     │
│                                   ▼                                         │
│                         ┌─────────────────┐                                 │
│                         │    RENDERER     │                                 │
│                         │  (React + Vite) │                                 │
│                         ├─────────────────┤                                 │
│                         │ UI components   │                                 │
│                         │ Zustand stores  │                                 │
│                         │ xterm.js        │                                 │
│                         └─────────────────┘                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Why Multi-Process?

Electron's Main process runs on a single thread. When heavy operations block this thread:

- Window becomes unresponsive (can't drag, resize, or close)
- Menu items don't respond
- IPC messages queue up (terminal keystrokes lag)
- The OS may show "Application Not Responding"

By moving heavy work to UtilityProcesses, the Main process stays responsive regardless of background operations.

## Process Responsibilities

### Main Process

**Role:** Lightweight coordinator and window manager.

**Responsibilities:**

- Create and manage BrowserWindow
- Route IPC messages between Renderer and UtilityProcesses
- Handle application lifecycle (ready, quit, activate)
- Manage application menu and global shortcuts
- Spawn and monitor UtilityProcesses

**What it does NOT do:**

- Git operations or parsing
- File system traversal (CopyTree)
- Terminal data processing
- CPU-intensive string manipulation

### Workspace-Host (UtilityProcess)

**Role:** Heavy file system and git operations.

**File:** `electron/workspace-host.ts`

**Responsibilities:**

- **Git Operations:** Worktree listing, status, create, delete
- **Git Watching:** File system watcher on `.git` folder for reactive updates
- **CopyTree Generation:** File traversal, content aggregation, token counting
- **DevServer Parsing:** Regex matching on server logs to detect URLs

**Why isolated:**

- Git operations spawn child processes and parse large outputs
- CopyTree reads hundreds of files and concatenates large strings
- DevServer parsing runs regex on every line of server output
- All of this would block Main if run there

**Git Change Detection Strategy:**

Prefer **file watching over polling** for git status updates:

```typescript
// Use @parcel/watcher for native performance
import { subscribe } from "@parcel/watcher";

// Watch .git folder for changes
const subscription = await subscribe(gitDir, (err, events) => {
  // Debounce and trigger git status after 100ms
  if (events.some((e) => e.path.includes("HEAD") || e.path.includes("index"))) {
    debouncedGitStatus();
  }
});
```

**Benefits over polling:**

- Instant updates (<200ms) vs waiting 2-10 seconds
- Zero CPU when idle vs constant polling overhead
- More responsive user experience

### Pty-Host (UtilityProcess)

**Role:** Terminal I/O and agent state tracking.

**File:** `electron/pty-host.ts`

**Responsibilities:**

- **Terminal Management:** Spawn, resize, kill PTY processes
- **Data Routing:** Receive PTY output, send to Renderer
- **State Machine:** Track agent states (idle, working, waiting, completed)
- **Transcript Buffering:** Store and sanitize terminal output
- **Backpressure:** Handle slow consumers via ring buffer flow control

**Performance Optimizations:**

- SharedArrayBuffer ring buffers for zero-copy terminal output
- Dual buffers: visual (Renderer) and analysis (Web Worker)
- Backpressure detection with automatic PTY pause/resume

### Renderer Process

**Role:** User interface and user interaction.

**Responsibilities:**

- React component rendering
- Zustand state management
- xterm.js terminal rendering
- User input handling

**Communication:**

- IPC to Main via `window.electron` bridge
- SharedArrayBuffer for high-throughput terminal data

## Inter-Process Communication (IPC)

### The Double-Hop Problem

The naive IPC approach routes all messages through Main:

```
Renderer ↔ IPC (Main) ↔ postMessage ↔ UtilityProcess
```

**Problems with this approach:**

- Every message is serialized twice (Renderer→Main, Main→Utility)
- Main thread jitter delays messages (window resize, menu handling)
- Terminal keystrokes lag when Main is busy

### Solution: Direct IPC via MessagePorts

For high-frequency communication, use MessagePorts to bypass Main entirely:

```
Renderer ↔ MessagePort ↔ UtilityProcess  (Main not involved)
```

**Setup:**

```typescript
// Main process creates the channel once
const { port1, port2 } = new MessageChannelMain();

// Send port1 to Renderer (via preload)
mainWindow.webContents.postMessage("utility-port", null, [port1]);

// Send port2 to UtilityProcess
utilityProcess.postMessage({ type: "connect-port" }, [port2]);

// Result: Renderer and UtilityProcess communicate directly
```

### IPC Methods

| Method                        | Use Case                     | Performance | Complexity |
| ----------------------------- | ---------------------------- | ----------- | ---------- |
| `postMessage` via Main        | Infrequent control messages  | Adequate    | Low        |
| `MessagePort` (direct)        | Frequent updates, user input | Fast        | Medium     |
| `postMessage` + Transferables | Large binary data (one-way)  | Zero-copy   | Medium     |
| `SharedArrayBuffer`           | Real-time streaming          | Fastest     | High       |

### When to Use Each Method

| Data Type           | Frequency          | Method                      |
| ------------------- | ------------------ | --------------------------- |
| Git status updates  | Every few seconds  | `postMessage` via Main      |
| Terminal keystrokes | 10-100/second      | `MessagePort` (direct)      |
| Terminal output     | Continuous stream  | `SharedArrayBuffer`         |
| CopyTree result     | Once per operation | `Transferables` (zero-copy) |

### Workspace-Host Communication

Uses `postMessage` via Main for control, optional MessagePort for frequent updates:

```typescript
// WorkspaceClient.ts (Main process)
this.child.postMessage({
  type: "git:list-worktrees",
  projectPath: "/path/to/project",
});

// workspace-host.ts (UtilityProcess)
port.on("message", async (msg) => {
  if (msg.type === "git:list-worktrees") {
    const worktrees = await worktreeService.getAll(msg.projectPath);
    port.postMessage({ type: "git:worktrees", data: worktrees });
  }
});
```

**Why postMessage is sufficient:**

- Git data is small (kilobytes, not megabytes)
- Operations are infrequent (every 2-10 seconds)
- No real-time streaming requirement

### Pty-Host Communication

Uses `postMessage` for control and `SharedArrayBuffer` for terminal data:

```typescript
// Control messages via postMessage
ptyClient.send({ type: "spawn", id, options });
ptyClient.send({ type: "write", id, data });
ptyClient.send({ type: "resize", id, cols, rows });

// Terminal output via SharedArrayBuffer (zero-copy)
const visualBuffer = new SharedArrayBuffer(10 * 1024 * 1024); // 10MB
const analysisBuffer = new SharedArrayBuffer(10 * 1024 * 1024); // 10MB
```

**Why SharedArrayBuffer for terminal output:**

- Terminal output can be megabytes per second
- 60fps rendering requires <16ms latency
- Copying data via IPC would be too slow

## Message Protocols

### Workspace-Host Protocol

```typescript
// shared/types/workspace-host.ts

// Requests (Main → Workspace-Host)
type WorkspaceRequest =
  // Git operations
  | { type: "git:list-worktrees"; projectPath: string }
  | { type: "git:get-status"; worktreePath: string }
  | { type: "git:create-worktree"; options: CreateWorktreeOptions }
  | { type: "git:remove-worktree"; worktreePath: string }
  | { type: "git:start-polling"; projectPath: string }
  | { type: "git:stop-polling" }
  // CopyTree operations
  | { type: "copytree:generate"; operationId: string; rootPath: string; options: CopyTreeOptions }
  | { type: "copytree:cancel"; operationId: string }
  // DevServer operations
  | { type: "devserver:parse-output"; worktreeId: string; output: string }
  // Lifecycle
  | { type: "health-check" }
  | { type: "dispose" };

// Events (Workspace-Host → Main)
type WorkspaceEvent =
  | { type: "ready" }
  | { type: "pong" }
  // Git events
  | { type: "git:worktrees"; data: Worktree[] }
  | { type: "git:worktree-update"; worktree: Worktree }
  | { type: "git:worktree-removed"; path: string }
  // CopyTree events
  | { type: "copytree:progress"; operationId: string; progress: CopyTreeProgress }
  | { type: "copytree:complete"; operationId: string; result: CopyTreeResult }
  // DevServer events
  | { type: "devserver:urls-detected"; urls: string[]; worktreeId: string }
  // Error
  | { type: "error"; error: string };
```

### Pty-Host Protocol

See `shared/types/pty-host.ts` for the complete protocol. Key message types:

```typescript
// Requests (Main → Pty-Host)
type PtyHostRequest =
  | { type: "spawn"; id: string; options: PtyHostSpawnOptions }
  | { type: "write"; id: string; data: string }
  | { type: "resize"; id: string; cols: number; rows: number }
  | { type: "kill"; id: string }
  | { type: "get-snapshot"; id: string }
  // ... more

// Events (Pty-Host → Main)
type PtyHostEvent =
  | { type: "ready" }
  | { type: "data"; id: string; data: string }
  | { type: "exit"; id: string; exitCode: number }
  | { type: "agent-state"; id: string; state: AgentState; ... }
  // ... more
```

## Health Monitoring

Both UtilityProcesses implement health checking:

```typescript
// Main process sends periodic health checks
setInterval(() => {
  workspaceClient.send({ type: "health-check" });
}, 60000);

// UtilityProcess responds
port.on("message", (msg) => {
  if (msg.type === "health-check") {
    port.postMessage({ type: "pong" });
  }
});
```

**Crash Recovery:**

- UtilityProcesses are monitored for crashes
- Automatic restart with exponential backoff (max 3 attempts)
- Pending operations are re-queued after restart

**Health Check Timeout Handling:**

UtilityProcesses are single-threaded. If a heavy operation (like CopyTree) blocks the event loop, health checks won't respond, causing false "crash" detection.

**Solution:** Use Worker Threads for CPU-intensive operations:

```typescript
// workspace-host.ts
import { Worker } from "node:worker_threads";

// Heavy CopyTree runs in a Worker, keeping main event loop responsive
const worker = new Worker("./copytree-worker.js", {
  workerData: { rootPath, options },
});

worker.on("message", (result) => {
  port.postMessage({ type: "copytree:complete", result });
});

// Health checks still work because workspace-host event loop is free
```

**Zombie Process Prevention:**

When Main crashes, child processes (bash, git) may become orphans.

```typescript
// In pty-host.ts and workspace-host.ts
import { kill } from "tree-kill";

process.parentPort.on("close", () => {
  // Parent died - clean up all children
  for (const [id, terminal] of terminals) {
    kill(terminal.pid, "SIGTERM");
  }
  process.exit(0);
});
```

## Performance Characteristics

### Expected Metrics After Implementation

| Metric                      | Before    | After     |
| --------------------------- | --------- | --------- |
| Time to first paint         | 2-4s      | <1s       |
| Main CPU during git polling | 60-80%    | <10%      |
| Terminal input latency      | 100-300ms | <16ms     |
| CopyTree UI freeze          | 500ms-2s  | 0ms       |
| Memory overhead             | ~40MB     | ~80-100MB |

### Memory Budget

| Process        | Expected Memory |
| -------------- | --------------- |
| Main           | ~40-60MB        |
| Workspace-Host | ~20-30MB        |
| Pty-Host       | ~20-30MB        |
| Renderer       | ~100-200MB      |
| **Total**      | **~200-320MB**  |

The additional ~40-60MB for UtilityProcesses is an acceptable trade-off for guaranteed UI responsiveness.

## File Structure

```
electron/
├── main.ts                    # Main process entry point
├── workspace-host.ts          # Workspace UtilityProcess entry point
├── pty-host.ts               # Pty UtilityProcess entry point
├── services/
│   ├── WorkspaceClient.ts    # Main↔Workspace-Host IPC client
│   ├── PtyClient.ts          # Main↔Pty-Host IPC client
│   ├── WorktreeService.ts    # Git operations (runs in workspace-host)
│   ├── GitService.ts         # Git commands (runs in workspace-host)
│   ├── CopyTreeService.ts    # Context gen (runs in workspace-host)
│   ├── DevServerManager.ts   # Server mgmt (runs in workspace-host)
│   ├── PtyManager.ts         # PTY mgmt (runs in pty-host)
│   └── AgentStateMachine.ts  # State tracking (runs in pty-host)
└── ipc/
    ├── handlers/             # IPC request handlers
    └── channels.ts           # Channel name constants

shared/
└── types/
    ├── workspace-host.ts     # Workspace-Host message types
    ├── pty-host.ts          # Pty-Host message types
    └── domain.ts            # Shared domain types
```

## Implementation Status

| Component                  | Status         | Issue |
| -------------------------- | -------------- | ----- |
| Pty-Host                   | ✅ Implemented | -     |
| Workspace-Host (Git)       | 📋 Planned     | #786  |
| Workspace-Host (CopyTree)  | 📋 Planned     | #790  |
| Workspace-Host (DevServer) | 📋 Planned     | #789  |
| Deferred Initialization    | 📋 Planned     | #788  |
| Transcript to Pty-Host     | 📋 Planned     | #791  |
| MessagePorts (optional)    | 📋 Planned     | #787  |

## Deployment Considerations

### SharedArrayBuffer Security Headers

`SharedArrayBuffer` requires specific security headers or it will silently fail:

```typescript
// In Main process, configure session headers
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      "Cross-Origin-Opener-Policy": ["same-origin"],
      "Cross-Origin-Embedder-Policy": ["require-corp"],
    },
  });
});
```

### Native Module Unpacking

`node-pty` is a native module that fails if packed inside `app.asar`:

```yaml
# electron-builder.yml
asarUnpack:
  - "**/node_modules/node-pty/**"
  - "**/node_modules/@parcel/watcher/**"
```

### CopyTree Performance

For large repositories, consider:

1. **Streaming results** instead of batching (reduces memory spikes)
2. **Transferables** for zero-copy data transfer to Renderer
3. **Worker Threads** inside workspace-host for CPU-intensive traversal

```typescript
// Send large results as Transferable (zero-copy)
const buffer = new TextEncoder().encode(result).buffer;
port.postMessage({ type: "copytree:complete", data: buffer }, [buffer]);
// Note: buffer is now detached (unusable) in workspace-host
```

## Related Documents

- [Development Guide](./development.md) - Setup and commands
- GitHub Issues #786-#792 - Implementation details and tracking
