import { store } from "../store.js";
import type { Project, ProjectState, ProjectSettings } from "../types/index.js";
import { createHash } from "crypto";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { app } from "electron";
import { simpleGit } from "simple-git";
import { generateProjectNameAndEmoji } from "./ai/identity.js";

const SETTINGS_FILENAME = "settings.json";

/**
 * ProjectStore manages the list of projects and their persisted state.
 * Each project represents a Git repository root.
 */
export class ProjectStore {
  private projectsConfigDir: string;

  constructor() {
    // Store project states in ~/.config/canopy/projects (or platform equivalent)
    this.projectsConfigDir = path.join(app.getPath("userData"), "projects");
  }

  /**
   * Initializes the project store (creates directories if needed)
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.projectsConfigDir)) {
      await fs.mkdir(this.projectsConfigDir, { recursive: true });
    }
  }

  /**
   * Generates a stable ID for a project based on its path
   */
  private generateProjectId(projectPath: string): string {
    return createHash("sha256").update(projectPath).digest("hex");
  }

  /**
   * Validates that a project ID has the expected format (64-character hex string)
   */
  private isValidProjectId(projectId: string): boolean {
    return /^[0-9a-f]{64}$/.test(projectId);
  }

  /**
   * Safely resolves a project state directory and ensures it's within projectsConfigDir
   */
  private getProjectStateDir(projectId: string): string | null {
    if (!this.isValidProjectId(projectId)) {
      return null;
    }
    const stateDir = path.join(this.projectsConfigDir, projectId);
    const normalized = path.normalize(stateDir);
    // Ensure the path stays within projectsConfigDir (prevent traversal)
    if (!normalized.startsWith(this.projectsConfigDir + path.sep)) {
      return null;
    }
    return normalized;
  }

  /**
   * Gets the Git repository root for a given path and canonicalizes it
   */
  private async getGitRoot(projectPath: string): Promise<string | null> {
    try {
      const git = simpleGit(projectPath);
      const root = await git.revparse(["--show-toplevel"]);
      const trimmed = root.trim();
      // Canonicalize to resolve symlinks and normalize path
      const canonical = await fs.realpath(trimmed);
      return canonical;
    } catch {
      return null;
    }
  }

  /**
   * Adds a new project to the list
   */
  async addProject(projectPath: string): Promise<Project> {
    // Normalize path and get git root
    const gitRoot = await this.getGitRoot(projectPath);
    if (!gitRoot) {
      throw new Error(`Not a git repository: ${projectPath}`);
    }

    const normalizedPath = path.normalize(gitRoot);

    // Check if project already exists
    const existing = await this.getProjectByPath(normalizedPath);
    if (existing) {
      // Update lastOpened timestamp
      return this.updateProject(existing.id, { lastOpened: Date.now() });
    }

    // Generate AI identity (non-blocking, with fallback)
    let identity: { name: string; emoji: string; color?: string } | null = null;
    try {
      identity = await generateProjectNameAndEmoji(normalizedPath);
    } catch (error) {
      // Log but don't fail project creation if AI is unavailable
      console.warn("[ProjectStore] AI identity generation failed:", error);
    }

    // Create new project with AI-generated identity or fallback defaults
    const project: Project = {
      id: this.generateProjectId(normalizedPath),
      path: normalizedPath,
      name: identity?.name || path.basename(normalizedPath),
      emoji: identity?.emoji || "🌲",
      aiGeneratedName: identity?.name,
      aiGeneratedEmoji: identity?.emoji,
      color: identity?.color,
      lastOpened: Date.now(),
      isFallbackIdentity: !identity,
    };

    const projects = this.getAllProjects();
    projects.push(project);
    store.set("projects.list", projects);

    return project;
  }

  /**
   * Removes a project from the list
   */
  async removeProject(projectId: string): Promise<void> {
    // Validate project ID format to prevent path traversal
    const stateDir = this.getProjectStateDir(projectId);
    if (!stateDir) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }

    const projects = this.getAllProjects();
    const filtered = projects.filter((p) => p.id !== projectId);
    store.set("projects.list", filtered);

    // Remove project state directory
    if (existsSync(stateDir)) {
      try {
        await fs.rm(stateDir, { recursive: true, force: true });
      } catch (error) {
        console.error(`[ProjectStore] Failed to remove state directory for ${projectId}:`, error);
        // Don't throw - project was removed from list, state cleanup is secondary
      }
    }

    // If this was the current project, clear it
    if (this.getCurrentProjectId() === projectId) {
      store.set("projects.currentProjectId", undefined);
    }
  }

  /**
   * Updates a project's metadata (only allows safe fields to be modified)
   */
  updateProject(projectId: string, updates: Partial<Project>): Project {
    const projects = this.getAllProjects();
    const index = projects.findIndex((p) => p.id === projectId);

    if (index === -1) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Only allow safe fields to be updated (prevent mutation of id and path)
    const safeUpdates: Partial<Project> = {};
    if (updates.name !== undefined) safeUpdates.name = updates.name;
    if (updates.emoji !== undefined) safeUpdates.emoji = updates.emoji;

    // If name or emoji is manually updated, clear the fallback flag
    if (updates.name !== undefined || updates.emoji !== undefined) {
      safeUpdates.isFallbackIdentity = false;
    }

    if (updates.color !== undefined) safeUpdates.color = updates.color;
    if (updates.aiGeneratedName !== undefined)
      safeUpdates.aiGeneratedName = updates.aiGeneratedName;
    if (updates.aiGeneratedEmoji !== undefined)
      safeUpdates.aiGeneratedEmoji = updates.aiGeneratedEmoji;
    // Allow lastOpened to be updated (for project switching and reopening)
    if (updates.lastOpened !== undefined) safeUpdates.lastOpened = updates.lastOpened;

    const updated = { ...projects[index], ...safeUpdates };
    projects[index] = updated;
    store.set("projects.list", projects);

    return updated;
  }

  /**
   * Gets all projects, sorted by lastOpened descending
   */
  getAllProjects(): Project[] {
    const projects = store.get("projects.list", []);
    return projects.sort((a, b) => b.lastOpened - a.lastOpened);
  }

  /**
   * Gets a project by path
   */
  async getProjectByPath(projectPath: string): Promise<Project | null> {
    const normalizedPath = path.normalize(projectPath);
    const projects = this.getAllProjects();
    return projects.find((p) => p.path === normalizedPath) || null;
  }

  /**
   * Gets a project by ID
   */
  getProjectById(projectId: string): Project | null {
    const projects = this.getAllProjects();
    return projects.find((p) => p.id === projectId) || null;
  }

  /**
   * Gets the current project ID
   */
  getCurrentProjectId(): string | null {
    return store.get("projects.currentProjectId") || null;
  }

  /**
   * Gets the current project
   */
  getCurrentProject(): Project | null {
    const currentId = this.getCurrentProjectId();
    if (!currentId) return null;
    return this.getProjectById(currentId);
  }

  /**
   * Sets the current project
   */
  async setCurrentProject(projectId: string): Promise<void> {
    const project = this.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    store.set("projects.currentProjectId", projectId);

    // Update lastOpened timestamp
    this.updateProject(projectId, { lastOpened: Date.now() });
  }

  /**
   * Gets the state file path for a project
   */
  private getStateFilePath(projectId: string): string | null {
    const stateDir = this.getProjectStateDir(projectId);
    if (!stateDir) {
      return null;
    }
    return path.join(stateDir, "state.json");
  }

  /**
   * Saves project state to disk (atomic write with temp file)
   */
  async saveProjectState(projectId: string, state: ProjectState): Promise<void> {
    const stateDir = this.getProjectStateDir(projectId);
    if (!stateDir) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }

    if (!existsSync(stateDir)) {
      await fs.mkdir(stateDir, { recursive: true });
    }

    const stateFilePath = this.getStateFilePath(projectId);
    if (!stateFilePath) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }

    // Atomic write: write to temp file then rename
    const tempFilePath = `${stateFilePath}.tmp`;
    try {
      await fs.writeFile(tempFilePath, JSON.stringify(state, null, 2), "utf-8");
      await fs.rename(tempFilePath, stateFilePath);
    } catch (error) {
      console.error(`[ProjectStore] Failed to save state for project ${projectId}:`, error);
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Loads project state from disk with validation and defaults
   */
  async getProjectState(projectId: string): Promise<ProjectState | null> {
    const stateFilePath = this.getStateFilePath(projectId);
    if (!stateFilePath || !existsSync(stateFilePath)) {
      return null;
    }

    try {
      const content = await fs.readFile(stateFilePath, "utf-8");
      const parsed = JSON.parse(content);

      // Validate and apply defaults
      const state: ProjectState = {
        projectId: parsed.projectId || projectId,
        activeWorktreeId: parsed.activeWorktreeId,
        sidebarWidth: typeof parsed.sidebarWidth === "number" ? parsed.sidebarWidth : 350,
        terminals: Array.isArray(parsed.terminals) ? parsed.terminals : [],
        terminalLayout: parsed.terminalLayout || undefined,
      };

      return state;
    } catch (error) {
      console.error(`[ProjectStore] Failed to load state for project ${projectId}:`, error);
      // Optionally quarantine corrupted file
      try {
        const quarantinePath = `${stateFilePath}.corrupted`;
        await fs.rename(stateFilePath, quarantinePath);
        console.warn(`[ProjectStore] Corrupted state file moved to ${quarantinePath}`);
      } catch {
        // Ignore quarantine errors
      }
      return null;
    }
  }

  /**
   * Gets the settings file path for a project
   */
  private getSettingsFilePath(projectId: string): string | null {
    const stateDir = this.getProjectStateDir(projectId);
    if (!stateDir) return null;
    return path.join(stateDir, SETTINGS_FILENAME);
  }

  /**
   * Load project settings from disk with defaults
   */
  async getProjectSettings(projectId: string): Promise<ProjectSettings> {
    const filePath = this.getSettingsFilePath(projectId);
    if (!filePath || !existsSync(filePath)) {
      // Return defaults if no file exists
      return { runCommands: [] };
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);

      // Validate and apply defaults
      const settings: ProjectSettings = {
        runCommands: Array.isArray(parsed.runCommands) ? parsed.runCommands : [],
        environmentVariables: parsed.environmentVariables,
        excludedPaths: parsed.excludedPaths,
      };

      return settings;
    } catch (error) {
      console.error(`[ProjectStore] Failed to load settings for ${projectId}:`, error);
      // Optionally quarantine corrupted file
      try {
        const quarantinePath = `${filePath}.corrupted`;
        await fs.rename(filePath, quarantinePath);
        console.warn(`[ProjectStore] Corrupted settings file moved to ${quarantinePath}`);
      } catch {
        // Ignore quarantine errors
      }
      return { runCommands: [] };
    }
  }

  /**
   * Save project settings to disk (atomic write)
   */
  async saveProjectSettings(projectId: string, settings: ProjectSettings): Promise<void> {
    const stateDir = this.getProjectStateDir(projectId);
    if (!stateDir) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }

    // Ensure directory exists
    if (!existsSync(stateDir)) {
      await fs.mkdir(stateDir, { recursive: true });
    }

    const filePath = this.getSettingsFilePath(projectId);
    if (!filePath) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }

    // Atomic write: write to temp file then rename
    const tempFilePath = `${filePath}.tmp`;
    try {
      await fs.writeFile(tempFilePath, JSON.stringify(settings, null, 2), "utf-8");
      await fs.rename(tempFilePath, filePath);
    } catch (error) {
      console.error(`[ProjectStore] Failed to save settings for ${projectId}:`, error);
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Migrates recentDirectories to projects list (one-time migration)
   */
  async migrateFromRecentDirectories(): Promise<void> {
    const recentDirs = store.get("appState.recentDirectories", []);
    if (recentDirs.length === 0) return;

    const projects = this.getAllProjects();
    if (projects.length > 0) return; // Already migrated

    console.log(`[ProjectStore] Migrating ${recentDirs.length} recent directories to projects`);

    for (const dir of recentDirs) {
      try {
        await this.addProject(dir.path);
      } catch (error) {
        console.warn(`[ProjectStore] Failed to migrate directory ${dir.path}:`, error);
      }
    }

    // Optionally clear recentDirectories after migration
    // store.set("appState.recentDirectories", []);
  }
}

// Singleton instance
export const projectStore = new ProjectStore();
