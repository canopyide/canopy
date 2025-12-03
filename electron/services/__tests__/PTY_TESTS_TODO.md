# PTY Integration Tests - Implementation Notes

## Current Status

The PTY integration tests in this directory are **skipped** in the standard test run because they require an Electron environment to run `node-pty`.

## API Issues to Fix Before Tests Can Run

The following API mismatches were identified and need to be corrected when setting up an Electron test runner:

### 1. PtyManager.spawn() Signature

**Current test code (incorrect):**
```typescript
const id = await manager.spawn({ cwd, shell, cols, rows });
```

**Actual API:**
```typescript
const id = crypto.randomUUID();
manager.spawn(id, { cwd, shell, cols, rows }); // returns void
```

**Fix needed:** Update test helpers to generate IDs and call `spawn(id, options)` instead of `spawn(options)`.

### 2. Snapshot Method Name

**Current test code (incorrect):**
```typescript
const snapshot = manager.getSnapshot(id);
```

**Actual API:**
```typescript
const snapshot = manager.getTerminalSnapshot(id);
```

**Fix needed:** Replace all `getSnapshot` calls with `getTerminalSnapshot`.

### 3. Agent State Event Subscription

**Current test code (incorrect):**
```typescript
manager.on("agent:state-changed", handler);
```

**Actual behavior:** `agent:state-changed` events are emitted on the global `events` bus, not on the PtyManager instance.

**Fix needed:**
```typescript
import { events } from "../../services/events.js";
events.on("agent:state-changed", handler);
// Remember to clean up: events.off("agent:state-changed", handler);
```

### 4. transitionState() Signature

**Current test code (incorrect):**
```typescript
manager.transitionState(id, "working", "manual");
```

**Actual API:**
```typescript
manager.transitionState(
  id,
  { type: "busy" } as AgentEvent,  // AgentEvent object, not string
  "manual" as AgentStateChangeTrigger,
  1.0,  // confidence number (0-1)
  spawnedAt?: number  // optional session token
);
```

**Fix needed:** Update all state transition calls to pass `AgentEvent` objects with proper structure.

### 5. Process Cleanup

**Current implementation:**
```typescript
await Promise.all(ids.map((id) => manager.kill(id)));
```

**Issue:** `kill()` is synchronous and returns void. The function doesn't wait for process exit events.

**Recommended fix:**
```typescript
// Wait for exit events before disposing
const exitPromises = ids.map(id =>
  new Promise(resolve => {
    events.once("exit", (exitId) => {
      if (exitId === id) resolve(exitId);
    });
  })
);
ids.forEach(id => manager.kill(id));
await Promise.all(exitPromises);
```

## Future Work: Electron Test Runner

To make these tests runnable:

1. **Set up Electron test environment:**
   - Use `@electron/test` or similar framework
   - Configure vitest to run in Electron context
   - Ensure `node-pty` is built for Electron's Node version

2. **Fix API mismatches:**
   - Update all test files with corrections listed above
   - Add proper event bus imports and cleanup
   - Fix spawn/snapshot method calls

3. **Add capability detection:**
   - Probe PTY spawning in `beforeAll`
   - Skip suite if PTY spawn fails (even with correct bindings)

4. **Improve cleanup:**
   - Wait for exit events before disposing
   - Add timeout protection to prevent hanging tests
   - Verify no orphaned processes remain

## Testing Without PTYs

The terminal store integration tests (`src/hooks/__tests__/useTerminalStore.integration.test.ts`) DO run successfully and test the Zustand store logic without requiring actual PTY processes. These tests use mocks and provide good coverage of the terminal state management.

## References

- `electron/services/PtyManager.ts` - Lines 404+ (spawn), 1039+ (getTerminalSnapshot), 1094+ (transitionState)
- `electron/services/events.ts` - Global event bus used for agent events
- `electron/services/AgentStateMachine.ts` - AgentEvent type definitions
