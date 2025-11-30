/**
 * useArtifacts Hook
 *
 * Manages artifacts extracted from agent terminal output.
 * Subscribes to artifact detection events and provides actions for
 * copying, saving, and applying artifacts.
 */

import { useState, useEffect, useCallback } from "react";
import { isElectronAvailable } from "./useElectron";
import type { Artifact, ArtifactDetectedPayload } from "@shared/types";
import { artifactClient } from "@/clients";

// Global state for artifacts (shared across all hook instances)
const artifactStore = new Map<string, Artifact[]>();
const listeners = new Set<(terminalId: string, artifacts: Artifact[]) => void>();

// Reference count for IPC listener management
let listenerRefCount = 0;
let ipcUnsubscribe: (() => void) | null = null;

function notifyListeners(terminalId: string, artifacts: Artifact[]) {
  listeners.forEach((listener) => listener(terminalId, artifacts));
}

/**
 * Hook to manage artifacts for a specific terminal
 *
 * @param terminalId - The terminal ID to filter artifacts for
 * @param worktreeId - Optional worktree ID for patch application
 * @param cwd - Current working directory for save dialog
 * @returns Artifacts and actions
 */
export function useArtifacts(terminalId: string, worktreeId?: string, cwd?: string) {
  const [artifacts, setArtifacts] = useState<Artifact[]>(() => artifactStore.get(terminalId) || []);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Subscribe to global artifact detection events (reference-counted singleton)
  useEffect(() => {
    if (!isElectronAvailable()) return;

    // Increment reference count
    listenerRefCount++;

    // Set up IPC listener if this is the first instance
    if (listenerRefCount === 1 && !ipcUnsubscribe) {
      ipcUnsubscribe = artifactClient.onDetected((payload: ArtifactDetectedPayload) => {
        // Update artifact store
        const currentArtifacts = artifactStore.get(payload.terminalId) || [];
        const newArtifacts = [...currentArtifacts, ...payload.artifacts];
        artifactStore.set(payload.terminalId, newArtifacts);

        // Notify all listeners
        notifyListeners(payload.terminalId, newArtifacts);
      });
    }

    return () => {
      // Decrement reference count
      listenerRefCount--;

      // Clean up IPC listener when no more instances exist
      if (listenerRefCount === 0 && ipcUnsubscribe) {
        ipcUnsubscribe();
        ipcUnsubscribe = null;
      }
    };
  }, []);

  // Subscribe to changes for this specific terminal
  useEffect(() => {
    const listener = (tid: string, arts: Artifact[]) => {
      if (tid === terminalId) {
        setArtifacts(arts);
      }
    };

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, [terminalId]);

  // Copy artifact content to clipboard
  const copyToClipboard = useCallback(async (artifact: Artifact) => {
    if (!navigator.clipboard) {
      console.error("Clipboard API not available");
      return false;
    }

    try {
      setActionInProgress(artifact.id);
      await navigator.clipboard.writeText(artifact.content);
      return true;
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      return false;
    } finally {
      setActionInProgress(null);
    }
  }, []);

  // Save artifact to file
  const saveToFile = useCallback(
    async (artifact: Artifact) => {
      if (!isElectronAvailable()) return null;

      try {
        setActionInProgress(artifact.id);

        // Determine suggested filename
        let suggestedFilename = artifact.filename;
        if (!suggestedFilename) {
          const ext = artifact.language ? `.${artifact.language}` : ".txt";
          suggestedFilename = `artifact-${Date.now()}${ext}`;
        }

        const result = await artifactClient.saveToFile({
          content: artifact.content,
          suggestedFilename,
          cwd,
        });

        return result;
      } catch (error) {
        console.error("Failed to save artifact:", error);
        return null;
      } finally {
        setActionInProgress(null);
      }
    },
    [cwd]
  );

  // Apply patch artifact
  const applyPatch = useCallback(
    async (artifact: Artifact) => {
      if (!isElectronAvailable() || artifact.type !== "patch") {
        return { success: false, error: "Invalid artifact type or Electron not available" };
      }

      if (!worktreeId || !cwd) {
        return { success: false, error: "No worktree context available" };
      }

      try {
        setActionInProgress(artifact.id);

        const result = await artifactClient.applyPatch({
          patchContent: artifact.content,
          cwd,
        });

        return result;
      } catch (error) {
        console.error("Failed to apply patch:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        setActionInProgress(null);
      }
    },
    [worktreeId, cwd]
  );

  // Clear artifacts for this terminal
  const clearArtifacts = useCallback(() => {
    artifactStore.delete(terminalId);
    setArtifacts([]);
    notifyListeners(terminalId, []);
  }, [terminalId]);

  // Check if an artifact can be applied (must be a patch and have worktree context)
  const canApplyPatch = useCallback(
    (artifact: Artifact) => {
      return artifact.type === "patch" && !!worktreeId && !!cwd;
    },
    [worktreeId, cwd]
  );

  return {
    // State
    artifacts,
    actionInProgress,
    hasArtifacts: artifacts.length > 0,

    // Actions
    copyToClipboard,
    saveToFile,
    applyPatch,
    clearArtifacts,

    // Utilities
    canApplyPatch,
  };
}

export default useArtifacts;
