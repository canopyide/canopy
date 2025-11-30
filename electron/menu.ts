import { Menu, dialog, BrowserWindow, shell } from "electron";
import type { RecentDirectory } from "./types/index.js";
import { store } from "./store.js";
import { projectStore } from "./services/ProjectStore.js";
import { worktreeService } from "./services/WorktreeService.js";
import { CHANNELS } from "./ipc/channels.js";
import path from "path";

const MAX_RECENT_DIRECTORIES = 10;

/**
 * Creates and sets the application menu
 */
export function createApplicationMenu(mainWindow: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Open Directory...",
          accelerator: "CommandOrControl+O",
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ["openDirectory"],
              title: "Open Git Repository",
            });

            if (!result.canceled && result.filePaths.length > 0) {
              const directoryPath = result.filePaths[0];
              await handleDirectoryOpen(directoryPath, mainWindow);
            }
          },
        },
        {
          label: "Open Recent",
          submenu: buildRecentDirectoriesMenu(mainWindow),
        },
        { type: "separator" },
        {
          label: "Close Window",
          accelerator: "CommandOrControl+W",
          role: "close",
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Learn More",
          click: async () => {
            await shell.openExternal("https://github.com/gregpriday/canopy-electron");
          },
        },
      ],
    },
  ];

  // On macOS, add app menu as first item
  if (process.platform === "darwin") {
    template.unshift({
      label: "Canopy",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Builds the "Open Recent" submenu from stored recent directories
 */
function buildRecentDirectoriesMenu(
  mainWindow: BrowserWindow
): Electron.MenuItemConstructorOptions[] {
  const recentDirs = store.get("appState.recentDirectories", []);

  if (recentDirs.length === 0) {
    return [{ label: "No Recent Directories", enabled: false }];
  }

  const menuItems: Electron.MenuItemConstructorOptions[] = recentDirs.map((dir) => ({
    label: `${dir.displayName} - ${dir.path}`,
    click: async () => {
      await handleDirectoryOpen(dir.path, mainWindow);
    },
  }));

  menuItems.push(
    { type: "separator" },
    {
      label: "Clear Recent",
      click: () => {
        store.set("appState.recentDirectories", []);
        // Rebuild menu to reflect cleared list
        createApplicationMenu(mainWindow);
      },
    }
  );

  return menuItems;
}

/**
 * Handles opening a directory: now uses ProjectStore for multi-project support
 */
async function handleDirectoryOpen(
  directoryPath: string,
  mainWindow: BrowserWindow
): Promise<void> {
  try {
    // 1. Add to ProjectStore (persists to projects.json)
    const project = await projectStore.addProject(directoryPath);

    // 2. Set as current project (updates lastOpened)
    await projectStore.setCurrentProject(project.id);

    // 3. Get the updated project with new lastOpened timestamp
    const updatedProject = projectStore.getProjectById(project.id);
    if (!updatedProject) {
      throw new Error(`Project not found after update: ${project.id}`);
    }

    // 4. Refresh worktree service to load worktrees from new project
    // Note: Current worktreeService.refresh() only re-polls existing monitors
    // Full project switching requires window reload (handled by renderer)
    await worktreeService.refresh();

    // 5. Notify renderer to update UI (use CHANNELS constant and send updated project)
    mainWindow.webContents.send(CHANNELS.PROJECT_ON_SWITCH, updatedProject);

    // 6. Update legacy recent menu (for backward compatibility)
    addToRecentDirectories(directoryPath);
    createApplicationMenu(mainWindow);

    // 7. Legacy: also send directory-changed for any other listeners
    mainWindow.webContents.send("directory-changed", directoryPath);
  } catch (error) {
    console.error("Failed to open project:", error);

    // Provide more specific error messages
    let errorMessage = "An unknown error occurred";
    if (error instanceof Error) {
      if (error.message.includes("Not a git repository")) {
        errorMessage = "The selected directory is not a Git repository.";
      } else if (error.message.includes("ENOENT")) {
        errorMessage = "The selected directory does not exist.";
      } else if (error.message.includes("EACCES")) {
        errorMessage = "Permission denied. You don't have access to this directory.";
      } else {
        errorMessage = error.message;
      }
    }

    // Show error dialog to user
    dialog.showErrorBox("Failed to Open Project", errorMessage);
  }
}

/**
 * Adds a directory to the recent directories list
 */
export function addToRecentDirectories(directoryPath: string): void {
  const recentDirs = store.get("appState.recentDirectories", []);

  // Remove if already exists (to update timestamp)
  const filtered = recentDirs.filter((dir) => dir.path !== directoryPath);

  // Add to front of list
  const newRecent: RecentDirectory = {
    path: directoryPath,
    displayName: path.basename(directoryPath),
    lastOpened: Date.now(),
  };

  filtered.unshift(newRecent);

  // Limit to MAX_RECENT_DIRECTORIES
  const truncated = filtered.slice(0, MAX_RECENT_DIRECTORIES);

  store.set("appState.recentDirectories", truncated);
}

/**
 * Updates the "Open Recent" submenu (call this when recent directories change)
 */
export function updateRecentDirectoriesMenu(mainWindow: BrowserWindow): void {
  createApplicationMenu(mainWindow);
}
