import { create, type StateCreator } from "zustand";
import type { Project } from "@shared/types";
import { projectClient } from "@/clients";
import { resetAllStoresForProjectSwitch } from "./resetStores";

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string | null;

  loadProjects: () => Promise<void>;
  getCurrentProject: () => Promise<void>;
  addProject: () => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
}

const createProjectStore: StateCreator<ProjectState> = (set, get) => ({
  projects: [],
  currentProject: null,
  isLoading: false,
  error: null,

  loadProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await projectClient.getAll();
      set({ projects, isLoading: false });
    } catch (error) {
      console.error("Failed to load projects:", error);
      set({ error: "Failed to load projects", isLoading: false });
    }
  },

  getCurrentProject: async () => {
    set({ isLoading: true, error: null });
    try {
      const currentProject = await projectClient.getCurrent();
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
      const path = await projectClient.openDialog();
      if (!path) {
        set({ isLoading: false });
        return;
      }

      const newProject = await projectClient.add(path);

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
      console.log("[ProjectSwitch] Resetting renderer stores...");
      await resetAllStoresForProjectSwitch();

      console.log("[ProjectSwitch] Switching project in main process...");
      const project = await projectClient.switch(projectId);
      set({ currentProject: project, isLoading: false });

      await get().loadProjects();

      console.log("[ProjectSwitch] Triggering state re-hydration...");
      window.dispatchEvent(new CustomEvent("project-switched"));
    } catch (error) {
      console.error("Failed to switch project:", error);
      set({ error: "Failed to switch project", isLoading: false });
    }
  },

  updateProject: async (id, updates) => {
    set({ isLoading: true, error: null });
    try {
      await projectClient.update(id, updates);
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
      await projectClient.remove(id);
      await get().loadProjects();
      if (get().currentProject?.id === id) {
        set({ currentProject: null });
      }
      set({ isLoading: false });
    } catch (error) {
      console.error("Failed to remove project:", error);
      set({ error: "Failed to remove project", isLoading: false });
    }
  },
});

export const useProjectStore = create<ProjectState>()(createProjectStore);
