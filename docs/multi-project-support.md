# Multi-Project Support

**Status:** Implemented
**Last Updated:** 2025-11-29

## Overview

Multi-Project Support enables Canopy Command Center to manage multiple Git repositories simultaneously, with rapid switching between projects while preserving terminal sessions, worktree states, and UI layouts per project.

This feature is fully implemented and available in the current version.

## Goals

1. **Rapid Project Switching** - Switch between projects with a keyboard shortcut or single click
2. **State Preservation** - Each project remembers its terminals, active worktree, and layout
3. **Project Identity** - User-editable names and emojis for quick visual identification
4. **Terminal Persistence** - Option to keep terminals running in background when switching (advanced)

## Current State

The app currently operates on a **single repository** model:

- `appState.lastDirectory` stores the last opened directory
- Terminals are persisted globally, not per-project
- No concept of "projects" - everything is worktree-centric within one repo

**Related existing issue:** [#50 - Add recent directories picker on app launch](https://github.com/gregpriday/canopy-electron/issues/50)

## How to Use

### Accessing the Project Switcher

The **Project Switcher** is located in the top-left corner of the toolbar, displayed as a clickable button showing the current project's emoji and name (e.g., "🌲 canopy-app").

**To open the Project Switcher:**

- Click the project name button in the toolbar, OR
- Use the keyboard shortcut: **Cmd+Shift+O** (macOS) / **Ctrl+Shift+O** (Windows/Linux)

### Adding a New Project

1. Open the Project Switcher (Cmd+Shift+O)
2. Click the **[+ Add Project]** button at the bottom of the dropdown
3. Select a directory in the file picker dialog
4. Canopy will detect the Git repository root and add it to your project list
5. The project will be assigned an AI-generated name and emoji (if OpenAI API key is configured), or use the folder name and a default 🌲 emoji

### Switching Between Projects

1. Open the Project Switcher (Cmd+Shift+O)
2. Click on any project in the list to switch to it
3. Projects are sorted by most recently opened
4. The active project is indicated with a checkmark (✓)

**What happens when you switch:**

- Current project state is automatically saved (terminals, active worktree, sidebar width)
- Worktree monitoring stops for the old project
- The new project's state is loaded and restored
- Worktree monitoring begins for the new project
- Your terminal layout and active worktree selection are restored exactly as you left them

### Editing Project Details

1. Open the Project Switcher
2. Click the **pencil icon (✏️)** next to a project
3. In the dialog, you can:
   - Change the project **name**
   - Select a different **emoji**
   - View the Git repository path (read-only)
4. Click **Save** to apply changes

### Removing a Project

1. Open the Project Switcher
2. Click the **trash icon (🗑️)** next to a project
3. Confirm the removal
4. The project is removed from the list (your actual files are not deleted)
5. All saved state for that project (terminals, layout) is also removed

### Project State Persistence

Each project remembers:

- **Active worktree**: Which worktree was selected in the sidebar
- **Terminal sessions**: All open terminals with their type (shell, Claude, Gemini), working directories, and titles
- **Terminal layout**: Grid positions and sizes
- **Sidebar width**: Your preferred sidebar size

**Storage location:** `~/.config/canopy/projects/<project-id>/`

- `state.json` - Terminal layout and active worktree
- `settings.json` - Project-specific settings (run commands, environment variables)

### AI-Generated Project Identity

If you have configured an OpenAI API key in Settings:

- New projects automatically get an AI-generated name and emoji based on their code content
- The AI analyzes the repository structure to suggest a relevant name and emoji
- You can always override these with custom values using the project edit dialog

## Architecture

### Data Model

```typescript
interface Project {
  id: string; // UUID or path hash
  path: string; // Git repository root path
  name: string; // User-editable display name
  emoji: string; // User-editable emoji (default: 🌲)
  aiGeneratedName?: string; // AI-suggested name (from folder)
  aiGeneratedEmoji?: string; // AI-suggested emoji
  lastOpened: number; // Timestamp for sorting
  color?: string; // Theme color/gradient (optional)
}

interface ProjectState {
  projectId: string;
  activeWorktreeId?: string;
  sidebarWidth: number;
  terminals: TerminalSnapshot[];
  terminalLayout?: TerminalLayout;
}

interface TerminalSnapshot {
  id: string;
  type: "shell" | "claude" | "gemini" | "custom";
  title: string;
  cwd: string;
  worktreeId?: string;
}
```

### Storage Structure

```
~/.config/canopy/
├── projects.json           # List of all projects
├── identity-cache.json     # AI-generated names/emojis (from CLI)
└── projects/
    ├── <project-id-1>/
    │   └── state.json      # Terminal layout, active worktree
    └── <project-id-2>/
        └── state.json
```

### Project Switching Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    PROJECT SWITCH FLOW                       │
└─────────────────────────────────────────────────────────────┘

1. User triggers switch (Cmd+Shift+O, menu, or UI)
                    │
                    ▼
2. Save current project state
   ├── Capture terminal list (IDs, types, cwds, titles)
   ├── Capture terminal layout (grid positions)
   ├── Capture active worktree ID
   └── Save to ~/.config/canopy/projects/<id>/state.json
                    │
                    ▼
3. Tear down current session
   ├── Kill PTY processes (or hibernate - see below)
   ├── Stop worktree monitoring
   ├── Clear dev server tracking
   └── Clear terminal store
                    │
                    ▼
4. Load new project
   ├── Update currentProjectId
   ├── Load project state from disk
   └── Start worktree monitoring for new repository
                    │
                    ▼
5. Restore new project session
   ├── Spawn terminals from saved snapshots
   ├── Restore terminal layout
   └── Set active worktree
```

### Terminal Hibernation (Advanced Feature)

Three approaches for handling terminals during project switch:

| Approach           | Complexity | Pros                | Cons                                    |
| ------------------ | ---------- | ------------------- | --------------------------------------- |
| **Kill & Respawn** | Low        | Simple, low memory  | Loses running processes, scroll history |
| **Hibernate**      | High       | Agents keep running | Memory grows, complex state             |
| **Hybrid**         | Medium     | User choice         | UI complexity                           |

**Recommendation:** Start with Kill & Respawn, add hibernation later if needed.

## UI Components

### Project Switcher

```
┌────────────────────────────────────────────┐
│ 🌲 Canopy App                    [+ Add]   │
│ ────────────────────────────────────────── │
│ 🚀 Frontend Monorepo         ← active      │
│    ~/Projects/frontend-mono                │
│    3 worktrees • Last: 2h ago              │
│                                            │
│ 🎨 Design System                           │
│    ~/Projects/design-system                │
│    1 worktree • Last: 1d ago               │
│                                            │
│ 🔧 Backend API                             │
│    ~/Projects/api                          │
│    5 worktrees • Last: 30m ago             │
│                                            │
│ [Open Other...]                            │
└────────────────────────────────────────────┘
```

**Placement options:**

- Sidebar header (click project name to open switcher)
- Command palette (`Cmd+Shift+O`)
- Dedicated project bar above main toolbar

### Project Edit Dialog

- Name input field
- Emoji picker
- Remove from list button
- Reveal in Finder/Explorer

## Services

### ProjectStore (New)

```typescript
class ProjectStore {
  // CRUD operations
  addProject(path: string): Promise<Project>;
  removeProject(id: string): Promise<void>;
  updateProject(id: string, updates: Partial<Project>): Promise<void>;

  // Queries
  getAllProjects(): Promise<Project[]>;
  getProjectByPath(path: string): Promise<Project | null>;

  // State management
  saveProjectState(projectId: string, state: ProjectState): Promise<void>;
  getProjectState(projectId: string): Promise<ProjectState | null>;

  // Current project
  getCurrentProjectId(): string | null;
  setCurrentProject(projectId: string): Promise<void>;
}
```

### ProjectIdentityService (Port from CLI)

The original Canopy CLI generates project names and emojis using AI:

- Source: `/Users/gpriday/Projects/CopyTree/canopy/src/services/ai/identity.ts`
- Cache: `~/.config/canopy/identity-cache.json`

```typescript
class ProjectIdentityService {
  async generateIdentity(folderPath: string): Promise<{
    name: string;
    emoji: string;
    gradient?: string;
  }>;

  getCachedIdentity(path: string): CachedIdentity | null;
  cacheIdentity(path: string, identity: CachedIdentity): void;
}
```

### WorktreeService Modifications

The WorktreeService needs reset capability:

```typescript
class WorktreeService {
  // New methods for project switching
  async reset(): Promise<void>; // Stop all monitors, clear state
  async initialize(rootPath: string): Promise<void>; // Start fresh
}
```

## IPC Bridge Extensions

```typescript
// Add to window.electron in preload.ts
project: {
  getAll(): Promise<Project[]>;
  getCurrent(): Promise<Project | null>;
  switch(projectId: string): Promise<void>;
  add(path: string): Promise<Project>;
  update(id: string, updates: Partial<Project>): Promise<void>;
  remove(id: string): Promise<void>;
  openDialog(): Promise<string | null>;
  onSwitch(callback: (project: Project) => void): () => void;
}
```

## Implementation Status

All core phases are complete. Terminal hibernation (Phase 6) is not implemented, as the simpler "Kill & Respawn" approach was chosen for the initial release.

### Phase 1: Foundation ✅ Completed

**Status:** Implemented

- ✅ Project model with `ProjectStore` service (`electron/services/ProjectStore.ts`)
- ✅ IPC handlers for project CRUD operations
- ✅ Migration from simple directories to full project model
- ✅ Storage at `~/.config/canopy/projects/`

### Phase 2: Project Model ✅ Completed

**Status:** Implemented

- ✅ `Project` type definition in `electron/types/index.ts`
- ✅ `ProjectStore` service with CRUD operations
- ✅ Project persistence with electron-store
- ✅ Atomic file writes for state/settings

### Phase 3: Project Switcher UI ✅ Completed

**Status:** Implemented

- ✅ `ProjectSwitcher` component in toolbar (`src/components/Project/ProjectSwitcher.tsx`)
- ✅ Dropdown interface with project list
- ✅ Add/Edit/Remove project UI
- ✅ Keyboard shortcut: **Cmd+Shift+O**

### Phase 4: State Snapshotting ✅ Completed

**Status:** Implemented

- ✅ `ProjectState` type for terminal layout and active worktree
- ✅ Automatic state saving on project switch
- ✅ State restoration when returning to project
- ✅ Per-project settings (run commands, environment variables)

### Phase 5: Project Identity ✅ Completed

**Status:** Implemented

- ✅ AI-generated project names and emojis (`electron/services/ai/identity.ts`)
- ✅ Project edit dialog with emoji picker (`src/components/Project/ProjectSettingsDialog.tsx`)
- ✅ Fallback to folder name when AI is unavailable
- ✅ Cached identity to avoid redundant API calls

### Phase 6: Terminal Hibernation ❌ Not Implemented

**Status:** Deferred

The simpler "Kill & Respawn" approach is used instead:

- Terminals are killed when switching projects
- Terminal state (cwd, title, type) is saved
- New terminal processes are spawned when returning to a project
- This keeps memory usage low and avoids complex state management

**Future consideration:** If users request terminal persistence across switches, hibernation could be added as an opt-in feature.

## Dependency Graph

```
                    ┌─────────────┐
                    │   Start     │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Phase 1    │  Recent Directories (#50)
                    │ Foundation  │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Phase 2    │  Project Model
                    │   Model     │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       ┌───────────┐ ┌───────────┐ ┌───────────┐
       │  Phase 3  │ │  Phase 4  │ │  Phase 5  │
       │ Switcher  │ │   State   │ │ Identity  │
       │    UI     │ │ Snapshot  │ │           │
       └───────────┘ └─────┬─────┘ └───────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Phase 6    │  Terminal Hibernation
                    │  (Optional) │
                    └─────────────┘
```

## Files to Create

| File                                           | Purpose                           |
| ---------------------------------------------- | --------------------------------- |
| `electron/services/ProjectStore.ts`            | Project CRUD and state management |
| `electron/services/ProjectIdentityService.ts`  | AI name/emoji generation          |
| `src/components/Project/ProjectSwitcher.tsx`   | Project switching UI              |
| `src/components/Project/ProjectCard.tsx`       | Individual project display        |
| `src/components/Project/ProjectEditDialog.tsx` | Edit name/emoji                   |
| `src/hooks/useProjects.ts`                     | React hook for project state      |
| `src/store/projectStore.ts`                    | Zustand store for current project |

## Files to Modify

| File                                   | Changes                                |
| -------------------------------------- | -------------------------------------- |
| `electron/store.ts`                    | Add projects array, current project ID |
| `electron/preload.ts`                  | Add project IPC bridge                 |
| `electron/ipc/handlers.ts`             | Add project handlers                   |
| `electron/ipc/channels.ts`             | Add project channels                   |
| `electron/main.ts`                     | Add project menu items                 |
| `electron/services/WorktreeService.ts` | Add reset/initialize methods           |
| `src/store/terminalStore.ts`           | Add snapshot/restore methods           |
| `src/App.tsx`                          | Integrate project switching            |
| `src/components/Layout/Sidebar.tsx`    | Add project header                     |

## Complexity Estimates

| Component                   | Complexity | Effort   |
| --------------------------- | ---------- | -------- |
| Phase 1: Foundation         | Low        | 1-2 days |
| Phase 2: Project Model      | Medium     | 2-3 days |
| Phase 3: Switcher UI        | Medium     | 2-3 days |
| Phase 4: State Snapshotting | High       | 3-5 days |
| Phase 5: Project Identity   | Medium     | 2-3 days |
| Phase 6: Hibernation        | Very High  | 5-7 days |

**Total (without hibernation):** 10-16 days
**Total (with hibernation):** 15-23 days

## Related Issues

- [#50 - Add recent directories picker on app launch](https://github.com/gregpriday/canopy-electron/issues/50) - Foundation for project switching
- [#51 - Add user-editable terminal titles](https://github.com/gregpriday/canopy-electron/issues/51) - Terminal identification for snapshots
- [#52 - Add global terminal palette](https://github.com/gregpriday/canopy-electron/issues/52) - Quick terminal access across projects

## References

### Original Canopy CLI Implementation

The original CLI has relevant code for project identity:

- Identity generation: `/Users/gpriday/Projects/CopyTree/canopy/src/services/ai/identity.ts`
- Identity caching: `/Users/gpriday/Projects/CopyTree/canopy/src/services/ai/cache.ts`
- Identity hook: `/Users/gpriday/Projects/CopyTree/canopy/src/hooks/useProjectIdentity.ts`
- Config loading: `/Users/gpriday/Projects/CopyTree/canopy/src/utils/config.ts`

### Electron Store Documentation

- [electron-store](https://github.com/sindresorhus/electron-store) - Used for persistent storage
