/** Manages persisted project state and metadata */

import { store } from "../store.js";
import type { Project, ProjectState, ProjectSettings } from "../types/index.js";
import { createHash } from "crypto";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { app } from "electron";
import { GitService } from "./GitService.js";
import { generateProjectNameAndEmoji } from "./ai/identity.js";

const SETTINGS_FILENAME = "settings.json";

export class ProjectStore {
  private projectsConfigDir: string;

  /** Initialize store path */
  constructor() {
    this.projectsConfigDir = path.join(app.getPath("userData"), "projects");
  }

  /** Create store directory */
  async initialize(): Promise<void> {
    if (!existsSync(this.projectsConfigDir)) {
      await fs.mkdir(this.projectsConfigDir, { recursive: true });
    }
  }

  /** Generate ID from path (SHA-256) */
  private generateProjectId(projectPath: string): string {
    return createHash("sha256").update(projectPath).digest("hex");
  }

  /** Validate ID format */
  private isValidProjectId(projectId: string): boolean {
    return /^[0-9a-f]{64}$/.test(projectId);
  }

  /** Resolve state dir (safe) */
  private getProjectStateDir(projectId: string): string | null {
    if (!this.isValidProjectId(projectId)) {
      return null;
    }
    const stateDir = path.join(this.projectsConfigDir, projectId);
    const normalized = path.normalize(stateDir);
    if (!normalized.startsWith(this.projectsConfigDir + path.sep)) {
      return null;
    }
    return normalized;
  }

  /** Get repo root (canonical) */
  private async getGitRoot(projectPath: string): Promise<string | null> {
    try {
      const gitService = new GitService(projectPath);
      const root = await gitService.getRepositoryRoot(projectPath);
      const canonical = await fs.realpath(root);
      return canonical;
    } catch {
      return null;
    }
  }

  /** Add project (validates git repo) */
  async addProject(projectPath: string): Promise<Project> {
    const gitRoot = await this.getGitRoot(projectPath);
    if (!gitRoot) {
      throw new Error(`Not a git repository: ${projectPath}`);
    }

    const normalizedPath = path.normalize(gitRoot);

    const existing = await this.getProjectByPath(normalizedPath);
    if (existing) {
      return this.updateProject(existing.id, { lastOpened: Date.now() });
    }

    let identity: { name: string; emoji: string; color?: string } | null = null;
    try {
      identity = await generateProjectNameAndEmoji(normalizedPath);
    } catch (error) {
      console.warn("[ProjectStore] AI identity generation failed:", error);
    }

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

  /** Remove project and state */
  async removeProject(projectId: string): Promise<void> {
    const stateDir = this.getProjectStateDir(projectId);
    if (!stateDir) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }

    const projects = this.getAllProjects();
    const filtered = projects.filter((p) => p.id !== projectId);
    store.set("projects.list", filtered);

    if (existsSync(stateDir)) {
      try {
        await fs.rm(stateDir, { recursive: true, force: true });
      } catch (error) {
        console.error(`[ProjectStore] Failed to remove state directory for ${projectId}:`, error);
      }
    }

    if (this.getCurrentProjectId() === projectId) {
      store.set("projects.currentProjectId", undefined);
    }
  }

  /** Update metadata (safe fields only) */
  updateProject(projectId: string, updates: Partial<Project>): Project {
    const projects = this.getAllProjects();
    const index = projects.findIndex((p) => p.id === projectId);

    if (index === -1) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const safeUpdates: Partial<Project> = {};
    if (updates.name !== undefined) safeUpdates.name = updates.name;
    if (updates.emoji !== undefined) safeUpdates.emoji = updates.emoji;

    if (updates.name !== undefined || updates.emoji !== undefined) {
      safeUpdates.isFallbackIdentity = false;
    }

    if (updates.color !== undefined) safeUpdates.color = updates.color;
    if (updates.aiGeneratedName !== undefined)
      safeUpdates.aiGeneratedName = updates.aiGeneratedName;
    if (updates.aiGeneratedEmoji !== undefined)
      safeUpdates.aiGeneratedEmoji = updates.aiGeneratedEmoji;
    if (updates.lastOpened !== undefined) safeUpdates.lastOpened = updates.lastOpened;

    const updated = { ...projects[index], ...safeUpdates };
    projects[index] = updated;
    store.set("projects.list", projects);

    return updated;
  }

  /** Get all projects (sorted by recent) */
  getAllProjects(): Project[] {
    const projects = store.get("projects.list", []);
    return projects.sort((a, b) => b.lastOpened - a.lastOpened);
  }

  /** Find project by path */
  async getProjectByPath(projectPath: string): Promise<Project | null> {
    const normalizedPath = path.normalize(projectPath);
    const projects = this.getAllProjects();
    return projects.find((p) => p.path === normalizedPath) || null;
  }

  /** Find project by ID */
  getProjectById(projectId: string): Project | null {
    const projects = this.getAllProjects();
    return projects.find((p) => p.id === projectId) || null;
  }

  /** Get active project ID */
  getCurrentProjectId(): string | null {
    return store.get("projects.currentProjectId") || null;
  }

  /** Get active project */
  getCurrentProject(): Project | null {
    const currentId = this.getCurrentProjectId();
    if (!currentId) return null;
    return this.getProjectById(currentId);
  }

  /** Set active project */
  async setCurrentProject(projectId: string): Promise<void> {
    const project = this.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    store.set("projects.currentProjectId", projectId);
    this.updateProject(projectId, { lastOpened: Date.now() });
  }

  /** Get state file path */
  private getStateFilePath(projectId: string): string | null {
    const stateDir = this.getProjectStateDir(projectId);
    if (!stateDir) {
      return null;
    }
    return path.join(stateDir, "state.json");
  }

  /** Save state (atomic) */
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

    const tempFilePath = `${stateFilePath}.tmp`;
    try {
      await fs.writeFile(tempFilePath, JSON.stringify(state, null, 2), "utf-8");
      await fs.rename(tempFilePath, stateFilePath);
    } catch (error) {
      console.error(`[ProjectStore] Failed to save state for project ${projectId}:`, error);
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore
      }
      throw error;
    }
  }

  /** Load state (with defaults) */
  async getProjectState(projectId: string): Promise<ProjectState | null> {
    const stateFilePath = this.getStateFilePath(projectId);
    if (!stateFilePath || !existsSync(stateFilePath)) {
      return null;
    }

    try {
      const content = await fs.readFile(stateFilePath, "utf-8");
      const parsed = JSON.parse(content);

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
      try {
        const quarantinePath = `${stateFilePath}.corrupted`;
        await fs.rename(stateFilePath, quarantinePath);
        console.warn(`[ProjectStore] Corrupted state file moved to ${quarantinePath}`);
      } catch {
        // Ignore
      }
      return null;
    }
  }

  /** Get settings file path */
  private getSettingsFilePath(projectId: string): string | null {
    const stateDir = this.getProjectStateDir(projectId);
    if (!stateDir) return null;
    return path.join(stateDir, SETTINGS_FILENAME);
  }

  /** Load settings (with defaults) */
  async getProjectSettings(projectId: string): Promise<ProjectSettings> {
    const filePath = this.getSettingsFilePath(projectId);
    if (!filePath || !existsSync(filePath)) {
      return { runCommands: [] };
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);

      const settings: ProjectSettings = {
        runCommands: Array.isArray(parsed.runCommands) ? parsed.runCommands : [],
        environmentVariables: parsed.environmentVariables,
        excludedPaths: parsed.excludedPaths,
      };

      return settings;
    } catch (error) {
      console.error(`[ProjectStore] Failed to load settings for ${projectId}:`, error);
      try {
        const quarantinePath = `${filePath}.corrupted`;
        await fs.rename(filePath, quarantinePath);
        console.warn(`[ProjectStore] Corrupted settings file moved to ${quarantinePath}`);
      } catch {
        // Ignore
      }
      return { runCommands: [] };
    }
  }

  /** Save settings (atomic) */
  async saveProjectSettings(projectId: string, settings: ProjectSettings): Promise<void> {
    const stateDir = this.getProjectStateDir(projectId);
    if (!stateDir) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }

    if (!existsSync(stateDir)) {
      await fs.mkdir(stateDir, { recursive: true });
    }

    const filePath = this.getSettingsFilePath(projectId);
    if (!filePath) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }

    const tempFilePath = `${filePath}.tmp`;
    try {
      await fs.writeFile(tempFilePath, JSON.stringify(settings, null, 2), "utf-8");
      await fs.rename(tempFilePath, filePath);
    } catch (error) {
      console.error(`[ProjectStore] Failed to save settings for ${projectId}:`, error);
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore
      }
      throw error;
    }
  }
}

// Singleton instance
export const projectStore = new ProjectStore();
