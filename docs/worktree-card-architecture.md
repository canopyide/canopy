# WorktreeCard Information Architecture

## Overview

The `WorktreeCard` is the primary visual representation of a Git worktree in the Canopy sidebar. It serves as a **contextual dashboard** that answers three fundamental questions at a glance:

1. **What branch is this, and how active is it?** (Identity + Recency)
2. **What's happening here right now?** (Dynamic Activity)
3. **What's connected to this work?** (Meta: agents, terminals, GitHub links)

The card adapts its display based on the worktree's current state, showing different information for dirty worktrees (uncommitted changes), clean feature branches, and the main/master branch.

---

## Component Hierarchy

```
WorktreeCard
├── BranchLabel          # Styled branch name with prefix highlighting
├── ActivityLight        # Color-fading dot indicating recency
├── LiveTimeAgo          # Live-updating relative timestamp
├── FileChangeList       # List of changed files with diff stats
├── TerminalCountBadge   # Terminal/agent session summary
├── AgentStatusIndicator # Dominant agent state icon
├── WorktreeDetails      # Expanded details panel
│   ├── AI Note display
│   ├── Last commit message
│   ├── Controls (dev server, terminals)
│   ├── Error banners
│   ├── Full file change list
│   └── Folder path
└── ConfirmDialog        # Confirmation for destructive actions
```

---

## Data Model

### WorktreeState (Input)

The card receives a `WorktreeState` object containing:

| Field                   | Type                              | Description                                                  |
| ----------------------- | --------------------------------- | ------------------------------------------------------------ |
| `id`                    | `string`                          | Stable identifier (normalized path)                          |
| `path`                  | `string`                          | Absolute filesystem path                                     |
| `name`                  | `string`                          | Human-readable name (branch or folder name)                  |
| `branch`                | `string?`                         | Git branch name (undefined for detached HEAD)                |
| `isCurrent`             | `boolean`                         | Whether this worktree contains the current working directory |
| `isMainWorktree`        | `boolean?`                        | Whether this is the primary worktree (not a linked worktree) |
| `summary`               | `string?`                         | Work summary (often the last commit message)                 |
| `lastActivityTimestamp` | `number \| null`                  | Milliseconds since epoch of last meaningful activity         |
| `aiNote`                | `string?`                         | Content from `.git/canopy/note` file                         |
| `aiNoteTimestamp`       | `number?`                         | When the AI note was last modified                           |
| `issueNumber`           | `number?`                         | Extracted GitHub issue number from branch name               |
| `prNumber`              | `number?`                         | Linked GitHub pull request number                            |
| `prUrl`                 | `string?`                         | GitHub PR URL                                                |
| `prState`               | `'open' \| 'merged' \| 'closed'?` | PR lifecycle state                                           |
| `worktreeChanges`       | `WorktreeChanges \| null`         | Aggregated git status information                            |

### WorktreeChanges (Nested)

| Field               | Type                 | Description                                 |
| ------------------- | -------------------- | ------------------------------------------- |
| `rootPath`          | `string`             | Worktree root for relative path calculation |
| `changes`           | `FileChangeDetail[]` | Individual file changes                     |
| `changedFileCount`  | `number`             | Total count of changed files                |
| `insertions`        | `number?`            | Total lines added                           |
| `deletions`         | `number?`            | Total lines removed                         |
| `lastCommitMessage` | `string?`            | Most recent commit message                  |

### FileChangeDetail

| Field        | Type             | Description                                                                 |
| ------------ | ---------------- | --------------------------------------------------------------------------- |
| `path`       | `string`         | Relative file path                                                          |
| `status`     | `GitStatus`      | `modified`, `added`, `deleted`, `untracked`, `renamed`, `copied`, `ignored` |
| `insertions` | `number \| null` | Lines added in this file                                                    |
| `deletions`  | `number \| null` | Lines removed in this file                                                  |
| `mtimeMs`    | `number?`        | File modification time (for recency sorting)                                |

---

## Grid Layout Structure

The card uses a CSS Grid with dynamic columns:

```
gridTemplateColumns: hasExpandableContent ? "16px 1fr" : "0px 1fr"
columnGap: 14px
rowGap: 4px
```

When there's no expandable content, the gutter collapses to bring content flush left.

### Row Structure

| Row             | Left Column (16px)        | Right Column (1fr)                              |
| --------------- | ------------------------- | ----------------------------------------------- |
| **1: Identity** | Chevron (expand/collapse) | Branch label + Activity light + Time + Actions  |
| **2: Dynamic**  | Empty                     | Scenario-specific content                       |
| **3: Expanded** | Empty                     | `WorktreeDetails` (animated)                    |
| **4: Footer**   | Empty                     | Agent status + Terminal count + Issue/PR badges |

---

## Row 1: Identity Layer

**Purpose:** Answer "What branch is this and how hot is it?"

### Components

1. **Chevron Button** (left gutter)
   - Only rendered if `hasExpandableContent` is true
   - Toggles expanded/collapsed state
   - `ChevronRight` when collapsed, `ChevronDown` when expanded
   - ARIA attributes: `aria-expanded`, `aria-controls`

2. **Shield Icon** (optional)
   - Displayed only for main/master branches
   - Muted gray with 30% opacity
   - Indicates protected/primary branch

3. **BranchLabel**
   - Splits branch name on first `/` into prefix and rest
   - **Prefix styling:** Rendered as a subtle pill (not inline uppercase text):
     - `10px` text in sentence case ("Feature", "Fix", "Docs")
     - Rounded pill with colored background/border (e.g., `bg-teal-500/10`, `border-teal-500/30`)
     - Color mapping:
       - `feature`/`feat` → teal
       - `bugfix`/`hotfix`/`fix` → red
       - `chore` → gray
       - `docs` → blue
       - `refactor` → purple
       - `test` → yellow
     - Unknown prefixes show raw branch name without pill
   - **Branch name:** `13px`, semibold, truncated with `middleTruncate(36)`
   - Main branches get bold + tracking-wide

4. **Detached Badge**
   - Shown when `worktree.branch` is undefined
   - Amber text: "(detached)"

5. **Recency Chip** (right side, unified ActivityLight + LiveTimeAgo)
   - Wrapped in a subtle pill (`bg-white/[0.03]`, `rounded-full`) for visual cohesion
   - **ActivityLight:** 2.5×2.5 pixel rounded dot
     - Color fades from green → gray over 90 seconds
     - Hidden when no activity timestamp (shows "Never" text only)
   - **LiveTimeAgo:** Updates every 1 second
     - Format: `now`, `Xs`, `Xm`, `Xh`, `Xd`, `Xw`, `Xmo`, `Xy`
     - Shows "Never" when no timestamp
   - Tooltip shows full timestamp + human-readable duration

6. **Action Buttons** (hover overlay)
   - Gradient fade from transparent → background color
   - **Copy Context button:** Copies directory tree for AI context
   - **More menu (...):**
     - Copy Context
     - Open in Editor
     - Reveal in Finder
     - (separator if issue/PR exists)
     - Open Issue #N
     - Open PR #N
     - (separator if recipes exist)
     - Recipes section with runnable items
     - Create Recipe...
     - (separator if terminals exist)
     - Sessions management:
       - Close Completed (N)
       - Close Failed (N)
       - Close All... (destructive, requires confirmation)

---

## Row 2: Dynamic Activity Layer

**Purpose:** Answer "What's actually going on here?"

This row is **polymorphic** — its content changes based on the `workspaceScenario`:

### Scenario Detection

```typescript
const workspaceScenario = useMemo(() => {
  if (hasChanges) return "dirty";
  if (isMainWorktree) return "clean-main";
  return "clean-feature";
}, [hasChanges, isMainWorktree]);
```

### Scenario: Dirty (Uncommitted Changes)

Displayed when `worktreeChanges.changedFileCount > 0`:

1. **Diff Summary Pill**
   - Wrapped in subtle pill styling (`bg-white/[0.02]`, `border border-white/5`, `rounded`)
   - Format: `{N} file(s)` + optional `· +{insertions}` / `-{deletions}`
   - Monospace, `11px`
   - **Smart display:** Only shows stats that are non-zero
     - Only additions: `3 files · +12`
     - Only deletions: `2 files · -8`
     - Mixed: `5 files · +20 / -3`
   - Insertions in green, deletions in red

2. **FileChangeList** (top 3 files)
   - Sorted by churn (insertions + deletions), then by status priority
   - Each file shows:
     - Status letter (M/A/D/?/R/C/I) with color coding
     - Path with directory truncated from start: `…/Worktree/LiveTimeAgo.tsx`
     - Filename is protected (never truncated)
     - Inline stats: `+N` / `-N`
   - Clicking a file opens a diff modal

3. **Summary** (if different from last commit)
   - Muted gray, truncated
   - Deduplication logic compares against `lastCommitMessage`

### Scenario: Clean Feature Branch

Displayed for non-main branches with no changes:

1. **AI Note** (preferred)
   - Shown if `effectiveNote` exists
   - Truncated to single line

2. **Last Commit Message** (fallback)
   - GitCommit icon + first line of commit message
   - Muted styling, 80% opacity

### Scenario: Clean Main Branch

Displayed for main/master branches with no changes:

**Same as clean feature branches** — shows last commit message with optional compact status indicators:

1. **Last Commit Message** (primary content)
   - GitCommit icon + first line of commit message
   - Muted styling, 80% opacity
   - Answers "What is main currently at?"

2. **Server Indicator** (only when running)
   - Displays `:5173` (port) with green accent badge
   - Hidden when stopped/starting
   - Terminal count is not shown here (already in pinned meta footer)

3. **AI Note** (fallback if no commit message)
   - Shown if `effectiveNote` exists and no commit message

---

## Row 3: Expanded Details

**Purpose:** Show full context when the user wants to dive deeper.

The `WorktreeDetails` component is revealed with a max-height animation (300ms ease-out):

### Zones

1. **Context & Narrative Zone**
   - AI note in yellow-tinted box with left border
   - Links are parsed and made clickable
   - Last commit message in muted italic style

2. **Operational Controls Zone** ("The Cockpit")
   - Labeled "Controls" header
   - **Dev Server control:**
     - Status indicator: ○ (stopped), ◐ (starting), ● (running/error)
     - URL display when running
     - Start/Stop button with loading state
   - **Terminal summary:**
     - Total count + working count with pulsing indicator

3. **Error Zone**
   - Up to 3 error banners (compact mode)
   - Each has dismiss and retry actions
   - "+N more errors" indicator if truncated

4. **Changed Files Zone**
   - Labeled "Changed Files" header
   - Full `FileChangeList` with up to 8 visible files
   - Same sorting and display as collapsed view

5. **Path Zone**
   - Bottom border separator
   - Clickable filesystem path (reveals in Finder)
   - Underlined when focused

---

## Row 4: Pinned Meta Footer

**Purpose:** Answer "What's connected to this work?"

Only rendered when `showMetaFooter` is true:

```typescript
const showMetaFooter =
  !!dominantAgentState || terminalCounts.total > 0 || !!worktree.issueNumber || !!worktree.prNumber;
```

### Layout

Left side:

- **AgentStatusIndicator:** Shows dominant state across all terminals
  - Working: spinning icon
  - Completed: green checkmark
  - Failed: red X
  - Idle/Waiting: hidden
- **TerminalCountBadge:** Summarizes session states
  - Format: `{N} running · {M} done · {P} error`
  - Falls back to: `{N} terminal(s)`

Right side:

- **Issue Badge:** Blue, shows `#{issueNumber}`, opens GitHub
- **PR Badge:** State-colored, shows `#{prNumber}`, opens GitHub
  - `open` → green (`bg-green-500/10`, `text-green-400`)
  - `merged` → purple (`bg-purple-500/10`, `text-purple-400`)
  - `closed` → red (`bg-red-500/10`, `text-red-400`)
  - Tooltip shows state: "PR #123 · merged"

---

## Visual States

### Selection States

| State                 | Background     | Ring                      | Accent                            |
| --------------------- | -------------- | ------------------------- | --------------------------------- |
| Default               | `transparent`  | none                      | none                              |
| Hover                 | `white/[0.02]` | none                      | none                              |
| Active (selected)     | `white/[0.04]` | none                      | none                              |
| Focused (keyboard)    | current bg     | `ring-[#10b981]/50` inset | none                              |
| Current (working dir) | current bg     | none                      | `border-l-2 border-l-teal-500/50` |

### Current Worktree Accent

The worktree containing the current working directory (`worktree.isCurrent === true`) displays a persistent 2px teal accent bar on the left edge. This helps answer "where am I actually working?" vs "which card is selected for keybindings?"

### AI Note TTL

For main/master branches, AI notes expire after 10 minutes:

```typescript
const MAIN_WORKTREE_NOTE_TTL_MS = 10 * 60 * 1000;
```

This prevents stale "agent is working" messages from lingering on the main branch.

---

## Derived State Logic

### hasExpandableContent

True if any of:

- Has uncommitted changes
- Has an AI note (effectiveNote)
- Has a summary different from commit message
- Dev server is enabled and has a script
- Has errors
- Has terminals
- Has a last commit message

### showFooter (internal)

True if any of:

- Has terminals
- Has changes with worktreeChanges data
- Dev server is running/not-stopped
- Has errors

### effectiveNote

AI note with special handling:

1. Trimmed for whitespace
2. Expires after 10 minutes on main/master branches
3. Returns undefined if empty or expired

### effectiveSummary

Worktree summary with deduplication:

- Compares against last commit message (case-insensitive)
- Returns null if summary equals, contains, or is contained by commit message
- Prevents redundant display of same information

---

## Accessibility

- Card is focusable (`tabIndex={0}`)
- Card has `role="button"` with `aria-label`
- Chevron has `aria-expanded` and `aria-controls`
- ActivityLight has `role="status"` and `aria-label`
- LiveTimeAgo has `aria-label` with full text
- All interactive elements have proper focus states

---

## Performance Considerations

1. **Selective re-renders:** Uses `useShallow` for error store subscription
2. **Memoized calculations:** `workspaceScenario`, `effectiveNote`, `effectiveSummary`, `detailsId`
3. **Callback memoization:** All event handlers use `useCallback`
4. **Conditional rendering:** Footer and expanded details only mount when needed
5. **Animation via CSS:** `max-height` transition instead of JS animation

---

## File Dependencies

```
WorktreeCard.tsx
├── ./ActivityLight.tsx
├── ./AgentStatusIndicator.tsx
├── ./BranchLabel.tsx
├── ./FileChangeList.tsx
│   └── ./FileDiffModal.tsx
├── ./LiveTimeAgo.tsx
├── ./TerminalCountBadge.tsx
├── ./WorktreeDetails.tsx
│   └── ../Errors/ErrorBanner.tsx
├── ../Terminal/ConfirmDialog.tsx
├── ../ui/dropdown-menu.tsx
├── ../../hooks/useDevServer.ts
├── ../../hooks/useWorktreeTerminals.ts
├── ../../store/index.ts (errorStore, terminalStore)
├── ../../store/recipeStore.ts
├── ../../store/worktreeStore.ts
└── @/clients (systemClient, errorsClient)
```

---

## Design Principles

1. **Information Hierarchy:** Most important info (branch, recency) at top; details on demand
2. **Polymorphic Display:** Content adapts to worktree state rather than showing empty sections
3. **Stable Anchors:** Issue/PR badges in footer don't move during expand/collapse
4. **Progressive Disclosure:** Collapsed view shows essence; expanded view shows full context
5. **Actionable at a Glance:** File changes are clickable, badges open GitHub, paths reveal in Finder
6. **Live Updates:** Activity light fades, time updates, terminal counts refresh automatically
