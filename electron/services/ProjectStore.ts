/**
 * ProjectStore
 *
 * Manages project persistence and state in the filesystem.
 * Projects are stored in ~/.config/canopy/projects.json
 * Per-project state is stored in ~/.config/canopy/projects/<project-id>/state.json
 */

import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import os from 'os'
import type { Project, ProjectState } from '../ipc/types.js'

const CONFIG_DIR = path.join(os.homedir(), '.config', 'canopy')
const PROJECTS_FILE = path.join(CONFIG_DIR, 'projects.json')
const PROJECTS_STATE_DIR = path.join(CONFIG_DIR, 'projects')
const CURRENT_PROJECT_FILE = path.join(CONFIG_DIR, 'current-project.txt')

interface ProjectsData {
  projects: Project[]
}

export class ProjectStore {
  private projectsCache: Project[] | null = null
  private currentProjectId: string | null = null

  /**
   * Initialize the ProjectStore
   * Ensures config directory and files exist
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true })
      await fs.mkdir(PROJECTS_STATE_DIR, { recursive: true })

      // Load current project ID
      try {
        this.currentProjectId = (await fs.readFile(CURRENT_PROJECT_FILE, 'utf8')).trim()
      } catch {
        // No current project set yet
        this.currentProjectId = null
      }

      // Ensure projects file exists
      try {
        await fs.access(PROJECTS_FILE)
      } catch {
        await fs.writeFile(PROJECTS_FILE, JSON.stringify({ projects: [] }, null, 2))
      }

      // Load projects cache
      await this.loadProjects()
    } catch (error) {
      console.error('[ProjectStore] Failed to initialize:', error)
      throw error
    }
  }

  /**
   * Load projects from disk
   */
  private async loadProjects(): Promise<Project[]> {
    try {
      const data = await fs.readFile(PROJECTS_FILE, 'utf8')
      const parsed: ProjectsData = JSON.parse(data)
      this.projectsCache = parsed.projects || []
      return this.projectsCache
    } catch (error) {
      console.error('[ProjectStore] Failed to load projects:', error)
      this.projectsCache = []
      return []
    }
  }

  /**
   * Save projects to disk
   */
  private async saveProjects(projects: Project[]): Promise<void> {
    try {
      const data: ProjectsData = { projects }
      await fs.writeFile(PROJECTS_FILE, JSON.stringify(data, null, 2))
      this.projectsCache = projects
    } catch (error) {
      console.error('[ProjectStore] Failed to save projects:', error)
      throw error
    }
  }

  /**
   * Generate a deterministic project ID from path
   */
  private generateId(projectPath: string): string {
    return crypto.createHash('sha256').update(projectPath).digest('hex').slice(0, 16)
  }

  /**
   * Validate project ID format to prevent path traversal
   */
  private validateProjectId(id: string): boolean {
    // IDs must be 16-character hex strings (from generateId)
    return /^[a-f0-9]{16}$/.test(id)
  }

  /**
   * Validate that a resolved path is within the projects directory
   */
  private validateProjectStatePath(projectId: string): string {
    if (!this.validateProjectId(projectId)) {
      throw new Error(`Invalid project ID format: ${projectId}`)
    }

    const stateDir = path.join(PROJECTS_STATE_DIR, projectId)
    const resolvedPath = path.resolve(stateDir)

    // Ensure the path is within PROJECTS_STATE_DIR
    if (!resolvedPath.startsWith(path.resolve(PROJECTS_STATE_DIR) + path.sep)) {
      throw new Error(`Project state path outside allowed directory: ${projectId}`)
    }

    return resolvedPath
  }

  /**
   * Get all projects
   */
  async getAllProjects(): Promise<Project[]> {
    if (!this.projectsCache) {
      await this.loadProjects()
    }
    return this.projectsCache || []
  }

  /**
   * Get a project by ID
   */
  async getProjectById(id: string): Promise<Project | null> {
    const projects = await this.getAllProjects()
    return projects.find(p => p.id === id) || null
  }

  /**
   * Get a project by path
   */
  async getProjectByPath(projectPath: string): Promise<Project | null> {
    const projects = await this.getAllProjects()
    return projects.find(p => p.path === projectPath) || null
  }

  /**
   * Add or update a project
   * If a project with the same path exists, updates it; otherwise creates new
   */
  async addProject(projectPath: string, name?: string, emoji?: string): Promise<Project> {
    const projects = await this.getAllProjects()

    // Check if project already exists
    const existing = projects.find(p => p.path === projectPath)
    if (existing) {
      // Update lastOpened timestamp
      existing.lastOpened = Date.now()
      if (name) existing.name = name
      if (emoji) existing.emoji = emoji
      await this.saveProjects(projects)
      return existing
    }

    // Create new project
    const id = this.generateId(projectPath)
    const displayName = name || path.basename(projectPath)
    const project: Project = {
      id,
      path: projectPath,
      name: displayName,
      emoji: emoji || '🌲',
      lastOpened: Date.now(),
    }

    projects.push(project)
    await this.saveProjects(projects)

    // Create project state directory
    const stateDir = path.join(PROJECTS_STATE_DIR, id)
    await fs.mkdir(stateDir, { recursive: true })

    return project
  }

  /**
   * Update a project
   */
  async updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'emoji' | 'color'>>): Promise<void> {
    const projects = await this.getAllProjects()
    const project = projects.find(p => p.id === id)

    if (!project) {
      throw new Error(`Project not found: ${id}`)
    }

    if (updates.name !== undefined) project.name = updates.name
    if (updates.emoji !== undefined) project.emoji = updates.emoji
    if (updates.color !== undefined) project.color = updates.color

    await this.saveProjects(projects)
  }

  /**
   * Remove a project
   */
  async removeProject(id: string): Promise<void> {
    // Validate project ID format first
    if (!this.validateProjectId(id)) {
      throw new Error(`Invalid project ID format: ${id}`)
    }

    const projects = await this.getAllProjects()
    const filtered = projects.filter(p => p.id !== id)

    if (filtered.length === projects.length) {
      throw new Error(`Project not found: ${id}`)
    }

    await this.saveProjects(filtered)

    // Remove project state directory with path validation
    try {
      const stateDir = this.validateProjectStatePath(id)
      await fs.rm(stateDir, { recursive: true, force: true })
    } catch (error) {
      console.warn(`[ProjectStore] Failed to remove project state directory for ${id}:`, error)
    }

    // Clear current project if it was removed
    if (this.currentProjectId === id) {
      this.currentProjectId = null
      try {
        await fs.unlink(CURRENT_PROJECT_FILE)
      } catch {
        // File may not exist
      }
    }
  }

  /**
   * Get the current project ID
   */
  getCurrentProjectId(): string | null {
    return this.currentProjectId
  }

  /**
   * Set the current project
   */
  async setCurrentProject(id: string): Promise<void> {
    const project = await this.getProjectById(id)
    if (!project) {
      throw new Error(`Project not found: ${id}`)
    }

    this.currentProjectId = id

    // Save to disk
    try {
      await fs.writeFile(CURRENT_PROJECT_FILE, id, 'utf8')
    } catch (error) {
      console.error('[ProjectStore] Failed to save current project:', error)
      throw error
    }

    // Update lastOpened timestamp
    const projects = await this.getAllProjects()
    const projectToUpdate = projects.find(p => p.id === id)
    if (projectToUpdate) {
      projectToUpdate.lastOpened = Date.now()
      await this.saveProjects(projects)
    }
  }

  /**
   * Get project state
   */
  async getProjectState(projectId: string): Promise<ProjectState | null> {
    try {
      const stateDir = this.validateProjectStatePath(projectId)
      const stateFile = path.join(stateDir, 'state.json')

      const data = await fs.readFile(stateFile, 'utf8')
      return JSON.parse(data) as ProjectState
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // State file doesn't exist yet - this is expected for new projects
        return null
      }
      // Log other errors (parse errors, permission issues) but still return null
      console.error(`[ProjectStore] Failed to load project state for ${projectId}:`, error)
      return null
    }
  }

  /**
   * Save project state
   */
  async saveProjectState(projectId: string, state: ProjectState): Promise<void> {
    try {
      const stateDir = this.validateProjectStatePath(projectId)
      const stateFile = path.join(stateDir, 'state.json')

      await fs.mkdir(stateDir, { recursive: true })
      // TODO: Use atomic write (temp file + rename) to prevent corruption
      await fs.writeFile(stateFile, JSON.stringify(state, null, 2))
    } catch (error) {
      console.error(`[ProjectStore] Failed to save project state for ${projectId}:`, error)
      throw error
    }
  }

  /**
   * Migrate from old appState to project model
   * Creates a project from lastDirectory if it exists
   */
  async migrateFromAppState(lastDirectory?: string, recentDirectories?: Array<{ path: string; lastOpened: number; displayName: string }>): Promise<Project | null> {
    // If lastDirectory exists and is not already a project, create one
    if (lastDirectory) {
      try {
        await fs.access(lastDirectory)
        const existing = await this.getProjectByPath(lastDirectory)
        if (!existing) {
          const project = await this.addProject(lastDirectory)
          await this.setCurrentProject(project.id)
          return project
        }
        return existing
      } catch {
        // Directory doesn't exist, skip
      }
    }

    // Try to create projects from recent directories
    if (recentDirectories && recentDirectories.length > 0) {
      for (const recent of recentDirectories) {
        try {
          await fs.access(recent.path)
          const existing = await this.getProjectByPath(recent.path)
          if (!existing) {
            await this.addProject(recent.path, recent.displayName)
          }
        } catch {
          // Directory doesn't exist, skip
        }
      }
    }

    return null
  }
}

// Singleton instance
export const projectStore = new ProjectStore()
