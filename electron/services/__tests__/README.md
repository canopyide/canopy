# PTY Integration Tests

This directory contains integration tests for the PtyManager and terminal subsystem.

## Running the Tests

### Standard Test Run (Node.js)

```bash
npm test
```

**Note:** PTY integration tests will be **skipped** when running in regular Node.js because `node-pty` requires Electron's Node.js version. The tests are designed to skip gracefully when the native module is unavailable.

### Running in Electron Environment

To run the PTY integration tests with actual PTY processes, you would need to run the tests in an Electron environment. This is not currently configured in the test setup.

## Test Categories

### PTY Lifecycle Tests (`PtyManager.integration.test.ts`)

- Terminal spawn/write/exit lifecycle
- Multiple terminals simultaneously
- Rapid spawn/kill cycles
- Terminal metadata (type, worktreeId, timestamps)
- Terminal snapshots
- Error handling

### Buffering Tests (`TerminalBuffering.integration.test.ts`)

- Buffering mode enable/disable
- Buffer flush behavior
- Queue management
- Edge cases

### Agent State Detection (`AgentStateDetection.integration.test.ts`)

- Manual state transitions
- State change timestamps
- Agent type detection
- Terminal state persistence

### Terminal Store Tests (`src/hooks/__tests__/useTerminalStore.integration.test.ts`)

- Terminal addition/removal
- Location changes (grid/dock/trash)
- Focus management
- Agent state updates

## Platform Compatibility

The tests are designed to be cross-platform but include platform-specific guards:

- **macOS/Linux**: Use `/bin/sh` for shell commands
- **Windows**: Use `cmd.exe` for shell commands

## Known Limitations

1. **Native Module Dependency**: PTY tests require `node-pty` to be built for the current Node.js/Electron version
2. **Timing Sensitivity**: Some tests involve async PTY operations and may be sensitive to timing on slower systems
3. **Process Cleanup**: Tests include cleanup helpers to kill orphaned PTY processes, but interrupted test runs may leave processes
4. **CI Environment**: Some CI environments may restrict PTY access - tests will skip gracefully

## Troubleshooting

### Tests are Skipped

If you see "node-pty not available, skipping PTY integration tests", this means:

- The `node-pty` module couldn't be loaded (missing build for your Node version)
- Solution: Run `npm run rebuild` to rebuild native modules

### Native Module Errors

```
Error: The module was compiled against a different Node.js version
```

Solution:

```bash
npm run rebuild
```

### Orphaned PTY Processes

If tests are interrupted, you may have orphaned shell processes. Find and kill them:

```bash
# macOS/Linux
ps aux | grep 'sh -c'
kill <pid>
```

## Test Design Philosophy

These integration tests focus on:

- **Real PTY behavior** - Using actual `node-pty` processes when available
- **Graceful degradation** - Skipping when environment doesn't support PTYs
- **Proper cleanup** - Ensuring all spawned processes are killed
- **Cross-platform compatibility** - Using platform-appropriate shell commands
