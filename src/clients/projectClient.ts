/**
 * Project IPC Client
 *
 * Provides a typed interface for project-related IPC operations.
 * Wraps window.electron.project.* calls for testability and maintainability.
 */

import type { Project, ProjectSettings, RunCommand } from "@shared/types";

/**
 * Client for project IPC operations.
 *
 * @example
 * ```typescript
 * import { projectClient } from "@/clients/projectClient";
 *
 * const projects = await projectClient.getAll();
 * const cleanup = projectClient.onSwitch((project) => console.log(project));
 * ```
 */
export const projectClient = {
  /** Get all projects */
  getAll: (): Promise<Project[]> => {
    return window.electron.project.getAll();
  },

  /** Get the current project */
  getCurrent: (): Promise<Project | null> => {
    return window.electron.project.getCurrent();
  },

  /** Add a new project */
  add: (path: string): Promise<Project> => {
    return window.electron.project.add(path);
  },

  /** Remove a project */
  remove: (projectId: string): Promise<void> => {
    return window.electron.project.remove(projectId);
  },

  /** Update project properties */
  update: (projectId: string, updates: Partial<Project>): Promise<Project> => {
    return window.electron.project.update(projectId, updates);
  },

  /** Switch to a different project */
  switch: (projectId: string): Promise<Project> => {
    return window.electron.project.switch(projectId);
  },

  /** Open a directory picker dialog */
  openDialog: (): Promise<string | null> => {
    return window.electron.project.openDialog();
  },

  /** Subscribe to project switch events. Returns cleanup function. */
  onSwitch: (callback: (project: Project) => void): (() => void) => {
    return window.electron.project.onSwitch(callback);
  },

  /** Get project settings */
  getSettings: (projectId: string): Promise<ProjectSettings> => {
    return window.electron.project.getSettings(projectId);
  },

  /** Save project settings */
  saveSettings: (projectId: string, settings: ProjectSettings): Promise<void> => {
    return window.electron.project.saveSettings(projectId, settings);
  },

  /** Detect available runners for a project */
  detectRunners: (projectId: string): Promise<RunCommand[]> => {
    return window.electron.project.detectRunners(projectId);
  },

  /** Regenerate project identity */
  regenerateIdentity: (projectId: string): Promise<Project> => {
    return window.electron.project.regenerateIdentity(projectId);
  },
} as const;
