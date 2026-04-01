---
phase: quick-1-fix-integrated-browser-blocking-cross-or
verified: 2026-03-29T15:08:00Z
status: passed
score: 5/5 must-haves verified
---

# Quick Task 1: Surface Blocked Cross-Origin Browser Navigations

**Task Goal:** Surface blocked cross-origin navigations to the user with an offer to open in system browser — instead of silently swallowing them.

**Verified:** 2026-03-29T15:08:00Z
**Status:** PASSED

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                              | Status   | Evidence                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Blocked cross-origin navigations in webview guests are surfaced to the user via IPC notification   | VERIFIED | CHANNELS.WEBVIEW_NAVIGATION_BLOCKED defined; will-navigate and will-redirect handlers send IPC message on block with panelId, url, canOpenExternal payload. BrowserPane.tsx listens via window.electron.webview.onNavigationBlocked and updates state.                                                  |
| 2   | User is offered the option to open the blocked URL in the system browser                           | VERIFIED | BrowserPane.tsx renders notification bar with "Open in Browser" button that calls window.electron.system.openExternal(). Button only shows when canOpenExternal is true.                                                                                                                                |
| 3   | The localhost-only navigation restriction remains intact (TOCTOU guard preserved)                  | VERIFIED | isLocalhostUrl() check is unmodified; localhost/127.0.0.1 URLs pass through without event.preventDefault(). Non-localhost URLs are blocked as before. No change to setWindowOpenHandler or will-attach-webview validation.                                                                              |
| 4   | Dangerous protocols (javascript:, data:, file:, about:) are blocked without offering external open | VERIFIED | canOpenExternalUrl() only returns true for http/https URLs. Tests confirm canOpenExternal: false for javascript: URLs. A notification is still shown (informing the user the navigation was blocked) but the "Open in Browser" button does not render — the user cannot open dangerous URLs externally. |
| 5   | Only http/https blocked URLs are offered for external opening (safe protocols)                     | VERIFIED | canOpenExternalUrl() implementation checks protocol === "http:" or "https:"; payload sets canOpenExternal accordingly. BrowserPane conditional renders button only when canOpenExternal is true.                                                                                                        |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                               | Expected                                                                  | Status   | Details                                                                                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| electron/setup/protocols.ts            | IPC notification when cross-origin navigation is blocked in webview       | VERIFIED | Lines 173-209: will-navigate and will-redirect handlers both call mainWindow.webContents.send(CHANNELS.WEBVIEW_NAVIGATION_BLOCKED, { panelId, url, canOpenExternal }). Handlers guard with isLocalhostUrl() and event.preventDefault().                       |
| src/components/Browser/BrowserPane.tsx | UI handling for blocked navigation notification with open-external action | VERIFIED | Lines 108-111: blockedNav state; Lines 160-167: useEffect listener for onNavigationBlocked event; Lines 169-174: auto-dismiss timer (10s); Lines 767-793: notification bar UI with truncated URL, "Open in Browser" button (conditional), and dismiss button. |
| electron/ipc/channels.ts               | WEBVIEW_NAVIGATION_BLOCKED channel constant                               | VERIFIED | Line 284: WEBVIEW_NAVIGATION_BLOCKED: "webview:navigation-blocked"                                                                                                                                                                                            |
| shared/types/ipc/maps.ts               | Event type mapping { panelId, url, canOpenExternal }                      | VERIFIED | Lines 1882-1887: "webview:navigation-blocked" maps to event payload with panelId (string), url (string), canOpenExternal (boolean)                                                                                                                            |
| shared/types/ipc/api.ts                | Type declaration for onNavigationBlocked in webview API                   | VERIFIED | Lines 777-780: onNavigationBlocked method signature with callback receiving { panelId, url, canOpenExternal }                                                                                                                                                 |
| electron/preload.cts                   | onNavigationBlocked listener + channel constant                           | VERIFIED | onNavigationBlocked uses \_typedOn helper to subscribe to CHANNELS.WEBVIEW_NAVIGATION_BLOCKED with correct callback signature                                                                                                                                 |

### Key Link Verification

| From                                   | To                             | Via                                         | Status | Details                                                                                                             |
| -------------------------------------- | ------------------------------ | ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| electron/setup/protocols.ts            | electron/ipc/channels.ts       | WEBVIEW_NAVIGATION_BLOCKED channel constant | WIRED  | protocols.ts imports CHANNELS (line 15) and sends via CHANNELS.WEBVIEW_NAVIGATION_BLOCKED (lines 182, 201)          |
| electron/setup/protocols.ts            | electron/utils/openExternal.ts | canOpenExternalUrl() function               | WIRED  | protocols.ts imports canOpenExternalUrl (line 11) and calls it to set payload.canOpenExternal (lines 185, 204)      |
| src/components/Browser/BrowserPane.tsx | window.electron.webview        | onNavigationBlocked listener                | WIRED  | BrowserPane.tsx calls window.electron.webview.onNavigationBlocked (line 161) in useEffect, returns cleanup function |
| src/components/Browser/BrowserPane.tsx | window.electron.system         | openExternal method                         | WIRED  | BrowserPane.tsx calls window.electron.system.openExternal(blockedNav.url) in button onClick handler (line 777)      |

### Tests

**Test File:** electron/setup/**tests**/protocols.test.ts

**Results:** 21/21 tests passing

- 6 will-navigate tests (registration, localhost allow, https block, https localhost allow, file block, dangerous protocols)
- 1 will-navigate logging test
- 2 will-redirect tests (localhost allow, external block)
- 1 will-redirect logging test
- 2 non-webview tests (no handlers registered for non-webview types)
- 5 blocked-navigation IPC notification tests:
  - sends IPC for https URL navigation block with canOpenExternal: true
  - sends IPC for redirect block with canOpenExternal: true
  - does NOT send IPC for localhost navigation (allowed)
  - sends IPC with canOpenExternal: false for javascript: URL
  - does NOT send IPC when panelId not found

**Verification:** `npx vitest run electron/setup/__tests__/protocols.test.ts` — all 21 tests pass

### Type Safety

**Verification:** `npx tsc --noEmit` — no type errors

All IPC contracts are correctly typed:

- IpcEventMap includes "webview:navigation-blocked" with correct payload shape
- shared/types/ipc/api.ts defines onNavigationBlocked with correct callback signature
- electron/preload.cts correctly implements \_typedOn wrapper
- window.electron.webview.onNavigationBlocked is typed in renderer

### Security Invariants Preserved

1. **Localhost-only restriction:** INTACT
   - isLocalhostUrl() check unmodified
   - localhost and 127.0.0.1 URLs pass through
   - All other URLs blocked (https://example.com, javascript:, data:, file://, etc.)

2. **Dangerous protocols:** Blocked without offer to open
   - javascript: URLs blocked + IPC sent with canOpenExternal: false
   - data: URLs blocked + IPC sent with canOpenExternal: false
   - file: URLs blocked + IPC sent with canOpenExternal: false
   - about: URLs blocked + IPC sent with canOpenExternal: false
   - "Open in Browser" button only renders when canOpenExternal: true

3. **setWindowOpenHandler:** UNCHANGED
   - Still denies all window.open() popups from webviews
   - Still routes to system browser via openExternalUrl() for http/https URLs

4. **will-attach-webview:** UNCHANGED
   - Still validates webview src is localhost-only

5. **CSP:** UNCHANGED
   - No changes to Content-Security-Policy

6. **Permission lockdown:** UNCHANGED
   - Webview partitions still use "persist:browser" with full CSP restrictions

### Anti-Patterns Scan

No TODO/FIXME/placeholder comments found in modified files.
No empty implementations found.
No stubs detected in notification bar code.

The notification UI is fully implemented:

- State management (blockedNav state, useState, useEffect)
- Event listener (window.electron.webview.onNavigationBlocked)
- Auto-dismiss (useEffect with 10-second timeout)
- User action (button onClick calls openExternal)
- Dismiss button (manual close via setBlockedNav(null))

### Manual Verification Recommendations

The implementation passes all automated checks. The following manual tests could verify runtime behavior (not blocking closure of this verification):

1. **Test Blocked Navigation Notification**
   - Open Browser panel, navigate to https://example.com
   - Verify yellow notification bar appears at top with URL and "Open in Browser" button
   - Verify notification auto-dismisses after 10 seconds
   - Verify manual dismiss button (×) works

2. **Test Safe Protocol Handling**
   - Navigate to https://accounts.google.com
   - Verify "Open in Browser" button appears (canOpenExternal: true)
   - Click button, verify URL opens in system browser

3. **Test Dangerous Protocol Blocking**
   - Try javascript:alert(1) in address bar
   - Verify notification appears but NO "Open in Browser" button (canOpenExternal: false)
   - Try data:text/html,<h1>Test</h1>
   - Verify notification appears but NO "Open in Browser" button

4. **Test Localhost Passthrough**
   - Navigate to http://localhost:3000
   - Verify navigation succeeds (no notification)
   - Navigate to http://127.0.0.1:8080
   - Verify navigation succeeds (no notification)

---

_Verified: 2026-03-29T15:08:00Z_
_Verifier: Claude (gsd-verifier)_
