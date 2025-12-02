import { useState, useEffect, useCallback } from "react";
import { isElectronAvailable } from "./useElectron";
import type { Artifact, ArtifactDetectedPayload } from "@shared/types";
import { artifactClient } from "@/clients";

const artifactStore = new Map<string, Artifact[]>();
const listeners = new Set<(terminalId: string, artifacts: Artifact[]) => void>();
let listenerRefCount = 0;
let ipcUnsubscribe: (() => void) | null = null;

function notifyListeners(terminalId: string, artifacts: Artifact[]) {
  listeners.forEach((listener) => listener(terminalId, artifacts));
}

export function useArtifacts(terminalId: string, worktreeId?: string, cwd?: string) {
  const [artifacts, setArtifacts] = useState<Artifact[]>(() => artifactStore.get(terminalId) || []);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectronAvailable()) return;

    listenerRefCount++;

    if (listenerRefCount === 1 && !ipcUnsubscribe) {
      ipcUnsubscribe = artifactClient.onDetected((payload: ArtifactDetectedPayload) => {
        const currentArtifacts = artifactStore.get(payload.terminalId) || [];
        const newArtifacts = [...currentArtifacts, ...payload.artifacts];
        artifactStore.set(payload.terminalId, newArtifacts);

        notifyListeners(payload.terminalId, newArtifacts);
      });
    }

    return () => {
      listenerRefCount--;

      if (listenerRefCount === 0 && ipcUnsubscribe) {
        ipcUnsubscribe();
        ipcUnsubscribe = null;
      }
    };
  }, []);

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

  const saveToFile = useCallback(
    async (artifact: Artifact) => {
      if (!isElectronAvailable()) return null;

      try {
        setActionInProgress(artifact.id);

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

  const clearArtifacts = useCallback(() => {
    artifactStore.delete(terminalId);
    setArtifacts([]);
    notifyListeners(terminalId, []);
  }, [terminalId]);

  const canApplyPatch = useCallback(
    (artifact: Artifact) => {
      return artifact.type === "patch" && !!worktreeId && !!cwd;
    },
    [worktreeId, cwd]
  );

  return {
    artifacts,
    actionInProgress,
    hasArtifacts: artifacts.length > 0,
    copyToClipboard,
    saveToFile,
    applyPatch,
    clearArtifacts,
    canApplyPatch,
  };
}

export default useArtifacts;
