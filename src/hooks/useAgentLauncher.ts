/**
 * useAgentLauncher Hook
 *
 * Provides agent launcher functionality with proper configuration for AI agents.
 * Handles spawning terminals pre-configured for Claude, Gemini, or plain shell.
 *
 * Features:
 * - Spawns terminal with agent command (claude, gemini) or plain shell
 * - Uses active worktree path as CWD when available
 * - Checks CLI availability and caches results
 */

import { useCallback, useEffect, useState } from "react";
import { useTerminalStore, type AddTerminalOptions } from "@/store/terminalStore";
import { useProjectStore } from "@/store/projectStore";
import { useWorktrees } from "./useWorktrees";
import { isElectronAvailable } from "./useElectron";

export type AgentType = "claude" | "gemini" | "codex" | "shell";

interface AgentConfig {
  type: AgentType;
  title: string;
  command?: string;
}

const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  claude: {
    type: "claude",
    title: "Claude",
    command: "claude",
  },
  gemini: {
    type: "gemini",
    title: "Gemini",
    command: "gemini",
  },
  codex: {
    type: "codex",
    title: "Codex",
    command: "codex",
  },
  shell: {
    type: "shell",
    title: "Shell",
    command: undefined, // Plain shell, no command
  },
};

export interface AgentAvailability {
  claude: boolean;
  gemini: boolean;
  codex: boolean;
}

export interface UseAgentLauncherReturn {
  /** Launch an agent terminal */
  launchAgent: (type: AgentType) => Promise<string | null>;
  /** CLI availability status */
  availability: AgentAvailability;
  /** Whether availability check is in progress */
  isCheckingAvailability: boolean;
}

/**
 * Hook for launching AI agent terminals
 *
 * @example
 * ```tsx
 * function Toolbar() {
 *   const { launchAgent, availability } = useAgentLauncher()
 *
 *   return (
 *     <div>
 *       <button
 *         onClick={() => launchAgent('claude')}
 *         disabled={!availability.claude}
 *       >
 *         Claude
 *       </button>
 *       <button
 *         onClick={() => launchAgent('gemini')}
 *         disabled={!availability.gemini}
 *       >
 *         Gemini
 *       </button>
 *       <button onClick={() => launchAgent('shell')}>
 *         Shell
 *       </button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useAgentLauncher(): UseAgentLauncherReturn {
  const { addTerminal } = useTerminalStore();
  const { worktreeMap, activeId } = useWorktrees();
  const currentProject = useProjectStore((state) => state.currentProject);

  const [availability, setAvailability] = useState<AgentAvailability>({
    claude: true, // Optimistically assume available until checked
    gemini: true,
    codex: true,
  });
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(true);

  // Check CLI availability on mount
  useEffect(() => {
    if (!isElectronAvailable()) {
      setIsCheckingAvailability(false);
      return;
    }

    let cancelled = false;

    async function checkAvailability() {
      try {
        const [claudeAvailable, geminiAvailable, codexAvailable] = await Promise.all([
          window.electron.system.checkCommand("claude"),
          window.electron.system.checkCommand("gemini"),
          window.electron.system.checkCommand("codex"),
        ]);

        if (!cancelled) {
          setAvailability({
            claude: claudeAvailable,
            gemini: geminiAvailable,
            codex: codexAvailable,
          });
        }
      } catch (error) {
        console.error("Failed to check CLI availability:", error);
        // Keep optimistic defaults on error
      } finally {
        if (!cancelled) {
          setIsCheckingAvailability(false);
        }
      }
    }

    checkAvailability();

    return () => {
      cancelled = true;
    };
  }, []);

  const launchAgent = useCallback(
    async (type: AgentType): Promise<string | null> => {
      if (!isElectronAvailable()) {
        console.warn("Electron API not available");
        return null;
      }

      const config = AGENT_CONFIGS[type];

      // Get CWD from active worktree or fall back to project root
      const activeWorktree = activeId ? worktreeMap.get(activeId) : null;
      // Pass project root if no worktree; Main process handles HOME fallback as last resort
      const cwd = activeWorktree?.path || currentProject?.path || "";

      const options: AddTerminalOptions = {
        type: config.type,
        title: config.title,
        cwd,
        worktreeId: activeId || undefined,
        command: config.command,
      };

      try {
        const terminalId = await addTerminal(options);
        return terminalId;
      } catch (error) {
        console.error(`Failed to launch ${type} agent:`, error);
        return null;
      }
    },
    [activeId, worktreeMap, addTerminal, currentProject]
  );

  return {
    launchAgent,
    availability,
    isCheckingAvailability,
  };
}
