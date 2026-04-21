import type { KnipConfig } from "knip";

const config: KnipConfig = {
  // Every bundle entry point. Knip walks the static import graph from each
  // of these roots; anything unreachable is flagged as dead code. Mirrors
  // the esbuild entryPoints in scripts/build-main.mjs plus the renderer
  // entry wired via vite.config.
  entry: [
    "electron/bootstrap.ts",
    "electron/main.ts",
    "electron/pty-host.ts",
    "electron/pty-host-bootstrap.ts",
    "electron/workspace-host.ts",
    "electron/workspace-host-bootstrap.ts",
    "electron/preload.cts",
    "src/main.tsx",
  ],

  // Project files Knip considers part of the graph. Includes root-level
  // *.config.ts (vite, vitest, playwright) and scripts/** so build-time and
  // test-time imports are seen — without them Knip reports live devDeps
  // like tailwindcss, fast-check, and wait-on as unused.
  project: [
    "electron/**/*.{ts,cts}",
    "src/**/*.{ts,tsx}",
    "shared/**/*.ts",
    "scripts/**/*.{js,mjs,ts}",
    "*.config.{ts,mts,cts,js,mjs,cjs}",
  ],

  // why: ActionService dispatches via string IDs (see
  // src/services/ActionService.ts — `dispatch(actionId, ...)`). Knip cannot
  // see those calls in the static import graph, so action handlers registered
  // via the definitions/*.ts files appear unused. Surface this as a known
  // false-positive class rather than a file-level ignore so any *new*
  // genuinely-unused exports still get flagged.
  ignoreExportsUsedInFile: true,

  ignore: [
    // why: contextBridge.exposeInMainWorld in electron/preload.cts exposes a
    // runtime object whose keys are consumed by the renderer via
    // window.electron. Knip cannot trace that runtime channel, so every
    // re-exported helper in the preload graph reads as unused. The preload is
    // itself an entry point — we only need to silence false-positive export
    // reports, not exclude the file from analysis.
    "electron/preload.cts",

    // why: electron/ipc/channels.ts is consumed at runtime via string
    // matching — handlers register by channel name, clients invoke by the
    // same name. Static analysis sees the constants as unreferenced.
    "electron/ipc/channels.ts",
  ],
};

export default config;
