/**
 * useContextInjection Hook
 *
 * Provides context injection functionality for worktrees into terminals.
 * Generates CopyTree output and injects it into the focused terminal.
 *
 * The output format is automatically optimized based on the target AI agent:
 * - Claude: XML (structured parsing)
 * - Gemini: Markdown (natural reading)
 * - Shell/Custom: XML (safe default)
 *
 * Includes progress reporting and cancellation support.
 */

import { useCallback, useState, useEffect, useRef } from "react";
import { useTerminalStore, type TerminalInstance } from "@/store/terminalStore";
import { useErrorStore } from "@/store/errorStore";
import type { TerminalType } from "@/components/Terminal/TerminalPane";
import type { AgentState } from "@/types";

/** CopyTree output format */
type CopyTreeFormat = "xml" | "json" | "markdown" | "tree" | "ndjson";

/**
 * Mapping from terminal type to optimal CopyTree output format.
 * Different AI agents have different preferences for context format.
 */
const AGENT_FORMAT_MAP: Record<TerminalType, CopyTreeFormat> = {
  claude: "xml", // Claude prefers structured XML
  gemini: "markdown", // Gemini works well with Markdown
  codex: "xml", // Codex prefers structured XML (like Claude)
  shell: "xml", // Default for manual paste
  custom: "xml", // Safe default
};

/**
 * Get the optimal CopyTree output format for a terminal type.
 */
function getOptimalFormat(terminalType: TerminalType): CopyTreeFormat {
  const format = AGENT_FORMAT_MAP[terminalType];
  if (!format) {
    console.warn(`Unknown terminal type "${terminalType}", defaulting to XML format`);
    return "xml";
  }
  return format;
}

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
  inject: (worktreeId: string, terminalId?: string, selectedPaths?: string[]) => Promise<void>;
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

/**
 * Check if the agent is busy (working state).
 * Returns true if the agent should not receive input.
 */
function isAgentBusy(agentState: AgentState | undefined): boolean {
  return agentState === "working";
}

export function useContextInjection(): UseContextInjectionReturn {
  const [isInjecting, setIsInjecting] = useState(false);
  const [progress, setProgress] = useState<CopyTreeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focusedId = useTerminalStore((state) => state.focusedId);
  const terminals = useTerminalStore((state) => state.terminals);
  const addError = useErrorStore((state) => state.addError);
  const removeError = useErrorStore((state) => state.removeError);
  // Note: queueCommand is available but not used for context injection
  // because context injection is an async operation that generates content
  // before writing. Simple text payloads should use queueCommand directly.

  // Track injection state to filter stale progress events
  const isInjectingRef = useRef(false);
  const lastProgressAtRef = useRef(0);
  const currentErrorIdRef = useRef<string | null>(null);

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

  // Cleanup error reference on unmount
  useEffect(() => {
    return () => {
      // Clear the error ID ref on unmount to prevent stale references
      currentErrorIdRef.current = null;
    };
  }, []);

  const inject = useCallback(
    async (worktreeId: string, terminalId?: string, selectedPaths?: string[]) => {
      const targetTerminalId = terminalId || focusedId;

      if (!targetTerminalId) {
        setError("No terminal selected");
        return;
      }

      // Get terminal info to determine optimal format and check busy state
      const terminal = terminals.find((t: TerminalInstance) => t.id === targetTerminalId);
      if (!terminal) {
        setError(`Terminal not found: ${targetTerminalId}`);
        return;
      }

      // Check if agent is busy - warn but proceed since context generation takes time
      // and the agent might finish by the time we're ready to inject
      if (isAgentBusy(terminal.agentState)) {
        console.log("Agent is busy, context will be injected when generation completes");
        // The injection will proceed - by the time context is generated (can take seconds),
        // the agent may have finished processing. If still busy when writing,
        // the backend will still write (this is expected behavior for now).
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

        const format = getOptimalFormat(terminal.type);

        // Build options with includePaths if selected paths were provided
        const options = {
          format,
          ...(selectedPaths && selectedPaths.length > 0 ? { includePaths: selectedPaths } : {}),
        };

        // Inject context into terminal with optimal format
        // The injectToTerminal function handles:
        // - Looking up the worktree path from worktreeId
        // - Generating context via CopyTree with the specified format
        // - Chunked writing to the terminal
        const result = await window.electron.copyTree.injectToTerminal(
          targetTerminalId,
          worktreeId,
          options
        );

        if (result.error) {
          throw new Error(result.error);
        }

        // Log success with format information
        const pathInfo =
          selectedPaths && selectedPaths.length > 0
            ? ` from ${selectedPaths.length} selected ${selectedPaths.length === 1 ? "path" : "paths"}`
            : "";
        console.log(
          `Context injected (${result.fileCount} files as ${format.toUpperCase()}${pathInfo})`
        );

        // Clear any previous error for this injection on success
        if (currentErrorIdRef.current) {
          removeError(currentErrorIdRef.current);
          currentErrorIdRef.current = null;
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to inject context";
        const details = e instanceof Error ? e.stack : undefined;

        // Keep local error for hook consumers (if any)
        setError(message);

        // Determine error type based on message content
        let errorType: "config" | "process" | "filesystem" = "process";
        if (message.includes("not installed") || message.includes("not found")) {
          errorType = "config";
        } else if (message.includes("permission") || message.includes("EACCES")) {
          errorType = "filesystem";
        }

        // Add to global error store for Problems panel visibility
        const errorId = addError({
          type: errorType,
          message: `Context injection failed: ${message}`,
          details,
          source: "ContextInjection",
          context: {
            worktreeId,
            terminalId: targetTerminalId,
          },
          isTransient: true,
          retryAction: "injectContext",
          retryArgs: {
            worktreeId,
            terminalId: targetTerminalId,
            selectedPaths,
          },
        });

        // Store error ID for cleanup on successful retry
        currentErrorIdRef.current = errorId;

        console.error("Context injection failed:", message);
      } finally {
        setIsInjecting(false);
        isInjectingRef.current = false;
        setProgress(null);
      }
    },
    [focusedId, terminals, addError, removeError]
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
