# Terminal Sync Buffer (DEC 2026 Implementation)

## Problem

Agent terminals (Claude Code, Gemini, Codex) experienced visual flashing during TUI redraws. The terminal would briefly show partial content or blank screens before displaying the complete frame.

## Root Cause

Modern TUIs use **DEC private mode 2026** (synchronized output) for atomic screen updates:

- `\x1b[?2026h` (BSU) - Begin Synchronized Update (terminal should buffer)
- `\x1b[?2026l` (ESU) - End Synchronized Update (terminal should render)

The problem: xterm.js doesn't support this protocol. It renders immediately as data arrives, so users see the intermediate states (line clearing, partial content) that should be invisible.

## Solution

`TerminalSyncBuffer` intercepts PTY output and implements the missing DEC 2026 protocol support:

1. **Sync Mode Detection** - When BSU (`\x1b[?2026h`) is seen, buffer all output until ESU (`\x1b[?2026l`)
2. **Traditional Boundaries** - For TUIs without DEC 2026, emit on `\x1b[2J` (clear screen) or `\x1b[?1049h` (alt buffer)
3. **Stability Fallback** - If no boundaries detected, emit after 100ms of quiet or 200ms max hold
4. **Safety Valve** - On sync timeout (500ms), append ESU and emit to prevent renderer getting stuck

## File

`electron/services/pty/TerminalSyncBuffer.ts`

Only enabled for agent terminals (`isAgentTerminal`). Normal shell terminals bypass this entirely for zero-latency pass-through.
