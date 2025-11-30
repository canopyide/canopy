/**
 * Project Store
 *
 * Frontend state management for projects.
 * Syncs with the Electron backend ProjectStore via IPC.
 */

import { create, type StateCreator } from "zustand";
import type { Project } from "@shared/types";

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadProjects: () => Promise<void>;
  getCurrentProject: () => Promise<void>;
  addProject: () => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  regenerateIdentity: (projectId: string) => Promise<void>;
}

const createProjectStore: StateCreator<ProjectState> = (set, get) => ({
  projects: [],
  currentProject: null,
  isLoading: false,
  error: null,

  loadProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await window.electron.project.getAll();
      set({ projects, isLoading: false });
    } catch (error) {
      console.error("Failed to load projects:", error);
      set({ error: "Failed to load projects", isLoading: false });
    }
  },

  getCurrentProject: async () => {
    set({ isLoading: true, error: null });
    try {
      const currentProject = await window.electron.project.getCurrent();
      set({ currentProject, isLoading: false });
    } catch (error) {
      console.error("Failed to get current project:", error);
      set({
        error: "Failed to get current project",
        currentProject: null,
        isLoading: false,
      });
    }
  },

  addProject: async () => {
    set({ isLoading: true, error: null });
    try {
      // 1. Open dialog to pick folder
      const path = await window.electron.project.openDialog();
      if (!path) {
        set({ isLoading: false });
        return;
      }

      // 2. Add project (backend handles git checks)
      const newProject = await window.electron.project.add(path);

      // 3. Refresh list and switch to it
      await get().loadProjects();
      await get().switchProject(newProject.id);
    } catch (error) {
      console.error("Failed to add project:", error);
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  switchProject: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const project = await window.electron.project.switch(projectId);
      set({ currentProject: project, isLoading: false });

      // Refresh the projects list to update 'lastOpened' timestamps
      await get().loadProjects();

      // Force a full window reload to ensure clean state for the new project
      // This mimics the "fresh start" behavior until we implement full state hydration
      window.location.reload();
    } catch (error) {
      console.error("Failed to switch project:", error);
      set({ error: "Failed to switch project", isLoading: false });
    }
  },

  updateProject: async (id, updates) => {
    set({ isLoading: true, error: null });
    try {
      await window.electron.project.update(id, updates);
      await get().loadProjects();
      if (get().currentProject?.id === id) {
        await get().getCurrentProject();
      }
      set({ isLoading: false });
    } catch (error) {
      console.error("Failed to update project:", error);
      set({ error: "Failed to update project", isLoading: false });
    }
  },

  removeProject: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await window.electron.project.remove(id);
      await get().loadProjects();
      // If we removed the active project, clear current
      if (get().currentProject?.id === id) {
        set({ currentProject: null });
      }
      set({ isLoading: false });
    } catch (error) {
      console.error("Failed to remove project:", error);
      set({ error: "Failed to remove project", isLoading: false });
    }
  },

  regenerateIdentity: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const updatedProject = await window.electron.project.regenerateIdentity(projectId);

      // Update the projects list with the new identity
      const projects = get().projects.map((p) => (p.id === projectId ? updatedProject : p));
      set({ projects });

      // Update current project if this is the active one
      if (get().currentProject?.id === projectId) {
        set({ currentProject: updatedProject });
      }

      set({ isLoading: false });
    } catch (error) {
      console.error("Failed to regenerate project identity:", error);
      set({ error: (error as Error).message, isLoading: false });
    }
  },
});

export const useProjectStore = create<ProjectState>()(createProjectStore);
