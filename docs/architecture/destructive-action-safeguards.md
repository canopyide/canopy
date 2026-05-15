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

## Audit table

Columns:

- **Action / call site** — action ID where it exists, otherwise the component path performing the operation
- **Current** — `danger` value in the action definition (or `(bypass)` for direct IPC calls)
- **UI confirm** — does the calling component wire a `ConfirmDialog` today?
- **Reversibility** — local-undo / local-irreversible / shared-state / catastrophic
- **Blast** — typical scope per invocation
- **Tier** — recommended tier from the rubric
- **Recommendation** — leave alone / add confirm / add preview / split / spin off
- **Follow-up** — issue tracking the fix (TBD = to be filed after merge)

### Git operations

| Action / call site | Current | UI confirm | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `git.stageFile` / `git.unstageFile` | safe | n/a | local-undo (inverse exists) | one file | D0 | Leave | — |
| `git.stageAll` / `git.unstageAll` | safe | n/a | local-undo (inverse exists) | worktree | D0 | Leave | — |
| `git.commit` (action) | safe | n/a (caller-supplied msg required) | local-undo (amend / reset until push) | one commit | D0 | Leave action; but every commit _submission_ call site must gate on authored, non-fallback message (see follow-ups) | — |
| `git.push` (action) | **confirm** (updated #7881) | none in palette/keybinding path | shared-state (force-push to undo) | one branch on origin | D2 | Add commit-and-push confirmation when invoked outside ReviewHub | TBD |
| `git.snapshotRevert` | confirm | none at `WorktreeCard.tsx:183` direct IPC call | local-irreversible (wipes working tree to snapshot) | one worktree | D1 | Wire `ConfirmDialog` at the WorktreeMenu call site | TBD |
| `git.snapshotDelete` | **confirm** (updated #7881) | none — call site not yet identified | local-irreversible (no recovery once deleted) | one worktree | D1 | Wire `ConfirmDialog` wherever the action is invoked | TBD |
| `ReviewHubContent.tsx` `handleCommitAndPush(message)` | (bypass — chains `commit` + `runPush`) | yes (`CommitPanel` push confirm — every remote push gates on `ConfirmDialog` with branch pill + commit message preview + per-worktree opt-out, #8025) | shared-state | one branch on origin | D2 | Leave — wired model for bundled commit-and-push | — |
| `ForcePushConfirmDialog.tsx` `forcePushWithLease` | (bypass, but **dialog already wired**) | yes (`ForcePushConfirmDialog`) | shared-state, recoverable only by lease check | one branch on origin | D2 | Leave — current implementation is the model for D2 confirms | — |
| `ReviewHubContent.tsx:896` `pullRebase` | (bypass) | none | local-irreversible until pushed (rebase can clobber) | one worktree | D1 | Add confirm + show divergence preview before rebase | TBD |
| `ReviewHubContent.tsx:733` `abortRepositoryOperation` | (bypass) | none | local-undo (abort is the recovery) | one worktree | D0 | Leave (abort _is_ the recovery path) | — |
| `ReviewHubContent.tsx:778` `checkoutOursTheirs` | (bypass) | none | local-irreversible (overwrites conflict resolution) | one file | D1 | Add confirm for files with uncommitted work; otherwise inline button is acceptable | TBD |

### Worktree operations

| Action / call site | Current | UI confirm | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `worktree.create` / `worktree.quickCreate` / `worktree.createDialog.open` | safe | n/a (creation) | reversible (delete the worktree) | one new worktree | D0 | Leave | — |
| `worktree.delete` | confirm | yes (`WorktreeDeleteDialog`) | shared-state (working tree + branch on disk) | one worktree, optionally one branch | D2 | Leave — preview shows file count split (tracked vs untracked, see #4927) | — |
| `worktree.delete` with `force: true` | confirm | yes; force flag is a separate toggle in the dialog | shared-state, may discard uncommitted work | one worktree | D2 → escalates to D3 when worktree has uncommitted tracked changes | Treat the "force delete with uncommitted changes" path as D3 — require typed-name confirmation | TBD |
| `worktree.resource.provision` | safe | n/a | reversible (teardown) | one resource | D0 | Leave | — |
| `worktree.resource.teardown` | safe | none in action; depends on resource client | shared-state (cloud resource destroyed) | one resource | D2 | Add confirm + show what teardown will run / which resource | TBD |
| `worktree.resource.pause` / `worktree.resource.resume` | safe | n/a | reversible | one resource | D0 | Leave | — |

### Worktree sessions

| Action / call site | Current | UI confirm | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `worktree.sessions.minimizeAll` / `maximizeAll` | safe | n/a | reversible | one worktree | D0 | Leave | — |
| `worktree.sessions.restartAll` | safe | n/a | local-irreversible (scrollback lost) | one worktree | D1 | Add confirm when the worktree has any running agent sessions | TBD |
| `worktree.sessions.resetRenderers` | safe | n/a | reversible (just re-renders) | one worktree | D0 | Leave | — |
| `worktree.sessions.closeCompleted` | safe | n/a | local-irreversible (trashed terminals lose scrollback) | one worktree | D0 | Leave — only targets completed/exited terminals | — |
| `worktree.sessions.trashAll` | **confirm** (updated #7881) | none in current call sites | local-irreversible (scrollback lost; trashed) | one worktree | D1 | Wire `ConfirmDialog` at the call site (worktree card menu) | TBD |
| `worktree.sessions.endAll` | confirm | yes (`useWorktreeActions.ts:130-148`) | local-irreversible | one worktree | D1 | Leave — current pattern is the model for D1 confirms | — |

### Terminal lifecycle

| Action / call site | Current | UI confirm | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `terminal.close` / `terminal.trash` | safe | n/a | reversible (restore from trash before next gc) | one terminal | D0 | Leave | — |
| `terminal.background` | safe | n/a | reversible (foreground / focus) | one terminal | D0 | Leave | — |
| `terminal.kill` | safe | none (single-terminal kill from context menu / keybinding) | local-irreversible (PTY killed, scrollback lost) | one terminal | D1 | Add confirm when terminal has an agent session attached; bare PTY can stay D0 | TBD |
| `terminal.killAll` | safe | none | local-irreversible | every non-ephemeral terminal | D1 | Add confirm (label includes terminal count) | TBD |
| `terminal.closeAll` | safe | none | reversible (trash, not kill) | every active-worktree terminal | D0 | Leave | — |
| `terminal.restart` / `terminal.restartAll` | safe | n/a | local-irreversible (scrollback lost; process re-spawned) | one / many terminals | D1 (when agent present) | Add confirm for terminals with running agent sessions | TBD |
| `terminal.restartService` | safe | n/a | local-irreversible (all PTY processes restart) | every terminal in the window | D1 | Action is gated on `backendStatus === "disconnected"`; the gate already implies an error state, so leave as-is | — |

### Fleet operations

| Action / call site | Current | UI confirm | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fleet.accept` | safe | n/a (sends affirmative to a prompt) | local-irreversible per prompt | armed waiting agents | D0 | Leave — affirmative response to an already-displayed prompt | — |
| `fleet.reject` | safe | conditional confirm in `run()` body when 5+ targets | local-irreversible per prompt | armed waiting agents | D0 | Leave — internal confirm is sufficient; `n\r` is the safe default | — |
| `fleet.interrupt` | safe | conditional confirm in `run()` body when 3+ targets | local-recoverable (re-arm/continue) | armed working agents | D0 | Leave | — |
| `fleet.restart` | **confirm** (updated #7881) | yes (internal confirm via `useFleetPendingActionStore`) | local-irreversible (scrollback + session lost) | armed agents | D1 | Leave — internal confirm pattern is the canonical example for actions that aren't surfaced via `danger`-driven gates | — |
| `fleet.kill` | **confirm** (updated #7881) | yes (internal confirm) | local-irreversible | armed terminals | D1 | Leave | — |
| `fleet.trash` | **confirm** (updated #7881) | yes (internal confirm; threshold 5+) | local-irreversible (scrollback lost) | armed terminals | D1 | Leave; consider lowering threshold to 3+ in a follow-up | TBD |
| `fleet.armMatchingFilter` / `fleet.armFocused` / `fleet.armAll` | safe | n/a | reversible (disarm) | armed set | D0 | Leave | — |
| `fleet.saveNamedFleet` | safe | n/a | reversible (delete fleet) | one saved fleet | D0 | Leave | — |
| `fleet.recallNamedFleet` | safe | n/a | reversible (re-arm) | armed set | D0 | Leave | — |
| `fleet.deleteNamedFleet` | safe | none | local-irreversible (settings entry gone) | one saved fleet | D1 | Add confirm at the SavedFleetsSection delete button | TBD |
| `fleet.retryFailures` | safe | n/a | local-undo (just re-fires the last broadcast) | failed broadcast targets | D0 | Leave | — |

### Project / window

| Action / call site | Current | UI confirm | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `project.add` / `project.cloneRepo` / `project.openDialog` | safe | n/a | reversible | one project | D0 | Leave | — |
| `project.switch` / `project.switcherPalette` | safe | n/a | reversible (switch back) | one project | D0 | Leave | — |
| `project.update` / `project.saveSettings` | safe | n/a | reversible (re-edit) | one project | D0 | Leave | — |
| `project.remove` | safe | depends on call site | local-irreversible (removed from list; worktrees on disk remain) | one project | D1 | Wire `ConfirmDialog` at every call site; promote definition to `danger:"confirm"` once call sites are updated | TBD |
| `project.close` / `project.closeActive` | safe | yes — `callbacks.onConfirmCloseActiveProject` routes through a confirm flow | local-irreversible (terminals killed) | one project | D1 | Leave — confirm flow already exists | — |
| `window.close` | safe | OS-native warning when unsaved work present | local-irreversible (window state lost) | one window | D0 | Leave — OS provides confirm | — |
| `window.forceReload` | safe | n/a | local-irreversible (in-flight UI state lost) | one window | D0 | Acceptable: developer affordance; would only escalate if discoverable from non-dev menus | — |

### GitHub-side

The current GitHub action set is read-only (`openIssues`, `listPullRequests`, etc.) plus token management. No PR merge, no issue close, no comment-post is wired through `ActionService` yet.

| Action / call site | Current | UI confirm | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `github.setToken` / `github.clearToken` | safe | n/a | reversible (re-enter) | local credential | D0 | Leave | — |
| `github.openIssue` / `github.openPR` / `github.openCommits` / list / get queries | safe | n/a | reversible (navigation only) | navigation | D0 | Leave | — |
| Merge PR / close issue / dismiss review (future) | n/a — not yet exposed via UI | n/a | shared-state | one PR or issue on origin | D2 | When wired, must be `danger:"confirm"` from day one and ship with target-naming preview | open as needed |

### Recipes / plugins

| Action / call site | Current | UI confirm | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `recipe.run` | safe | n/a | local-irreversible (spawns processes; not a content mutation) | one recipe → many terminals | D0 | Leave | — |
| `recipe.editor.open` / `recipe.manager.open` | safe | n/a | reversible | UI | D0 | Leave | — |
| `recipe.saveToRepo` (with `deleteOriginal: true`) | safe | yes (`RecipeManager.tsx` ConfirmDialog) | local-irreversible (original deleted) | one recipe | D1 | Leave — current pattern is correct | — |
| Recipe delete (UI-level only, via `RecipeManager`) | n/a — not an action ID | yes (`ConfirmDialog`) | local-irreversible | one recipe | D1 | Leave; consider promoting to a `recipe.delete` action ID | TBD |
| Plugin install / uninstall (future) | n/a — not yet wired | n/a | shared-state (filesystem + plugin host restart) | one plugin | D1 | When wired, `danger:"confirm"` + show plugin metadata before install/uninstall | open as needed |

### Portal / browser

| Action / call site | Current | UI confirm | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `portal.links.add` / `update` / `toggle` / `reorder` | safe | n/a | reversible | one link | D0 | Leave | — |
| `portal.links.remove` | safe | none | local-irreversible (link gone) | one link | D1 | Add confirm at the SettingsPanel delete control | TBD |
| `portal.closeTab` / `closeOthers` / `closeToRight` / `closeAllTabs` | safe | none | local-irreversible (tab history lost) | 1..N tabs | D0 (single) → D1 (bulk) | Add confirm for `closeAllTabs` and `closeOthers` when 3+ tabs would close | TBD |
| `portal.duplicateTab` / `reload` / `goBack` / `goForward` | safe | n/a | reversible | one tab | D0 | Leave | — |

### Keybindings / preferences

| Action / call site | Current | UI confirm | Reversibility | Blast | Tier | Recommendation | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `keybinding.setOverride` / `removeOverride` | safe | n/a | reversible (reset to default) | one binding | D0 | Leave | — |
| `keybinding.resetAll` | safe | depends on call site | local-irreversible (all overrides lost) | every override | D1 | Wire `ConfirmDialog` at the Settings call site; promote definition to `danger:"confirm"` once wired | TBD |

## Known bypasses

Direct `window.electron.*` IPC calls that skip `ActionService`. These are the highest-risk locations because the action's `danger` rating cannot gate them — the confirmation must live in the component itself.

| File | Operation | Has UI confirm? |
| --- | --- | --- |
| `src/components/Worktree/WorktreeCard.tsx` | `git.snapshotRevert` (context menu) | **No** — context menu invokes directly |
| `src/components/Worktree/ReviewHub/ReviewHubContent.tsx` | `stageAll`, `unstageAll`, `stageFile`, `commit` block | Authored-message gate on commit; no top-level dialog |
| `src/components/Worktree/ReviewHub/ReviewHubContent.tsx` | `handleCommitAndPush` (bundled `commit` + `push`) | **Yes** — `CommitPanel` push confirm with branch pill + commit message preview + per-worktree opt-out (#8025); only user-initiated remote push path |
| `src/components/Worktree/ReviewHub/ReviewHubContent.tsx` | `pullRebase` | **No** |
| `src/components/Worktree/ReviewHub/ReviewHubContent.tsx` | `checkoutOursTheirs` | **No** |
| `src/components/Worktree/ReviewHub/ForcePushConfirmDialog.tsx` | `forcePushWithLease` | **Yes** — model implementation |

## Maintenance

- This document is the source of truth for which actions are considered destructive and what tier they belong to. Updates are part of any PR that adds a new destructive action, changes an `ActionDanger` value, or wires a new `ConfirmDialog`.
- When filing follow-up issues, link them in the **Follow-up** column. Closed follow-ups can be replaced with the merge commit SHA.
- Regression guard: `src/services/actions/__tests__/actionDefinitions.quality.test.ts` asserts that the actions listed in the test's `EXPECTED_CONFIRM_DANGER` set carry `danger:"confirm"`. Adding a new destructive action means updating that set and updating this table.
- Cross-reference: CLAUDE.md "Destructive Action Tiers" rule carries the abbreviated rubric; this document carries the full inventory.
