// In production, `enforceIpcSenderValidation()` is called once at startup and
// flips a guard flag that all IPC handler registrations assert against. Unit
// tests don't run that bootstrap path, so we mark the guard ready here. Tests
// that need to verify the throwing behavior (e.g. `ipcGuard.test.ts`) reset
// the flag explicitly via `_resetIpcGuardForTesting()`.

import { markIpcSecurityReady } from "./electron/ipc/ipcGuard.js";

markIpcSecurityReady();

// jsdom does not implement Trusted Types. The renderer policy module
// (`src/lib/trustedTypesPolicy.ts`) throws at import time if
// `window.trustedTypes` is missing, which breaks any jsdom test that
// transitively imports a chip widget or FileViewerModal. Install a minimal
// pass-through stub so unrelated test files don't have to mock the module.
// Tests that exercise the throw branch (`trustedTypesPolicy.test.ts`)
// override this stub per-test via `vi.stubGlobal`. See #6392.
if (typeof globalThis !== "undefined") {
  const g = globalThis as { trustedTypes?: unknown };
  if (!g.trustedTypes) {
    g.trustedTypes = {
      createPolicy: (_name: string, options: { createHTML?: (s: string) => string }) => ({
        createHTML: (input: string) => options.createHTML?.(input) ?? input,
      }),
    };
  }
}
