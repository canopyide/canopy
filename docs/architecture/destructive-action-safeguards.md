# Destructive Action Safeguards

Living per-action audit and rubric for destructive UI surfaces. Triggered by #7880 (a single-click commit + push button that silently substituted a fallback commit message and required force-push recovery on `origin/develop`). Tracked by #7881.

This document is the **source of truth** for which actions are considered destructive, what safeguard each one currently has, and what should change. CLAUDE.md carries the abbreviated rubric ("Destructive Action Tiers"); this file is the long-form inventory and the index of follow-up issues.

## Rubric

Four tiers, calibrated to **reversibility × blast radius**. The boundary between tiers is not blast-radius count — it is _what the user has to do to get back to where they were_.

| Tier | Reversibility | Required safeguard | Examples |
| --- | --- | --- | --- |
| **D0** | Reversible locally; inverse is one click away | No confirmation. Inverse action (undo, unstage, restore from trash, dock/maximize) must be discoverable. | `git.stageAll`, `git.unstageAll`, `git.commit` (before push), `terminal.trash`, `terminal.background`, `panel.focus`, fleet arm/disarm. |
| **D1** | Local irreversible; git/reflog cannot recover | Explicit `ConfirmDialog` with verb-noun button (`Delete recipe`, not `Delete`). | `terminal.kill`, `terminal.killAll`, `worktree.sessions.endAll`, `worktree.sessions.trashAll`, `git.snapshotDelete`, recipe delete, project remove from list, `keybinding.resetAll`. |
| **D2** | Shared-state mutation; recovery requires coordination (force-push, file restore, external tool) | `ConfirmDialog` + content preview before the mutation fires. Preview must show actual content (diff, message, file list, target branch) — a count alone is insufficient. | `git.push`, `worktree.delete`, `worktree.resource.teardown`, force-push, merge PR, close issue / PR, branch delete on a shared branch. |
| **D3** | Catastrophic blast radius; no recovery path | `ConfirmDialog` with `typedNameTarget` (user types entity name). | Delete repo, delete project with worktrees, teardown cloud environment, bulk delete crossing worktree boundaries. |

**Hard rules** (extracted to CLAUDE.md verbatim — duplicated here for the audit):

1. **No silent fallback defaults.** Never substitute a derived value (commit message, branch name, file path) without showing it to the user first. Commit submission gates on an explicitly authored message — not "ai-note OR last-commit-message" silent chain. This is the #7880 root cause; any "if X is empty, use Y" path on a destructive submission is a review blocker.
2. **`danger` metadata classifies the action's target tier, not just current wiring.** Setting `danger:"confirm"` asserts "this action is destructive enough to need a confirm gate" and produces two real behavioral effects: exclusion from `ActionService.repeatLast` eligibility (`src/services/ActionService.ts:301`) and from the `useActionPalette` MRU rail (`src/hooks/useActionPalette.ts:99`). The matching `ConfirmDialog` at the call site is the **wiring**, tracked separately in this audit's "UI confirm" column. Direction: **classification leads wiring.** If a `ConfirmDialog` is wired, the metadata MUST be `danger:"confirm"` (else the action leaks into MRU). The reverse — that every `danger:"confirm"` already has a dialog — is the _goal state_ the audit drives toward; gaps appear as TBD follow-ups, not silent contradictions.
3. **Direct `window.electron.*` IPC calls bypass `ActionService`.** When a component calls IPC directly for any D1–D3 action, the confirm dialog must be wired in the component. These bypass paths must be listed in this audit (see [Known bypasses](#known-bypasses)) and called out at review.
4. **Bundled multi-step operations** (e.g., stage + commit + push) require either a preview/edit step between each phase, or an explicit "commit and push" confirmation that names both operations and shows the commit message and diff. Never a single button that chains writes silently.
5. **Destructive primitive conventions.** Every destructive `ConfirmDialog` inherits the following from the primitive layer (`AppDialog` + `ConfirmDialog` + `TypedNameConfirmInput`) — consumers do not opt in:
   - **`role="alertdialog"`** on destructive variants (vs `role="dialog"`) so screen readers interrupt the speech queue. `aria-labelledby` / `aria-describedby` continue to wire the title and description.
   - **Initial focus on Cancel** for `variant="destructive"`. The Cancel button carries `data-confirm-role="cancel"` and the Confirm button carries `data-confirm-role="confirm"`; `AppDialog`'s focus effect targets the marker, falling back to the first tabbable element if the consumer renders custom Footer `children`. Override with `initialFocus="first" | "confirm" | "none"` when the destructive surface demands it.
   - **Cancel-left, Primary-right** button order (Apple HIG / modern web). Daintree deliberately diverges from Fluent 2's Primary-left layout — the destructive button is never the first thing the keyboard or pointer lands on.
   - **Typed-name gate** uses `aria-required="true"` and `aria-invalid` when the value is non-empty and unmatched, so assistive tech announces the gate state during the type-to-confirm flow.
   - **Dev-only microcopy guards.** `ConfirmDialog` `warnOnce`s on `title` starting with "Are you sure" and on body text containing "cannot be undone" / "can't be undone". Both rules sit on the entity-naming / specific-consequence requirements from CLAUDE.md and fire once per session.

## Audit table

Columns:

- **Action / call site** — action ID where it exists, otherwise the component path performing the operation
- **Current** — `danger` value in the action definition (or `(bypass)` for direct IPC calls)
- **UI confirm** — does the calling component wire a `ConfirmDialog` today?
- **Consent in breadcrumb** — does the action emit a `confirmed` value into the `ActionBreadcrumb`? `danger:"confirm"` actions emit a boolean (`true` when an agent explicitly confirmed, absent when user-source — `source:"user"` itself carries sufficient signal for dialog-confirmed actions). `danger:"safe"` actions emit `n/a` (field absent). Bypass paths: `n/a` (not routed through `ActionService`).
- **Reversibility** — local-undo / local-irreversible / shared-state / catastrophic
- **Blast** — typical scope per invocation
- **Tier** — recommended tier from the rubric
- **Recommendation** — leave alone / add confirm / add preview / split / spin off
- **Follow-up** — issue tracking the fix (TBD = to be filed after merge)

### Git operations

| Action / call site | Current | UI confirm | Consent in breadcrumb | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `git.stageFile` / `git.unstageFile` | safe | n/a | n/a | local-undo (inverse exists) | one file | D0 | Leave | — |
| `git.stageAll` / `git.unstageAll` | safe | n/a | n/a | local-undo (inverse exists) | worktree | D0 | Leave | — |
| `git.commit` (action) | safe | n/a (caller-supplied msg required) | n/a | local-undo (amend / reset until push) | one commit | D0 | Leave action; but every commit _submission_ call site must gate on authored, non-fallback message (see follow-ups) | — |
| `git.push` (action) | **confirm** (updated #7881) | yes — `GitPushConfirmDialog` (deferred-Promise gate via `gitPushConfirmStore`; the action `run()` awaits confirmation, dialog previews target branch + recent local commits, #8242) | Boolean via dispatch | shared-state (force-push to undo) | one branch on origin | D2 | Done (#8242) — palette/keybinding push gates on the same D2 preview | — |
| `git.snapshotRevert` | confirm | yes — `ConfirmDialog` via `useWorktreeActions` / `WorktreeDialogs` (preview names the snapshot capture time; #8242) | Boolean via dispatch | local-irreversible (wipes working tree to snapshot) | one worktree | D1 | Done (#8242) — confirm wired at the WorktreeCard menu call site | — |
| `git.snapshotDelete` | **confirm** (updated #7881) | none — call site not yet identified | Boolean via dispatch | local-irreversible (no recovery once deleted) | one worktree | D1 | Wire `ConfirmDialog` wherever the action is invoked | TBD |
| `ReviewHubContent.tsx` `handleCommitAndPush(message)` | (bypass — chains `commit` + `runPush`) | yes (`CommitPanel` push confirm — every remote push gates on `ConfirmDialog` with branch pill + commit message preview + per-worktree opt-out, #8025) | Boolean via dispatch | shared-state | one branch on origin | D2 | Leave — wired model for bundled commit-and-push | — |
| `ForcePushConfirmDialog.tsx` `forcePushWithLease` | (bypass, but **dialog already wired**) | yes (`ForcePushConfirmDialog`) | n/a (bypass) | shared-state, recoverable only by lease check | one branch on origin | D2 | Leave — current implementation is the model for D2 confirms | — |
| `ReviewHubContent.tsx:896` `pullRebase` | (bypass, but **dialog now wired**) | yes — `ConfirmDialog` previews local-ahead vs incoming-behind divergence on the current branch before rebase (#8242); `git.pullRebase` action reclassified `safe`→`confirm` | Boolean via dispatch | local-irreversible until pushed (rebase can clobber) | one worktree | D1 | Done (#8242) — confirm + divergence preview wired at the ReviewHub call site | — |
| `ReviewHubContent.tsx:733` `abortRepositoryOperation` | (bypass) | none | n/a (bypass) | local-undo (abort is the recovery) | one worktree | D0 | Leave (abort _is_ the recovery path) | — |
| `ReviewHubContent.tsx:778` `checkoutOursTheirs` | (bypass, but **dialog now wired**) | yes — `ConfirmDialog` in `ConflictPanel` previews the file path + side (rebase-aware) before overwriting the conflict buffer (#8242) | n/a (bypass) | local-irreversible (overwrites conflict resolution) | one file | D1 | Done (#8242) — every conflict-buffer overwrite gates on a per-file confirm | — |

### Worktree operations

| Action / call site | Current | UI confirm | Consent in breadcrumb | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `worktree.create` / `worktree.quickCreate` / `worktree.createDialog.open` | safe | n/a (creation) | n/a | reversible (delete the worktree) | one new worktree | D0 | Leave | — |
| `worktree.delete` | confirm | yes (`WorktreeDeleteDialog`) | Boolean via dispatch | shared-state (working tree + branch on disk) | one worktree, optionally one branch | D2 | Leave — preview shows file count split (tracked vs untracked, see #4927) | — |
| `worktree.delete` with `force: true` | confirm | yes; force flag is a separate toggle in the dialog, escalates to typed-name gate | Boolean via dispatch | shared-state, may discard uncommitted work | one worktree | D2 → escalates to D3 when worktree has uncommitted tracked changes | Done (#8023) — `WorktreeDeleteDialog.isHighTier` escalates to the typed-name gate when `force && hasTrackedChanges` (in addition to protected branch / main worktree); uses `hasTrackedChanges` not `hasChanges` so untracked-only deletes don't escalate (#4927) | — |
| `worktree.resource.provision` | safe | n/a | n/a | reversible (teardown) | one resource | D0 | Leave | — |
| `worktree.resource.teardown` | **confirm** (updated #8023) | yes (`ConfirmDialog` via `useWorktreeActions` / `WorktreeCard`) — preview lists the actual teardown commands | Boolean via dispatch | shared-state (cloud resource destroyed) | one resource | D2 | Done (#8023) — confirm shows the resolved teardown command list before dispatch | — |
| `worktree.resource.pause` / `worktree.resource.resume` | safe | n/a | n/a | reversible | one resource | D0 | Leave | — |

### Worktree sessions

| Action / call site | Current | UI confirm | Consent in breadcrumb | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `worktree.sessions.minimizeAll` / `maximizeAll` | safe | n/a | n/a | reversible | one worktree | D0 | Leave | — |
| `worktree.sessions.restartAll` | **confirm** (updated #8245) | yes (`TerminalDestructiveActionConfirmDialog` via `useTerminalPendingDestructiveActionStore`) — fires only when the target worktree has a running agent session | Boolean via dispatch | local-irreversible (scrollback lost) | one worktree | D1 | Done (#8245) | — |
| `worktree.sessions.resetRenderers` | safe | n/a | n/a | reversible (just re-renders) | one worktree | D0 | Leave | — |
| `worktree.sessions.closeCompleted` | safe | n/a | n/a | local-irreversible (trashed terminals lose scrollback) | one worktree | D0 | Leave — only targets completed/exited terminals | — |
| `worktree.sessions.trashAll` | confirm | yes (`useWorktreeActions.ts` `handleCloseAll`, updated #8245) — verb-noun "Trash all sessions" with consequence preview | Boolean via dispatch | local-irreversible (scrollback lost; trashed) | one worktree | D1 | Done (#8245) | — |
| `worktree.sessions.endAll` | confirm | yes (`useWorktreeActions.ts:130-148`) | Boolean via dispatch | local-irreversible | one worktree | D1 | Leave — current pattern is the model for D1 confirms | — |

### Terminal lifecycle

| Action / call site | Current | UI confirm | Consent in breadcrumb | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `terminal.close` / `terminal.trash` | safe | n/a | n/a | reversible (restore from trash before next gc) | one terminal | D0 | Leave | — |
| `terminal.background` | safe | n/a | n/a | reversible (foreground / focus) | one terminal | D0 | Leave | — |
| `terminal.kill` | **confirm** (updated #8245) | yes — context menu (local `ConfirmDialog`) and keybinding/palette (app-level `TerminalDestructiveActionConfirmDialog`); fires only when the terminal has a running agent session (`terminalHasRunningAgentSession`), bare PTY stays D0 | Boolean via dispatch | local-irreversible (PTY killed, scrollback lost) | one terminal | D1 | Done (#8245) | — |
| `terminal.killAll` | **confirm** (updated #8245) | yes (`TerminalDestructiveActionConfirmDialog`) — fires when any non-ephemeral terminal has a running agent; label shows total terminals + running-agent count | Boolean via dispatch | local-irreversible | every non-ephemeral terminal | D1 | Done (#8245) | — |
| `terminal.closeAll` | safe | none | n/a | reversible (trash, not kill) | every active-worktree terminal | D0 | Leave | — |
| `terminal.restart` | **confirm** (updated #8245) | yes — context menu + keybinding/palette dialog hosts; fires only when terminal has a running agent session | Boolean via dispatch | local-irreversible (scrollback lost; process re-spawned) | one terminal | D1 | Done (#8245) | — |
| `terminal.restartAll` | **confirm** (updated #8245) | yes (`TerminalDestructiveActionConfirmDialog`) — fires when any non-trash terminal has a running agent | Boolean via dispatch | local-irreversible | many terminals | D1 | Done (#8245) | — |
| `terminal.restartService` | safe | n/a | n/a | local-irreversible (all PTY processes restart) | every terminal in the window | D1 | Action is gated on `backendStatus === "disconnected"`; the gate already implies an error state, so leave as-is | — |

### Dev preview

| Action / call site | Current | UI confirm | Consent in breadcrumb | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `devPreview.stop` | safe | n/a | n/a | local-undo (re-start) | one dev server | D0 | Leave | — |

### Fleet operations

| Action / call site | Current | UI confirm | Consent in breadcrumb | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fleet.accept` | safe | n/a (sends affirmative to a prompt) | n/a | local-irreversible per prompt | armed waiting agents | D0 | Leave — affirmative response to an already-displayed prompt | — |
| `fleet.reject` | safe | conditional confirm in `run()` body when 5+ targets | n/a | local-irreversible per prompt | armed waiting agents | D0 | Leave — internal confirm is sufficient; `n\r` is the safe default | — |
| `fleet.interrupt` | safe | conditional confirm in `run()` body when 3+ targets | n/a | local-recoverable (re-arm/continue) | armed working agents | D0 | Leave | — |
| `fleet.restart` | **confirm** (updated #7881) | yes (internal confirm via `useFleetPendingActionStore`) | Boolean via dispatch | local-irreversible (scrollback + session lost) | armed agents | D1 | Leave — internal confirm pattern is the canonical example for actions that aren't surfaced via `danger`-driven gates | — |
| `fleet.kill` | **confirm** (updated #7881) | yes (internal confirm) | Boolean via dispatch | local-irreversible | armed terminals | D1 | Leave | — |
| `fleet.trash` | **confirm** (updated #7881) | yes (internal confirm; threshold 5+) | Boolean via dispatch | local-irreversible (scrollback lost) | armed terminals | D1 | Leave; consider lowering threshold to 3+ in a follow-up | TBD |
| `fleet.armMatchingFilter` / `fleet.armFocused` / `fleet.armAll` | safe | n/a | n/a | reversible (disarm) | armed set | D0 | Leave | — |
| `fleet.saveNamedFleet` | safe | n/a | n/a | reversible (delete fleet) | one saved fleet | D0 | Leave | — |
| `fleet.recallNamedFleet` | safe | n/a | n/a | reversible (re-arm) | armed set | D0 | Leave | — |
| `fleet.deleteNamedFleet` | **confirm** (updated #8023) | yes (`ConfirmDialog` hoisted to `FleetArmingRibbon`, outside the dropdown tree) | Boolean via dispatch | local-irreversible (settings entry gone) | one saved fleet | D1 | Done (#8023) — confirm state lifted above the Radix `DropdownMenu` so the dialog survives the menu closing (#2828) | — |
| `fleet.retryFailures` | safe | n/a | n/a | local-undo (just re-fires the last broadcast) | failed broadcast targets | D0 | Leave | — |

### Project / window

| Action / call site | Current | UI confirm | Consent in breadcrumb | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `project.add` / `project.cloneRepo` / `project.openDialog` | safe | n/a | n/a | reversible | one project | D0 | Leave | — |
| `project.switch` / `project.switcherPalette` | safe | n/a | n/a | reversible (switch back) | one project | D0 | Leave | — |
| `project.update` / `project.saveSettings` | safe | n/a | n/a | reversible (re-edit) | one project | D0 | Leave | — |
| `project.remove` | **confirm** (updated #8247) | yes (`confirmRemoveProject` in `useProjectSwitcherPalette.ts`; all four entry points funnel through it) | Boolean via dispatch | local-irreversible (removed from list; worktrees on disk remain) | one project | D1 | Done (#8247) | #8247 |
| `project.close` / `project.closeActive` | safe | yes — `callbacks.onConfirmCloseActiveProject` routes through a confirm flow | n/a | local-irreversible (terminals killed) | one project | D1 | Leave — confirm flow already exists | — |
| `window.close` | safe | OS-native warning when unsaved work present | n/a | local-irreversible (window state lost) | one window | D0 | Leave — OS provides confirm | — |
| `window.forceReload` | safe | n/a | n/a | local-irreversible (in-flight UI state lost) | one window | D0 | Acceptable: developer affordance; would only escalate if discoverable from non-dev menus | — |

### GitHub-side

The current GitHub action set is read-only (`openIssues`, `listPullRequests`, etc.) plus token management. No PR merge, no issue close, no comment-post is wired through `ActionService` yet.

| Action / call site | Current | UI confirm | Consent in breadcrumb | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `github.setToken` / `github.clearToken` | safe | n/a | n/a | reversible (re-enter) | local credential | D0 | Leave | — |
| `github.openIssue` / `github.openPR` / `github.openCommits` / list / get queries | safe | n/a | n/a | reversible (navigation only) | navigation | D0 | Leave | — |
| Merge PR / close issue / dismiss review (future) | n/a — not yet exposed via UI | n/a | n/a | shared-state | one PR or issue on origin | D2 | When wired, must be `danger:"confirm"` from day one and ship with target-naming preview | open as needed |

### Recipes / plugins

| Action / call site | Current | UI confirm | Consent in breadcrumb | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `recipe.run` | safe | n/a | n/a | local-irreversible (spawns processes; not a content mutation) | one recipe → many terminals | D0 | Leave | — |
| `recipe.editor.open` / `recipe.manager.open` | safe | n/a | n/a | reversible | UI | D0 | Leave | — |
| `recipe.saveToRepo` (with `deleteOriginal: true`) | safe | yes (`RecipeManager.tsx` ConfirmDialog) | n/a | local-irreversible (original deleted) | one recipe | D1 | Leave — current pattern is correct | — |
| `recipe.delete` | **confirm** (added #8247) | yes (`ConfirmDialog` in `RecipeManager.tsx` + `RecipesTab.tsx`; both dispatch through the action) | Boolean via dispatch | local-irreversible | one recipe | D1 | Done (#8247) | #8247 |
| `useRecipeRunner.ts:386` `handleDelete` (RecipeRunner context menu) | (bypass) | none — calls store `deleteRecipe` directly, no `ConfirmDialog` | n/a (bypass) | local-irreversible | one recipe | D1 | Route through `recipe.delete` and wire a `ConfirmDialog` at the RecipeRunner call site | TBD |
| Plugin install / uninstall (future) | n/a — not yet wired | n/a | n/a | shared-state (filesystem + plugin host restart) | one plugin | D1 | When wired, `danger:"confirm"` + show plugin metadata before install/uninstall | open as needed |

### Portal / browser

| Action / call site | Current | UI confirm | Consent in breadcrumb | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `portal.links.add` / `update` / `toggle` / `reorder` | safe | n/a | n/a | reversible | one link | D0 | Leave | — |
| `portal.links.remove` | **confirm** (updated #8023) | yes (`ConfirmDialog` in `PortalSettingsTab`) | Boolean via dispatch | local-irreversible (link gone) | one link | D1 | Done (#8023) — confirm wired at the Custom links delete control | — |
| `portal.closeTab` / `closeOthers` / `closeToRight` / `closeAllTabs` | safe | none | n/a | local-irreversible (tab history lost) | 1..N tabs | D0 (single) → D1 (bulk) | Add confirm for `closeAllTabs` and `closeOthers` when 3+ tabs would close | TBD |
| `portal.duplicateTab` / `reload` / `goBack` / `goForward` | safe | n/a | n/a | reversible | one tab | D0 | Leave | — |

### Keybindings / preferences

| Action / call site | Current | UI confirm | Consent in breadcrumb | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `keybinding.setOverride` / `removeOverride` | safe | n/a | n/a | reversible (reset to default) | one binding | D0 | Leave | — |
| `keybinding.resetAll` | **confirm** (updated #8247) | yes (`ConfirmDialog` at `KeyboardShortcutsTab.tsx:184`, dispatches with `confirmed:true`) | Boolean via dispatch | local-irreversible (all overrides lost) | every override | D1 | Done (#8247) | #8247 |

### Dev preview

| Action / call site | Current | UI confirm | Consent in breadcrumb | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `useDevServer.ts:299` `devPreview.restart` (direct IPC) | safe | none — hook calls IPC directly | n/a | local-irreversible (PTY killed, dev-server scrollback lost; rebuilds on respawn) | one panel | D1 | Document bypass; sibling UI issue migrates the button to the `devPreview.restart` action so the danger rating can gate it | TBD (UI issue) |
| `devPreview.restartAndClearCache` | **confirm** | none yet — `ConfirmDialog` wired in sibling UI issue | Boolean via dispatch | local-irreversible (framework build caches `.next`/`.vite`/`.turbo` wiped; regenerate on next build) | one panel | D1 | `danger:"confirm"` classification set; wire `ConfirmDialog` at the UI call site | TBD (UI issue) |
| `devPreview.reinstallAndRestart` | **confirm** | none yet — `ConfirmDialog` wired in sibling UI issue | Boolean via dispatch | shared-state (`node_modules` removed; recovery requires a full reinstall, network + lockfile dependent) | one panel | D2 | `danger:"confirm"` classification set; wire `ConfirmDialog` + change preview at the UI call site | TBD (UI issue) |

## Known bypasses

Direct `window.electron.*` IPC calls that skip `ActionService`. These are the highest-risk locations because the action's `danger` rating cannot gate them — the confirmation must live in the component itself.

| File | Operation | Has UI confirm? |
| --- | --- | --- |
| `src/components/Worktree/WorktreeCard.tsx` | `git.snapshotRevert` (context menu) | **Yes** — `ConfirmDialog` via `useWorktreeActions` / `WorktreeDialogs` (#8242) |
| `src/components/Worktree/ReviewHub/ReviewHubContent.tsx` | `stageAll`, `unstageAll`, `stageFile`, `commit` block | Authored-message gate on commit; no top-level dialog |
| `src/components/Worktree/ReviewHub/ReviewHubContent.tsx` | `handleCommitAndPush` (bundled `commit` + `push`) | **Yes** — `CommitPanel` push confirm with branch pill + commit message preview + per-worktree opt-out (#8025); only user-initiated remote push path |
| `src/components/Worktree/ReviewHub/ReviewHubContent.tsx` | `pullRebase` | **Yes** — `ConfirmDialog` with ahead/behind divergence preview (#8242) |
| `src/components/Worktree/ReviewHub/ReviewHubContent.tsx` | `checkoutOursTheirs` | **Yes** — per-file `ConfirmDialog` in `ConflictPanel` (#8242) |
| `src/components/Worktree/ReviewHub/ForcePushConfirmDialog.tsx` | `forcePushWithLease` | **Yes** — model implementation |
| `src/hooks/useDevServer.ts:299` | `devPreview.restart` (dev-preview restart button) | **No** — hook invokes IPC directly; sibling UI issue migrates to the `devPreview.restart` action |

## Maintenance

- This document is the source of truth for which actions are considered destructive and what tier they belong to. Updates are part of any PR that adds a new destructive action, changes an `ActionDanger` value, or wires a new `ConfirmDialog`.
- When filing follow-up issues, link them in the **Follow-up** column. Closed follow-ups can be replaced with the merge commit SHA.
- Regression guard: `src/services/actions/__tests__/actionDefinitions.quality.test.ts` asserts that the actions listed in the test's `EXPECTED_CONFIRM_DANGER` set carry `danger:"confirm"`. Adding a new destructive action means updating that set and updating this table.
- Cross-reference: CLAUDE.md "Destructive Action Tiers" rule carries the abbreviated rubric; this document carries the full inventory.
