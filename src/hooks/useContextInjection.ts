/**
 * useContextInjection Hook
 *
 * Provides context injection functionality for worktrees into terminals.
 * Generates CopyTree output and injects it into the focused terminal.
 * Includes progress reporting and cancellation support.
 */

import { useCallback, useState, useEffect, useRef } from "react";
import { useTerminalStore } from "@/store/terminalStore";

/** Progress information for context generation */
export interface CopyTreeProgress {
  /** Current stage name (e.g., 'FileDiscoveryStage', 'FormatterStage') */
  stage: string;
  /** Progress percentage (0-1) */
  progress: number;
  /** Human-readable progress message */
  message: string;
  /** Files processed so far (if known) */
  filesProcessed?: number;
  /** Total files estimated (if known) */
  totalFiles?: number;
  /** Current file being processed (if known) */
  currentFile?: string;
}

export interface UseContextInjectionReturn {
  /** Inject context from a worktree into a terminal */
  inject: (worktreeId: string, terminalId?: string) => Promise<void>;
  /** Cancel the current injection operation */
  cancel: () => void;
  /** Whether an injection is currently in progress */
  isInjecting: boolean;
  /** Current progress information (null when not injecting) */
  progress: CopyTreeProgress | null;
  /** Error message from the last injection attempt */
  error: string | null;
  /** Clear the error state */
  clearError: () => void;
}

export function useContextInjection(): UseContextInjectionReturn {
  const [isInjecting, setIsInjecting] = useState(false);
  const [progress, setProgress] = useState<CopyTreeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focusedId = useTerminalStore((state) => state.focusedId);

  // Track injection state to filter stale progress events
  const isInjectingRef = useRef(false);
  const lastProgressAtRef = useRef(0);

  // Subscribe to progress events from the main process
  useEffect(() => {
    const unsubscribe = window.electron.copyTree.onProgress((p) => {
      // Ignore progress updates when not injecting (prevents stale events)
      if (!isInjectingRef.current) return;

      // Throttle progress updates to prevent excessive re-renders (100ms)
      const now = performance.now();
      if (now - lastProgressAtRef.current < 100) return;
      lastProgressAtRef.current = now;

      setProgress(p);
    });
    return unsubscribe;
  }, []);

  const inject = useCallback(
    async (worktreeId: string, terminalId?: string) => {
      const targetTerminal = terminalId || focusedId;

      if (!targetTerminal) {
        setError("No terminal selected");
        return;
      }

      setIsInjecting(true);
      isInjectingRef.current = true;
      setError(null);
      setProgress({ stage: "Starting", progress: 0, message: "Initializing..." });

      try {
        // Check if CopyTree is available
        const isAvailable = await window.electron.copyTree.isAvailable();
        if (!isAvailable) {
          throw new Error(
            "CopyTree CLI not installed. Please install copytree to use this feature."
          );
        }

        // Inject context into terminal
        // The injectToTerminal function handles:
        // - Looking up the worktree path from worktreeId
        // - Generating context via CopyTree
        // - Chunked writing to the terminal
        const result = await window.electron.copyTree.injectToTerminal(targetTerminal, worktreeId);

        if (result.error) {
          throw new Error(result.error);
        }

        // Log success (notification system can be added later)
        console.log(`Context injected (${result.fileCount} files)`);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to inject context";
        setError(message);
        console.error("Context injection failed:", message);
      } finally {
        setIsInjecting(false);
        isInjectingRef.current = false;
        setProgress(null);
      }
    },
    [focusedId]
  );

  const cancel = useCallback(() => {
    window.electron.copyTree.cancel().catch(console.error);
    setIsInjecting(false);
    isInjectingRef.current = false;
    setProgress(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { inject, cancel, isInjecting, progress, error, clearError };
}
