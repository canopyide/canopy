/**
 * ProjectLifecycleService - Manages project switching as an explicit state machine.
 *
 * Project switching is a multi-step transaction that must be executed in order:
 * 1. BEGIN_SWITCH - Lock UI, signal start
 * 2. PERSIST_OLD_STATE - Save current project state
 * 3. TEARDOWN_RENDERER - Clear renderer stores
 * 4. SWITCH_IN_MAIN - Switch project in main process
 * 5. HYDRATE_NEW_STATE - Trigger re-hydration
 * 6. END_SWITCH - Unlock UI
 *
 * This service encapsulates this logic to:
 * - Keep projectStore simple (just state + thin wrapper)
 * - Make the transaction visible and debuggable
 * - Handle partial failure gracefully
 */

import { projectClient, appClient } from "@/clients";
import { resetAllStoresForProjectSwitch } from "@/store/resetStores";
import { flushTerminalPersistence } from "@/store/slices/terminalRegistrySlice";
import type { Project } from "@shared/types";

/**
 * Phases of the project switch transaction.
 */
export enum ProjectSwitchPhase {
  IDLE = "IDLE",
  BEGIN_SWITCH = "BEGIN_SWITCH",
  PERSIST_OLD_STATE = "PERSIST_OLD_STATE",
  TEARDOWN_RENDERER = "TEARDOWN_RENDERER",
  SWITCH_IN_MAIN = "SWITCH_IN_MAIN",
  HYDRATE_NEW_STATE = "HYDRATE_NEW_STATE",
  END_SWITCH = "END_SWITCH",
  ERROR = "ERROR",
}

/**
 * Callbacks for project lifecycle events.
 */
export interface ProjectLifecycleCallbacks {
  onPhaseChange?: (phase: ProjectSwitchPhase) => void;
  onError?: (error: Error, phase: ProjectSwitchPhase) => void;
  onSwitchComplete?: (project: Project) => void;
  setLoading?: (loading: boolean) => void;
  setError?: (error: string | null) => void;
  setCurrentProject?: (project: Project | null) => void;
  loadProjects?: () => Promise<void>;
}

/**
 * Service for managing project lifecycle transitions.
 */
class ProjectLifecycleService {
  private _currentPhase: ProjectSwitchPhase = ProjectSwitchPhase.IDLE;
  private _callbacks: ProjectLifecycleCallbacks = {};

  /**
   * Get the current phase of the project switch.
   */
  get currentPhase(): ProjectSwitchPhase {
    return this._currentPhase;
  }

  /**
   * Check if a switch is currently in progress.
   */
  get isSwitching(): boolean {
    return (
      this._currentPhase !== ProjectSwitchPhase.IDLE &&
      this._currentPhase !== ProjectSwitchPhase.ERROR
    );
  }

  /**
   * Register callbacks for lifecycle events.
   */
  setCallbacks(callbacks: ProjectLifecycleCallbacks): void {
    this._callbacks = callbacks;
  }

  /**
   * Set the current phase and notify callbacks.
   */
  private setPhase(phase: ProjectSwitchPhase): void {
    console.log(`[ProjectLifecycle] Phase: ${this._currentPhase} -> ${phase}`);
    this._currentPhase = phase;
    this._callbacks.onPhaseChange?.(phase);
  }

  /**
   * Switch to a different project.
   * This is the main entry point for project switching.
   */
  async switch(projectId: string, currentProjectId?: string): Promise<Project> {
    if (this.isSwitching) {
      throw new Error("A project switch is already in progress");
    }

    let switchedProject: Project | null = null;

    try {
      // Phase 1: Begin switch
      this.setPhase(ProjectSwitchPhase.BEGIN_SWITCH);
      this._callbacks.setLoading?.(true);
      this._callbacks.setError?.(null);

      // Phase 2: Persist old project state
      this.setPhase(ProjectSwitchPhase.PERSIST_OLD_STATE);
      if (currentProjectId) {
        await this.persistCurrentProjectState();
      }

      // Phase 3: Teardown renderer
      this.setPhase(ProjectSwitchPhase.TEARDOWN_RENDERER);
      console.log("[ProjectLifecycle] Resetting renderer stores...");
      await resetAllStoresForProjectSwitch();

      // Phase 4: Switch in main process
      this.setPhase(ProjectSwitchPhase.SWITCH_IN_MAIN);
      console.log("[ProjectLifecycle] Switching project in main process...");
      switchedProject = await projectClient.switch(projectId);

      // Phase 5: Hydrate new state
      this.setPhase(ProjectSwitchPhase.HYDRATE_NEW_STATE);
      this._callbacks.setCurrentProject?.(switchedProject);

      // Reload project list and trigger re-hydration
      await this._callbacks.loadProjects?.();
      console.log("[ProjectLifecycle] Triggering state re-hydration...");
      window.dispatchEvent(new CustomEvent("project-switched"));

      // Phase 6: End switch
      this.setPhase(ProjectSwitchPhase.END_SWITCH);
      this._callbacks.setLoading?.(false);
      this._callbacks.onSwitchComplete?.(switchedProject);

      return switchedProject;
    } catch (error) {
      console.error("[ProjectLifecycle] Switch failed:", error);
      this.setPhase(ProjectSwitchPhase.ERROR);
      const errorMessage = error instanceof Error ? error.message : "Failed to switch project";
      this._callbacks.setError?.(errorMessage);
      this._callbacks.setLoading?.(false);
      this._callbacks.onError?.(
        error instanceof Error ? error : new Error(errorMessage),
        this._currentPhase
      );
      throw error;
    } finally {
      // Always reset to idle after completion or error
      if (this._currentPhase !== ProjectSwitchPhase.ERROR) {
        this.setPhase(ProjectSwitchPhase.IDLE);
      }
    }
  }

  /**
   * Persist the current project's state before switching.
   */
  private async persistCurrentProjectState(): Promise<void> {
    try {
      // Ensure debounced terminal state is persisted
      flushTerminalPersistence();
      console.log("[ProjectLifecycle] Flushed terminal persistence");

      // Get and save current state
      const currentState = await appClient.getState();
      if (currentState) {
        await appClient.setState({
          terminals: currentState.terminals || [],
          activeWorktreeId: currentState.activeWorktreeId,
          terminalGridConfig: currentState.terminalGridConfig,
        });
        console.log("[ProjectLifecycle] Saved current project state");
      }
    } catch (saveError) {
      // Don't fail the switch if state save fails - just warn
      console.warn("[ProjectLifecycle] Failed to save state:", saveError);
    }
  }

  /**
   * Reset the service to idle state.
   * Call this if the app gets into an inconsistent state.
   */
  reset(): void {
    console.log("[ProjectLifecycle] Resetting to idle");
    this._currentPhase = ProjectSwitchPhase.IDLE;
  }
}

// Singleton instance
export const projectLifecycleService = new ProjectLifecycleService();
