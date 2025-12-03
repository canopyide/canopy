# Multi-Project Support

Canopy Command Center supports managing multiple projects simultaneously. You can switch between projects while maintaining isolated state for each.

## Adding Projects

Add a new project to Canopy:

1. Click the project switcher in the toolbar
2. Select "Add Project"
3. Choose a directory containing a Git repository

Canopy will:

- Scan for Git worktrees in the repository
- Generate an AI-powered project identity (if OpenAI is configured)
- Save the project to your workspace

## Switching Projects

Use the project switcher dropdown in the toolbar to switch between projects.

## Project Switching Behavior

When you switch between projects, Canopy performs a **complete state reset** to ensure clean state isolation.

**What gets reset:**

- All terminal sessions are closed
- Diagnostics panels are cleared
- Worktree monitoring restarts
- Event inspector is reset
- Notification history is cleared
- UI state is re-hydrated with new project context

**How it works:**

- Renderer stores are reset synchronously
- Main process switches project context and restarts services
- UI re-hydrates from the new project state
- This ensures no state leakage between projects

**Why a complete reset?**

- Guarantees clean state isolation between projects
- Simplifies implementation (v1.0 approach)
- Prevents subtle bugs from shared state
- Ensures each project starts with a clean slate

**Future enhancement:** A more granular state reset mechanism may be implemented in v2, allowing you to switch projects while preserving certain UI state. For now, the complete reset ensures reliability.

**Tip:** Save any important terminal output or logs before switching projects. Use the session history feature to export terminal transcripts if needed.

## Project State Persistence

Each project maintains its own state:

- Active worktree selection
- Worktree monitoring intervals
- Dev server configurations
- AI summary cache
- GitHub PR associations

State is persisted in Electron's storage and restored when you switch back to a project.

## Removing Projects

To remove a project from Canopy:

1. Open the project switcher
2. Find the project you want to remove
3. Click the remove button

This only removes the project from Canopy's workspace—it does not delete any files from your filesystem.
