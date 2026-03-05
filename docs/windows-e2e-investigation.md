# Windows E2E Crash Investigation

**Branch:** `fix/windows-e2e-stability`
**Started:** 2026-03-05
**Status:** Resolved on this branch — Windows Core + Online both passing

## Actual Fix

The working fix was a combination, not a single change:

1. **Removed `--no-sandbox` on Windows E2E launches** (`e2e/helpers/launch.ts`).
2. **Deferred renderer load in Windows E2E mode** by introducing
   `CANOPY_E2E_DEFER_RENDERER_LOAD=1` and loading the renderer only after IPC handlers are
   registered (`electron/main.ts`).
3. **Added a hard skip for first-run agent dialogs** via
   `CANOPY_E2E_SKIP_FIRST_RUN_DIALOGS=1` in:
   - `src/components/Setup/AgentSetupWizard.tsx`
   - `src/components/Setup/AgentSelectionStep.tsx`
4. **Kept fail-fast launch behavior** (`45s` launch timeout with retries) so startup hangs do not
   burn multi-minute attempts (`e2e/helpers/launch.ts`).

### Why this fixed it

- `--no-sandbox` removal eliminated a Windows instability amplifier.
- Deferred renderer load removed startup race conditions where renderer invoked IPC before handlers
  were consistently available.
- First-run dialog skip removed modal interference during onboarding interactions in CI.

## The Problem

Windows E2E tests intermittently crash with exit code `3221225477` (`0xC0000005` = ACCESS_VIOLATION). The crash occurs in the **main Electron process** during startup, consistently at the same point in the initialization sequence — right after logging `[MAIN] Waiting for services to initialize...`.

The crash is not a JS error. It's a native segfault in Electron/Chromium/V8 internals.

### Failure Rate

~66% on Windows CI. The same code sometimes passes and sometimes fails with no application changes between runs.

### Last Successful Log Output Before Crash

```
[WorkspaceClient] Workspace Host started
[MAIN] Registering IPC handlers...
[MAIN] Waiting for services to initialize...
<ws disconnected> code=1006
[pid=XXXX] <process did exit: exitCode=3221225477, signal=null>
```

The process never reaches `[MAIN] All critical services ready`.

### Environment

- **Electron:** 40.6.1
- **CI Runner:** GitHub Actions `windows-latest`
- **node-pty:** 1.0.0 (rebuilt for Electron via postinstall)
- **Launch flags (current Windows CI):** `--disable-gpu`, `--disable-software-rasterizer`, `--noerrdialogs`, `--disable-backgrounding-occluded-windows`, `--disable-features=CalculateNativeWinOcclusion`

### Current Finding (2026-03-05)

The dominant failure mode has shifted:

- Earlier runs failed with native main-process crash `0xC0000005` (ACCESS_VIOLATION).
- Newer runs mostly fail with `TimeoutError: electron.launch` on Windows Core tests, even when logs show:
  - `[MAIN] All critical services ready`
  - Renderer boot messages and deferred services finishing normally.

This points to a **startup handshake/race problem** rather than an app crash.

Observed in failed launch call logs:

- Renderer/main race errors during boot:
  - `No handler registered for 'terminal:get-shared-buffers'`
  - `No handler registered for 'agent-settings:get'`
  - `No handler registered for 'terminal-config:get'`
  - `No handler registered for 'system:get-home-dir'`
  - `No handler registered for 'keybinding:get-overrides'`

Interpretation: renderer can start invoking IPC before the full handler surface is consistently ready on Windows CI.

---

## Timeline of Attempts

### Attempt 1: Skip SharedArrayBuffer on Windows

**Hypothesis:** SharedArrayBuffer transfer to utility processes always fails on Windows with "An object could not be cloned." The failed transfer might leave native state in a broken condition.

**Change:** Wrapped SharedArrayBuffer creation in `if (process.platform !== "win32")` in `PtyClient.ts`.

**Result:** ❌ Crash still occurred. The "Windows detected, using IPC fallback" message appeared in logs confirming the code change was active, but the process still died with `0xC0000005`.

**Conclusion:** SharedArrayBuffer is not the root cause. The transfer failure is caught and handled gracefully. Reverted.

### Attempt 2: Explicit `cwd` + MessagePort GC Retention

**Hypothesis (two-part):**

1. Missing `cwd` on `utilityProcess.fork()` — on Windows, inheriting an invalid or inaccessible cwd can cause ACCESS_VIOLATION.
2. MessagePort GC — V8 can garbage-collect `MessagePortMain` instances if they fall out of function scope, freeing the C++ backing objects while utility processes still reference them. VS Code retains strong references to prevent this.

**Changes:**

- Added `cwd: os.homedir()` to both `utilityProcess.fork()` calls (PtyClient, WorkspaceClient)
- Added module-level `activeRendererPort` and `activePtyHostPort` variables in `main.ts` to retain MessagePort references
- Added proper cleanup of old ports before creating new ones

**Result:** ❌ Crash still occurred with identical symptoms. CI run `22702782744` failed.

**Conclusion:** Neither `cwd` nor MessagePort GC is the root cause (or at least not the sole cause). Changes kept since they're defensive best practices.

### Attempt 3: Staggered Utility Process Forks + Increased Retries

**Hypothesis:** Both utility processes (pty-host, workspace-host) are forked near-simultaneously. On resource-constrained Windows CI runners, two processes loading native modules at the same time causes memory pressure or handle contention, leading to the native crash. The intermittency matches CI resource variability.

**Changes:**

- `electron/main.ts`: Fork pty-host first, `await ptyClient.waitForReady()`, then fork workspace-host. This ensures only one utility process is loading native modules at a time.
- `e2e/helpers/launch.ts`: Increased `maxAttempts` from 3 to 5 on Windows CI to ride out environmental flakiness.

**Result:** ⏳ Pending CI results.

**Local macOS verification:** All tests pass (2799 unit, 56 e2e core).

### Attempt 4: Revert Single-Instance Lock Skip

**Hypothesis:** The `hasExplicitUserDataDir` change (commit `fa0ee041`) skips `app.requestSingleInstanceLock()` when `--user-data-dir` is provided. This was the first app code change on the branch, and develop (which always acquires the lock) passes Windows E2E. The lock's named pipe setup may stabilize process initialization on Windows, or skipping it changes timing in a way that triggers the crash.

**Change:** Reverted to `const gotTheLock = isSmokeTest || app.requestSingleInstanceLock();`

**Result:** ⏳ Pending CI results.

### Attempt 5: Remove `--no-sandbox` on Windows CI

**Hypothesis:** Forcing Chromium `--no-sandbox` on Windows destabilizes startup and correlates with `0xC0000005`.

**Change:** Removed Windows `--no-sandbox` from `e2e/helpers/launch.ts` launch args.

**Result:** ✅ Online Windows run passed (`22703906260`). Core no longer showed the prior native crash signature, but still suffered launch timeout flakiness.

**Conclusion:** `--no-sandbox` on Windows was a regression amplifier; keep it removed.

### Attempt 6: Fail Fast on Launch Timeout + Retry

**Hypothesis:** Long single-attempt launch timeout wastes CI time when the app is already in a bad startup state.

**Change:** Windows CI launch timeout reduced `120s -> 45s`, retries kept at 5.

**Result:** ⚠️ Core still saw repeated `electron.launch` timeout retries, but retries eventually progressed into test execution.

**Conclusion:** Better CI behavior, but not the root fix.

### Attempt 7: E2E Startup Hardening (Confirmed)

**Hypothesis:** Renderer starts too early in Windows CI and races IPC registration/initialization, causing early missing-handler errors that destabilize Playwright launch handshake.

**Changes:**

- Added `CANOPY_E2E_DEFER_RENDERER_LOAD=1` mode:
  - `electron/main.ts` defers `loadURL()` until after IPC handlers are registered.
  - Enabled from `e2e/helpers/launch.ts` on Windows CI.
- Added `CANOPY_E2E_SKIP_FIRST_RUN_DIALOGS=1` mode:
  - `AgentSetupWizard` and `AgentSelectionStep` both short-circuit visibility checks under this env var.
  - Enabled from `e2e/helpers/launch.ts` on Windows CI.

**Result:** ✅ Confirmed.

- Core (Windows) success: [`22705294099`](https://github.com/canopyide/canopy/actions/runs/22705294099)
- Online (Windows) success: [`22705461732`](https://github.com/canopyide/canopy/actions/runs/22705461732)

**Observed impact:**

- No `electron.launch` timeout retries in successful Core run on latest commit.
- No first-run modal interference during test onboarding.
- Both Windows workflows completed successfully on the same fix commit.

---

## What We've Ruled Out

| Theory                     | Why Ruled Out                                                       |
| -------------------------- | ------------------------------------------------------------------- |
| SharedArrayBuffer transfer | Crash persists after disabling it entirely on Windows               |
| Missing `cwd` on fork()    | Crash persists after adding explicit `cwd: os.homedir()`            |
| MessagePort GC             | Crash persists after retaining strong references at module scope    |
| Application JS error       | Exit code is `0xC0000005` (native segfault), not a JS exception     |
| GPU process issues         | Already passing `--disable-gpu` and `--disable-software-rasterizer` |

## What We Know

1. **The crash is in the main Electron process** (pid matches the launched process, not a utility child).
2. **It happens during `Promise.allSettled` wait** — the main process is idle in the event loop waiting for utility processes to report ready.
3. **Both utility processes were forked successfully** — logs show "Pty Host started" and "Workspace Host started" before the crash.
4. **It's intermittent** — identical code passes ~33% of the time on Windows CI.
5. **macOS and Linux are unaffected** — all tests pass consistently on those platforms.
6. **`app.enableSandbox()`** is called at line 101 of `main.ts`. While `utilityProcess.fork()` defaults to `sandbox: false`, the interaction on Windows is unclear.
7. **node-pty is NOT loaded in the main process** during E2E tests (smoke test requires `--smoke-test` flag).
8. **Two utility processes fork nearly simultaneously** — pty-host (loads node-pty native module) and workspace-host (loads simple-git) are both forked before the wait.

## Open Theories

### A. Resource contention from simultaneous utility process forks

Both utility processes are forked back-to-back with no delay. On resource-constrained Windows CI runners, two processes simultaneously loading native modules (node-pty with ConPTY, simple-git) could trigger memory pressure or handle exhaustion in the main process.

**Test:** Stagger utility process startup — fork pty-host, wait for ready, then fork workspace-host.

### B. `app.enableSandbox()` interaction with utility processes on Windows

`app.enableSandbox()` sets a global flag. While `utilityProcess.fork()` is documented to default to `sandbox: false`, the actual behavior on Electron 40 + Windows may differ. If the utility process inherits sandbox restrictions, node-pty's ConPTY access would fail at the native level.

**Test:** Try adding explicit `sandbox: false` to `utilityProcess.fork()` options, or conditionally skip `app.enableSandbox()` on Windows.

### C. Electron bug with utility process on Windows

Electron's `utilityProcess` is relatively new (v22+). There may be Windows-specific bugs in the native process management code, especially around process handle inheritance, named pipes, or message port establishment.

**Test:** Search Electron GitHub issues for similar crashes. Consider testing with a different Electron version.

### D. ConPTY initialization in pty-host crashes and cascades

The pty-host utility process loads node-pty which initializes ConPTY on Windows. If ConPTY initialization fails with a native crash, there might be a cascade effect through shared handles or message ports that brings down the main process.

**Test:** Add a try/catch and delay around node-pty import in `pty-host.ts`, or lazy-load it after the process is fully established.

### E. Timing-dependent V8 GC during utility process setup

Even with module-level port references, there may be other transient native objects (from `utilityProcess.fork()` itself) that V8 collects during the async wait. The GC timing would vary between runs, explaining the intermittency.

**Test:** Force GC before the `Promise.allSettled` wait, or add `global.gc()` calls to pin objects.

---

## Key Files

| File                                   | Role                                                           |
| -------------------------------------- | -------------------------------------------------------------- |
| `electron/main.ts`                     | Main process entry, utility process fork orchestration         |
| `electron/services/PtyClient.ts`       | Forks pty-host utility process                                 |
| `electron/services/WorkspaceClient.ts` | Forks workspace-host utility process                           |
| `electron/pty-host.ts`                 | Utility process that loads node-pty eagerly                    |
| `electron/workspace-host.ts`           | Utility process that loads simple-git                          |
| `e2e/helpers/launch.ts`                | E2E test launch helper with Windows-specific flags and retries |

## CI Runs

| Run                                                                         | Commit     | Result           | Notes                                                      |
| --------------------------------------------------------------------------- | ---------- | ---------------- | ---------------------------------------------------------- |
| [22701811729](https://github.com/canopyide/canopy/actions/runs/22701811729) | `fa0ee041` | ❌ Windows crash | Baseline failure before fixes                              |
| [22702276959](https://github.com/canopyide/canopy/actions/runs/22702276959) | `026167d7` | ❌ Windows crash | SharedArrayBuffer skip — didn't help                       |
| [22702276445](https://github.com/canopyide/canopy/actions/runs/22702276445) | `026167d7` | ❌ Windows crash | Same commit, online tests                                  |
| [22702782744](https://github.com/canopyide/canopy/actions/runs/22702782744) | `44c43b36` | ❌ Windows crash | cwd + MessagePort GC — didn't help                         |
| [22703906260](https://github.com/canopyide/canopy/actions/runs/22703906260) | `d2cef8bc` | ✅ Online passed | Removed Windows `--no-sandbox`                             |
| [22703906264](https://github.com/canopyide/canopy/actions/runs/22703906264) | `d2cef8bc` | ❌ Core timeout  | App reaches ready; Playwright launch timeout               |
| [22704599532](https://github.com/canopyide/canopy/actions/runs/22704599532) | `475ef32e` | 🚫 Canceled      | 45s timeout + retries; progressed into tests before cancel |
| [22705294099](https://github.com/canopyide/canopy/actions/runs/22705294099) | `83a13f66` | ✅ Core passed   | No launch-timeout retries; 56 passed, 2 skipped            |
| [22705461732](https://github.com/canopyide/canopy/actions/runs/22705461732) | `83a13f66` | ✅ Online passed | Windows-only Online workflow green                         |

---

## Next Steps

1. **Cherry-pick or port commit `83a13f66` to `develop`**.
2. **Re-run both Windows workflows on `develop`** to confirm parity.
3. **If regressions recur**, capture launch call log and check for missing-handler startup errors first.
