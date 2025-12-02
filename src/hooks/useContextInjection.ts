import { useCallback, useState, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTerminalStore, type TerminalInstance } from "@/store/terminalStore";
import { useErrorStore } from "@/store/errorStore";
import type { TerminalType } from "@/components/Terminal/TerminalPane";
import type { AgentState } from "@/types";
import { copyTreeClient } from "@/clients";

type CopyTreeFormat = "xml" | "json" | "markdown" | "tree" | "ndjson";

// Different AI agents have different preferences for context format
const AGENT_FORMAT_MAP: Record<TerminalType, CopyTreeFormat> = {
  claude: "xml",
  gemini: "markdown",
  codex: "xml",
  npm: "xml",
  yarn: "xml",
  pnpm: "xml",
  bun: "xml",
  shell: "xml",
  custom: "xml",
};

function getOptimalFormat(terminalType: TerminalType): CopyTreeFormat {
  const format = AGENT_FORMAT_MAP[terminalType];
  if (!format) {
    console.warn(`Unknown terminal type "${terminalType}", defaulting to XML format`);
    return "xml";
  }
  return format;
}

export interface CopyTreeProgress {
  stage: string;
  progress: number;
  message: string;
  filesProcessed?: number;
  totalFiles?: number;
  currentFile?: string;
}

export interface UseContextInjectionReturn {
  inject: (worktreeId: string, terminalId?: string, selectedPaths?: string[]) => Promise<void>;
  cancel: () => void;
  isInjecting: boolean;
  progress: CopyTreeProgress | null;
  error: string | null;
  clearError: () => void;
}

function isAgentBusy(agentState: AgentState | undefined): boolean {
  return agentState === "working";
}

export function useContextInjection(): UseContextInjectionReturn {
  const [isInjecting, setIsInjecting] = useState(false);
  const [progress, setProgress] = useState<CopyTreeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focusedId = useTerminalStore((state) => state.focusedId);
  const terminals = useTerminalStore(useShallow((state) => state.terminals));
  const addError = useErrorStore((state) => state.addError);
  const removeError = useErrorStore((state) => state.removeError);

  const isInjectingRef = useRef(false);
  const lastProgressAtRef = useRef(0);
  const currentErrorIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = copyTreeClient.onProgress((p) => {
      if (!isInjectingRef.current) return;

      // Throttle to 100ms to prevent excessive re-renders
      const now = performance.now();
      if (now - lastProgressAtRef.current < 100) return;
      lastProgressAtRef.current = now;

      setProgress(p);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
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

      const terminal = terminals.find((t: TerminalInstance) => t.id === targetTerminalId);
      if (!terminal) {
        setError(`Terminal not found: ${targetTerminalId}`);
        return;
      }

      // Warn but proceed - agent might finish by the time context is generated
      if (isAgentBusy(terminal.agentState)) {
        console.log("Agent is busy, context will be injected when generation completes");
      }

      setIsInjecting(true);
      isInjectingRef.current = true;
      setError(null);
      setProgress({ stage: "Starting", progress: 0, message: "Initializing..." });

      try {
        const isAvailable = await copyTreeClient.isAvailable();
        if (!isAvailable) {
          throw new Error(
            "CopyTree CLI not installed. Please install copytree to use this feature."
          );
        }

        const format = getOptimalFormat(terminal.type);

        const options = {
          format,
          ...(selectedPaths && selectedPaths.length > 0 ? { includePaths: selectedPaths } : {}),
        };

        const result = await copyTreeClient.injectToTerminal(targetTerminalId, worktreeId, options);

        if (result.error) {
          throw new Error(result.error);
        }

        const pathInfo =
          selectedPaths && selectedPaths.length > 0
            ? ` from ${selectedPaths.length} selected ${selectedPaths.length === 1 ? "path" : "paths"}`
            : "";
        console.log(
          `Context injected (${result.fileCount} files as ${format.toUpperCase()}${pathInfo})`
        );

        if (currentErrorIdRef.current) {
          removeError(currentErrorIdRef.current);
          currentErrorIdRef.current = null;
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to inject context";
        const details = e instanceof Error ? e.stack : undefined;

        setError(message);

        let errorType: "config" | "process" | "filesystem" = "process";
        if (message.includes("not installed") || message.includes("not found")) {
          errorType = "config";
        } else if (message.includes("permission") || message.includes("EACCES")) {
          errorType = "filesystem";
        }

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
    copyTreeClient.cancel().catch(console.error);
    setIsInjecting(false);
    isInjectingRef.current = false;
    setProgress(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { inject, cancel, isInjecting, progress, error, clearError };
}
