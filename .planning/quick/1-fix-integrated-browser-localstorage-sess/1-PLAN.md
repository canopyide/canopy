---
mode: quick-full
task: "Fix integrated browser localStorage/sessionStorage not persisting across navigations (#4564)"
formal_artifacts: none
must_haves:
  truths:
    - "will-attach-webview handler explicitly sets webPreferences.partition from params.partition"
    - "PortalManager flushes session storage data before destroying WebContentsViews"
    - "Unit test verifies partition preservation in will-attach-webview handler"
  artifacts:
    - electron/window/createWindow.ts
    - electron/services/PortalManager.ts
    - electron/window/__tests__/createWindow.webview-partition.test.ts
  key_links:
    - electron/window/createWindow.ts
    - electron/services/PortalManager.ts
    - electron/setup/security.ts
    - src/components/Browser/BrowserPane.tsx
---

# Quick Task 1 — Fix browser localStorage/sessionStorage persistence

## Problem

The integrated browser's Web Storage (localStorage and sessionStorage) is lost on page reload/navigation. Issue #4564.

## Root Cause

The `will-attach-webview` handler in `createWindow.ts` (line 234-256) hardens `webPreferences` by setting `sandbox: true`, `contextIsolation: true`, etc. — but it does NOT explicitly set `webPreferences.partition = params.partition`. In Electron 40, modifications to the `webPreferences` object in this handler can cause the partition from the `<webview>` tag's HTML attribute to not propagate correctly, resulting in the webview using an ephemeral (non-persistent) session instead of the intended `persist:browser` session.

Additionally, `PortalManager.destroyView()` calls `view.webContents.close()` without first flushing pending storage data to disk, creating a race condition where recent writes may be lost.

## Tasks

### Task 1: Fix partition preservation in will-attach-webview handler

- **files**: `electron/window/createWindow.ts`
- **action**: In the `will-attach-webview` handler, after the security hardening block (after line 255), add `webPreferences.partition = params.partition;` to explicitly preserve the validated partition in webPreferences. This ensures the webview uses the correct persistent session regardless of how Electron 40 resolves webPreferences vs tag attributes.
- **verify**: Read the modified handler to confirm `webPreferences.partition` is explicitly set from `params.partition` after validation passes.
- **done**: The will-attach-webview handler explicitly preserves the partition from the webview tag's HTML attribute.

### Task 2: Add storage flush before WebContentsView destruction in PortalManager

- **files**: `electron/services/PortalManager.ts`
- **action**: Make `destroyView()` and `destroyHiddenTabs()` async. In both methods, **await** `view.webContents.session.flushStorageData()` before calling `view.webContents.close()`. The await is critical — a fire-and-forget flush does not guarantee storage reaches disk before the renderer is terminated. Wrap the flush in try/catch so errors don't block teardown. Update call sites (`evictIfNeeded`, `closeTab`, `destroy`) to handle the async return.
- **verify**: Read the modified methods to confirm `flushStorageData()` is **awaited** before `close()` in both `destroyView` and `destroyHiddenTabs`.
- **done**: PortalManager awaits storage flush before destroying any WebContentsView.

### Task 3: Add unit test for partition preservation

- **files**: `electron/window/__tests__/createWindow.webview-partition.test.ts` (new)
- **action**: Create a focused unit test that verifies the `will-attach-webview` handler correctly sets `webPreferences.partition` from `params.partition` for allowed partitions (`persist:browser`, `persist:dev-preview-*`). Mock the BrowserWindow and verify that after the handler runs, `webPreferences.partition` matches the validated partition.
- **verify**: Run the test with `npx vitest run electron/window/__tests__/createWindow.webview-partition.test.ts` and confirm it passes.
- **done**: Test exists and passes, verifying partition preservation behavior.
