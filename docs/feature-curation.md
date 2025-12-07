# Feature Curation Guide

> *"You can do anything, but you cannot do everything."*

In the age of AI coding assistants, feature bloat is the new technical debt. Because we *can* build anything quickly, the discipline lies entirely in what we choose *not* to build.

## What Canopy IS

**Canopy is Mission Control for AI Agents.**

It is where you *direct* work, not necessarily where you *do* the work. It exists to bridge the gap between human intent, codebase context, and agent execution.

**The Metaphor:** If VS Code is the workbench where you craft the part, Canopy is the Air Traffic Control tower where you coordinate the fleet.

**Canopy is NOT an IDE (like VS Code). It is NOT a Terminal (like iTerm). It is a Delegation Layer.**

## Core Pillars

1. **Terminal Grid** - Manage multiple terminal sessions running AI agents in parallel
2. **Worktree Dashboard** - Visual monitoring of git worktrees with real-time status
3. **Agent State Tracking** - Know when agents are working, waiting for you, or completed
4. **Context Injection** - Generate and inject codebase context into agents via CopyTree
5. **Dev Server Management** - Auto-detect and manage dev servers per worktree

**Brand Voice:** "Calm partner" - helpful, not flashy. Reduces cognitive load.

## The Cost of Attention Test

For every feature proposal, ask:

> *Does adding this feature reduce the user's cognitive load by handling a delegation task, or does it increase load by demanding manual interaction?*

If it increases cognitive load or demands manual interaction, **reject it**.

## The Green Light Test

A feature belongs in Canopy **only if it satisfies at least two** of these criteria:

| Criterion | Description |
|-----------|-------------|
| **Accelerates Context Injection** | Makes it faster to feed the "right" files/errors/diffs to an agent |
| **Unblocks the Agent** | Detects when an agent is stuck, waiting, or failed, and helps human intervene quickly |
| **Manages Multiplicity** | Helps manage *multiple* concurrent workstreams that a human brain can't track alone |
| **Bridges the Gap** | Fixes a friction point between the CLI and the GUI |

If a feature doesn't satisfy at least 2 of these, it doesn't belong in Canopy.

## The Red Light Test

Canopy **explicitly rejects** features that:

| Anti-Pattern | Why |
|--------------|-----|
| **Reinvents the Text Editor** | Complex text manipulation, syntax highlighting, linting → Send user to VS Code |
| **Reinvents the Git GUI** | We are not making SourceTree. Git only matters for partitioning work (Worktrees) or providing context (Diffs) |
| **Requires Deep Configuration** | If it needs 10 toggles in settings, it's too complex. Survive on opinionated defaults. |
| **Pure Aesthetic Cruft** | Animations or UI elements that don't convey state information |

**Additional anti-patterns:**
- Simple file operations (use system tools)
- One-off utilities without workflow integration
- Anything easily done with a shell alias
- Features better handled by external tools

## Workshop vs Mission Control

Ask yourself:

> *"Does this feature belong in the Workshop (VS Code) or Mission Control (Canopy)?"*

If the answer is **Workshop**, we don't build the feature. At most, we build a **button that opens the Workshop** to the right place.

## Decision Examples

| Feature Proposal | Decision | Reasoning |
|------------------|----------|-----------|
| Full File Editor | **REJECT** | Workshop feature. VS Code exists. Red Light: reinvents text editor. |
| Agent "Retry" Button | **APPROVE** | Reduces cognitive load. Unblocks agent. Bridges CLI gap. |
| Custom Themes | **REJECT** | Red Light: pure aesthetic cruft. Maintenance burden. |
| Diff Viewer | **APPROVE** | Accelerates context injection. Manager task, not worker task. |
| Integrated Browser | **APPROVE (Limited)** | Only as localhost Sidecar. Bridges gap. We're not building Chrome. |
| Chat History Search | **APPROVE** | Manages multiplicity. Essential for auditing agent work. |
| npm Script Runner | **APPROVE (Simplified)** | Only start/stop. Not editing package.json. Bridges gap. |
| Git Graph/Tree | **REJECT** | Red Light: reinvents Git GUI. Too much visual noise. |
| Syntax Highlighting | **REJECT** | Red Light: reinvents text editor. Workshop feature. |
| Settings with 10 toggles | **REJECT** | Red Light: requires deep configuration. |

## Architectural Requirements

Every feature must follow Canopy's 4-layer pattern:

```
Service → IPC → Store → UI
```

1. **Service** (`electron/services/`) - Business logic, system operations
2. **IPC Handlers** (`electron/ipc/handlers/`) - Bridge main↔renderer
3. **Store** (`src/store/`) - Zustand state management
4. **UI** (`src/components/`) - React components

**Key requirements:**
- Multi-project aware (filters by projectId, handles project switching)
- Event-driven (emits events, doesn't call services directly)
- Type-safe (TypeScript throughout, Zod for IPC validation)
- Resilient (error handling, graceful degradation)

## Solo Developer Survival Rules

These rules protect the maintainer:

1. **No Native Dependencies (Unless Mandatory)** - node-pty is already complex enough. Avoid adding more native modules unless they provide 10x value. They break builds and make cross-platform support a nightmare.

2. **State over Database** - Use the file system (git) as the source of truth whenever possible. Don't sync state that can be derived from the folder structure.

3. **Opinionated Integrations** - Don't try to support every AI tool. Support the CLIs that are installed (Claude, Gemini, Codex) and support them *deeply*.

## Feature Evaluation Checklist

Before implementing any feature, verify:

- [ ] Passes Cost of Attention test (reduces cognitive load)
- [ ] Passes Green Light test (satisfies 2+ criteria)
- [ ] Passes Red Light test (no triggers)
- [ ] Belongs in Mission Control, not Workshop
- [ ] Follows 4-layer architectural pattern
- [ ] Multi-project compatible
- [ ] No new native dependencies
- [ ] No deep configuration required
- [ ] Can't be solved with a shell alias

## Using the Slash Command

For automated evaluation, use:

```
/evaluate-feature <paste your feature proposal here>
```

This command runs a rigorous 5-phase evaluation:
1. **Existence Check** - Does it already exist?
2. **Mission Alignment** - Does it fit Canopy's purpose?
3. **Architectural Fit** - Does it follow patterns?
4. **Implementation Complexity** - What's the effort and risk?
5. **Value Assessment** - Is the value worth the cost?

The command defaults to **NO** and requires features to clearly pass all tests.

## Remember

- Canopy is opinionated. Not every good feature belongs here.
- Feature bloat is the new technical debt.
- Just because we *can* build something doesn't mean we *should*.
- The goal is a focused, cohesive tool for AI agent orchestration, not a general-purpose IDE.
