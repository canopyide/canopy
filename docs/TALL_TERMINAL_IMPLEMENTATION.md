# Tall Terminal Implementation Record

This file documents the "Tall Terminal" implementation which was removed on 2024-12-14.
The feature was designed to provide a smoother scrolling experience for AI agents (like Claude Code) by creating a massive 1000-row xterm.js canvas and handling scrolling via the browser's native scrollbar, rather than xterm's internal virtualization.

## Snapshot Branch

The full implementation is preserved in the branch: `feature/tall-terminal-snapshot`

## Key Components

### 1. XtermAdapter (`src/components/Terminal/XtermAdapter.tsx`)

- **Concept:** Rendered a `div` with `overflow: auto` (browser scrollbar) wrapping a `div` with `overflow: hidden` (the terminal).
- **Height Ratchet:** Calculated `contentHeight` based on the actual number of rows with text (`getContentBottom`), dynamically resizing the inner container to match content.
- **Scroll Sync:** Manually synchronized the browser's `scrollTop` with the terminal's content.
- **Input Handling:** Hijacked `PageUp`, `PageDown`, `Home`, `End` to drive the browser scrollbar since xterm was effectively static.
- **Listeners:** Used `onData` to snap to bottom on input, and `outputSubscribers` to trigger height updates on backend writes.

### 2. TerminalInstanceService (`src/services/terminal/TerminalInstanceService.ts`)

- **State:** Tracked `isTallCanvas`, `effectiveTallRows`, `tallCanvasFollowLog`, `tallCanvasLastScrollTop`.
- **Logic:**
  - `getOrCreate`: Initialized terminal with `TALL_CANVAS_ROWS` (1000) if `isTallCanvas` was true.
  - `resize`: Bypassed standard `fitAddon` logic; strictly resized width, kept height fixed at 1000 (or `safeRows`).
  - `getContentBottom`: Scanned buffer rows to find the last non-empty line to calculate visual height.
  - `requestTallCanvasSync`: Helper to trigger frontend updates.

### 3. Configuration & Types

- `src/services/terminal/TerminalConfig.ts`: Defined `TALL_CANVAS_ROWS = 1000` and `getSafeTallCanvasRows`.
- `src/services/terminal/types.ts`: Added `isTallCanvas` and related properties to `ManagedTerminal`.
- `electron/schemas/ipc.ts`: Validated `rows` up to `MAX_ROWS_TALL_CANVAS` (1000).
- `electron/ipc/handlers/terminal.ts`: Clamped rows based on `MAX_ROWS_TALL_CANVAS`.

### 4. UI Integration

- `TerminalSearchBar.tsx`: Custom scrolling logic to jump to matches in the tall container.
- `TerminalPane.tsx`: Triggered syncs on clear.
- `TerminalAddonManager.ts`: Skipped certain addons or logic if `isTallCanvas`.

## Reasoning for Removal

The implementation fought against xterm.js's native architecture. It required:

1. Complex manual state synchronization between DOM and PTY.
2. Expensive row scanning (`getContentBottom`) on every output frame.
3. Hijacking native key events.
4. Hard-coded limits (1000 rows) that broke infinite scrollback.

It was replaced to return to standard xterm.js virtualization for better stability and maintainability.
