import { create, type StateCreator } from "zustand";
import type { Project, ProjectCloseResult } from "@shared/types";
import { projectClient, appClient } from "@/clients";
import { resetAllStoresForProjectSwitch } from "./resetStores";
import { flushTerminalPersistence } from "./slices";

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
  closeProject: (projectId: string) => Promise<ProjectCloseResult>;
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
      const currentProject = get().currentProject;
      const oldProjectId = currentProject?.id;

      // Save current project state BEFORE switching
      // The backend persists terminals to electron-store so they're restored on hydration
      if (oldProjectId) {
        flushTerminalPersistence(); // ensure debounced terminal state is persisted
        console.log("[ProjectSwitch] Saving state for project:", oldProjectId);
        try {
          const currentState = await appClient.getState();
          if (currentState) {
            // Save current terminal state - backend handles per-project persistence
            await appClient.setState({
              terminals: currentState.terminals || [],
              activeWorktreeId: currentState.activeWorktreeId,
              terminalGridConfig: currentState.terminalGridConfig,
            });
          }
        } catch (saveError) {
          // Don't fail the switch if state save fails
          console.warn("[ProjectSwitch] Failed to save state:", saveError);
        }
      }

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
      throw error;
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

  closeProject: async (projectId) => {
    const currentProjectId = get().currentProject?.id;

    // Prevent closing active project
    if (projectId === currentProjectId) {
      throw new Error("Cannot close the active project. Switch to another project first.");
    }

    try {
      const result = await projectClient.close(projectId);

      if (!result.success) {
        throw new Error(result.error || "Failed to close project");
      }

      console.log(
        `[ProjectStore] Closed project ${projectId}: ${result.processesKilled} processes killed`
      );

      return result;
    } catch (error) {
      console.error(`[ProjectStore] Failed to close project ${projectId}:`, error);
      throw error;
    }
  },
});

export const useProjectStore = create<ProjectState>()(createProjectStore);
