import { ipcMain, dialog, shell } from "electron";
import path from "path";
import os from "os";
import { CHANNELS } from "../channels";
import { sendToRenderer } from "../utils";
import { store } from "../../store";
import { projectStore } from "../../services/ProjectStore";
import { generateProjectIdentity } from "../../services/ai/identity";
import { runCommandDetector } from "../../services/ai/RunCommandDetector";
import type { HandlerDependencies } from "../types";
import type {
  RecentDirectory,
  DirectoryOpenPayload,
  DirectoryRemoveRecentPayload,
  SystemOpenExternalPayload,
  SystemOpenPathPayload,
  Project,
  ProjectSettings,
} from "../../types/index";
import { updateRecentDirectories, removeRecentDirectory } from "../../utils/recentDirectories";

export function registerProjectHandlers(deps: HandlerDependencies): () => void {
  const { mainWindow, worktreeService, cliAvailabilityService } = deps;
  const handlers: Array<() => void> = [];

  // ==========================================
  // Directory Handlers
  // ==========================================

  const handleDirectoryGetRecents = async (): Promise<RecentDirectory[]> => {
    const recents = store.get("appState.recentDirectories", []);

    // Validate and clean up stale entries
    const { validateRecentDirectories } = await import("../../utils/recentDirectories.js");
    const validRecents = await validateRecentDirectories(recents);

    // Update store if any entries were removed
    if (validRecents.length !== recents.length) {
      store.set("appState.recentDirectories", validRecents);
    }

    return validRecents;
  };
  ipcMain.handle(CHANNELS.DIRECTORY_GET_RECENTS, handleDirectoryGetRecents);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DIRECTORY_GET_RECENTS));

  const handleDirectoryOpen = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: DirectoryOpenPayload
  ) => {
    try {
      // Validate payload structure
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload");
      }

      const { path } = payload;

      // Validate path
      if (!path || typeof path !== "string" || path.trim() === "") {
        throw new Error("Invalid directory path");
      }

      // Check if directory exists and is accessible
      const fs = await import("fs");
      const stats = await fs.promises.stat(path);
      if (!stats.isDirectory()) {
        throw new Error("Path is not a directory");
      }

      // Update recent directories
      const currentRecents = store.get("appState.recentDirectories", []);
      const updatedRecents = await updateRecentDirectories(currentRecents, path);
      store.set("appState.recentDirectories", updatedRecents);

      // Refresh worktree service if available
      if (worktreeService) {
        await worktreeService.refresh();
      }
    } catch (error) {
      console.error("Failed to open directory:", error);
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.DIRECTORY_OPEN, handleDirectoryOpen);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DIRECTORY_OPEN));

  const handleDirectoryOpenDialog = async (): Promise<string | null> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
        title: "Open Directory",
      });

      if (result.canceled || !result.filePaths[0]) {
        return null;
      }

      const selectedPath = result.filePaths[0];

      // Update recent directories
      const currentRecents = store.get("appState.recentDirectories", []);
      const updatedRecents = await updateRecentDirectories(currentRecents, selectedPath);
      store.set("appState.recentDirectories", updatedRecents);

      // Refresh worktree service if available
      if (worktreeService) {
        await worktreeService.refresh();
      }

      return selectedPath;
    } catch (error) {
      console.error("Failed to open directory dialog:", error);
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.DIRECTORY_OPEN_DIALOG, handleDirectoryOpenDialog);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DIRECTORY_OPEN_DIALOG));

  const handleDirectoryRemoveRecent = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: DirectoryRemoveRecentPayload
  ) => {
    try {
      // Validate payload structure
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload");
      }

      const { path } = payload;

      // Validate path
      if (!path || typeof path !== "string" || path.trim() === "") {
        throw new Error("Invalid directory path");
      }

      const currentRecents = store.get("appState.recentDirectories", []);
      const updatedRecents = removeRecentDirectory(currentRecents, path);
      store.set("appState.recentDirectories", updatedRecents);
    } catch (error) {
      console.error("Failed to remove recent directory:", error);
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.DIRECTORY_REMOVE_RECENT, handleDirectoryRemoveRecent);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.DIRECTORY_REMOVE_RECENT));

  // ==========================================
  // System Handlers
  // ==========================================

  const handleSystemOpenExternal = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: SystemOpenExternalPayload
  ) => {
    // Validate URL before opening to prevent arbitrary protocol execution
    try {
      const url = new URL(payload.url);
      const allowedProtocols = ["http:", "https:", "mailto:"];
      if (!allowedProtocols.includes(url.protocol)) {
        throw new Error(`Protocol ${url.protocol} is not allowed`);
      }
      await shell.openExternal(payload.url);
    } catch (error) {
      console.error("Failed to open external URL:", error);
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.SYSTEM_OPEN_EXTERNAL, handleSystemOpenExternal);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_OPEN_EXTERNAL));

  const handleSystemOpenPath = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: SystemOpenPathPayload
  ) => {
    // Validate path is absolute and exists before opening
    // This prevents path traversal and arbitrary file access
    const fs = await import("fs");
    const path = await import("path");

    try {
      if (!path.isAbsolute(payload.path)) {
        throw new Error("Only absolute paths are allowed");
      }
      // Check if path exists
      await fs.promises.access(payload.path);
      await shell.openPath(payload.path);
    } catch (error) {
      console.error("Failed to open path:", error);
      throw error;
    }
  };
  ipcMain.handle(CHANNELS.SYSTEM_OPEN_PATH, handleSystemOpenPath);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_OPEN_PATH));

  const handleSystemCheckCommand = async (
    _event: Electron.IpcMainInvokeEvent,
    command: string
  ): Promise<boolean> => {
    if (typeof command !== "string" || !command.trim()) {
      return false;
    }

    // Validate command contains only safe characters to prevent shell injection
    // Allow alphanumeric, dash, underscore, and dot (for extensions)
    if (!/^[a-zA-Z0-9._-]+$/.test(command)) {
      console.warn(`Command "${command}" contains invalid characters, rejecting`);
      return false;
    }

    try {
      const { execFileSync } = await import("child_process");
      // Use 'which' on Unix-like systems, 'where' on Windows
      const checkCmd = process.platform === "win32" ? "where" : "which";
      // Use execFileSync instead of execSync to avoid shell interpretation
      execFileSync(checkCmd, [command], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  ipcMain.handle(CHANNELS.SYSTEM_CHECK_COMMAND, handleSystemCheckCommand);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_CHECK_COMMAND));

  const handleSystemGetHomeDir = async () => {
    return os.homedir();
  };
  ipcMain.handle(CHANNELS.SYSTEM_GET_HOME_DIR, handleSystemGetHomeDir);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_GET_HOME_DIR));

  const handleSystemGetCliAvailability = async () => {
    if (!cliAvailabilityService) {
      console.warn("[IPC] CliAvailabilityService not available");
      return { claude: false, gemini: false, codex: false };
    }

    // Return cached result if available, otherwise check now
    const cached = cliAvailabilityService.getAvailability();
    if (cached) {
      return cached;
    }

    // First time check - run availability check and cache
    return await cliAvailabilityService.checkAvailability();
  };
  ipcMain.handle(CHANNELS.SYSTEM_GET_CLI_AVAILABILITY, handleSystemGetCliAvailability);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_GET_CLI_AVAILABILITY));

  const handleSystemRefreshCliAvailability = async () => {
    if (!cliAvailabilityService) {
      console.warn("[IPC] CliAvailabilityService not available");
      return { claude: false, gemini: false, codex: false };
    }

    // Force re-check of CLI availability
    return await cliAvailabilityService.refresh();
  };
  ipcMain.handle(CHANNELS.SYSTEM_REFRESH_CLI_AVAILABILITY, handleSystemRefreshCliAvailability);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.SYSTEM_REFRESH_CLI_AVAILABILITY));

  // ==========================================
  // Project Handlers
  // ==========================================

  const handleProjectGetAll = async () => {
    return projectStore.getAllProjects();
  };
  ipcMain.handle(CHANNELS.PROJECT_GET_ALL, handleProjectGetAll);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_GET_ALL));

  const handleProjectGetCurrent = async () => {
    const currentProject = projectStore.getCurrentProject();

    // Load worktrees for the current project if available
    if (currentProject && worktreeService) {
      try {
        await worktreeService.loadProject(currentProject.path);
      } catch (err) {
        console.error("Failed to load worktrees for current project:", err);
      }
    }

    return currentProject;
  };
  ipcMain.handle(CHANNELS.PROJECT_GET_CURRENT, handleProjectGetCurrent);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_GET_CURRENT));

  const handleProjectAdd = async (_event: Electron.IpcMainInvokeEvent, projectPath: string) => {
    // Validate input
    if (typeof projectPath !== "string" || !projectPath) {
      throw new Error("Invalid project path");
    }
    if (!path.isAbsolute(projectPath)) {
      throw new Error("Project path must be absolute");
    }
    return await projectStore.addProject(projectPath);
  };
  ipcMain.handle(CHANNELS.PROJECT_ADD, handleProjectAdd);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_ADD));

  const handleProjectRemove = async (_event: Electron.IpcMainInvokeEvent, projectId: string) => {
    // Validate input
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project ID");
    }
    await projectStore.removeProject(projectId);
  };
  ipcMain.handle(CHANNELS.PROJECT_REMOVE, handleProjectRemove);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_REMOVE));

  const handleProjectUpdate = async (
    _event: Electron.IpcMainInvokeEvent,
    projectId: string,
    updates: Partial<Project>
  ) => {
    // Validate inputs
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project ID");
    }
    if (typeof updates !== "object" || updates === null) {
      throw new Error("Invalid updates object");
    }
    return projectStore.updateProject(projectId, updates);
  };
  ipcMain.handle(CHANNELS.PROJECT_UPDATE, handleProjectUpdate);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_UPDATE));

  const handleProjectRegenerateIdentity = async (
    _event: Electron.IpcMainInvokeEvent,
    projectId: string
  ) => {
    // Validate input
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project ID");
    }

    const project = projectStore.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Generate new identity using AI with error handling
    let identity;
    try {
      identity = await generateProjectIdentity(project.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`AI identity generation failed: ${message}`);
    }

    if (!identity) {
      throw new Error(
        "AI identity generation unavailable. Please check that your OpenAI API key is configured in Settings."
      );
    }

    // Update project with new AI-generated identity
    const updates: Partial<Project> = {
      aiGeneratedName: identity.title,
      aiGeneratedEmoji: identity.emoji,
      color: identity.gradientStart,
      // Also update display name/emoji with AI suggestions
      name: identity.title,
      emoji: identity.emoji,
      isFallbackIdentity: false,
    };

    return projectStore.updateProject(projectId, updates);
  };
  ipcMain.handle(CHANNELS.PROJECT_REGENERATE_IDENTITY, handleProjectRegenerateIdentity);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_REGENERATE_IDENTITY));

  const handleProjectSwitch = async (_event: Electron.IpcMainInvokeEvent, projectId: string) => {
    // Validate input
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project ID");
    }

    const project = projectStore.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Set as current project (updates lastOpened)
    await projectStore.setCurrentProject(projectId);

    // Get updated project with new lastOpened timestamp
    const updatedProject = projectStore.getProjectById(projectId);
    if (!updatedProject) {
      throw new Error(`Project not found after update: ${projectId}`);
    }

    // Load worktrees for this project
    if (worktreeService) {
      try {
        await worktreeService.loadProject(project.path);
      } catch (err) {
        console.error("Failed to load worktrees for project:", err);
      }
    }

    // Notify renderer with updated project
    sendToRenderer(mainWindow, CHANNELS.PROJECT_ON_SWITCH, updatedProject);

    return updatedProject;
  };
  ipcMain.handle(CHANNELS.PROJECT_SWITCH, handleProjectSwitch);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_SWITCH));

  const handleProjectOpenDialog = async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Open Git Repository",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  };
  ipcMain.handle(CHANNELS.PROJECT_OPEN_DIALOG, handleProjectOpenDialog);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_OPEN_DIALOG));

  const handleProjectGetSettings = async (
    _event: Electron.IpcMainInvokeEvent,
    projectId: string
  ): Promise<ProjectSettings> => {
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project ID");
    }
    return projectStore.getProjectSettings(projectId);
  };
  ipcMain.handle(CHANNELS.PROJECT_GET_SETTINGS, handleProjectGetSettings);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_GET_SETTINGS));

  const handleProjectSaveSettings = async (
    _event: Electron.IpcMainInvokeEvent,
    payload: { projectId: string; settings: ProjectSettings }
  ): Promise<void> => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid payload");
    }
    const { projectId, settings } = payload;
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Invalid project ID");
    }
    if (!settings || typeof settings !== "object") {
      throw new Error("Invalid settings object");
    }
    return projectStore.saveProjectSettings(projectId, settings);
  };
  ipcMain.handle(CHANNELS.PROJECT_SAVE_SETTINGS, handleProjectSaveSettings);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_SAVE_SETTINGS));

  const handleProjectDetectRunners = async (
    _event: Electron.IpcMainInvokeEvent,
    projectId: string
  ) => {
    if (typeof projectId !== "string" || !projectId) {
      console.warn("[IPC] Invalid project ID for detect runners:", projectId);
      return [];
    }

    const project = projectStore.getProjectById(projectId);
    if (!project) {
      console.warn(`[IPC] Project not found for detect runners: ${projectId}`);
      return [];
    }

    return await runCommandDetector.detect(project.path);
  };
  ipcMain.handle(CHANNELS.PROJECT_DETECT_RUNNERS, handleProjectDetectRunners);
  handlers.push(() => ipcMain.removeHandler(CHANNELS.PROJECT_DETECT_RUNNERS));

  return () => handlers.forEach((cleanup) => cleanup());
}
