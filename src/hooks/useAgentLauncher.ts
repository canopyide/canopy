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

import { useCallback, useEffect, useRef, useState } from "react";
import { useTerminalStore, type AddTerminalOptions } from "@/store/terminalStore";
import { useProjectStore } from "@/store/projectStore";
import { useWorktrees } from "./useWorktrees";
import { isElectronAvailable } from "./useElectron";
import { cliAvailabilityClient, agentSettingsClient } from "@/clients";
import type { AgentSettings, CliAvailability } from "@shared/types";
import { generateClaudeFlags, generateGeminiFlags, generateCodexFlags } from "@shared/types";

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

export interface UseAgentLauncherReturn {
  /** Launch an agent terminal */
  launchAgent: (type: AgentType) => Promise<string | null>;
  /** CLI availability status */
  availability: CliAvailability;
  /** Whether availability check is in progress */
  isCheckingAvailability: boolean;
  /** Current agent settings (to check enabled status) */
  agentSettings: AgentSettings | null;
  /** Force refresh settings (e.g. after changing them) */
  refreshSettings: () => Promise<void>;
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

  const [availability, setAvailability] = useState<CliAvailability>({
    claude: false, // Default to unavailable until checked - safer than optimistic true
    gemini: false,
    codex: false,
  });
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(true);
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null);

  // Track if component is mounted to prevent state updates after unmount
  const isMounted = useRef(true);

  // Extracted check function that can be called for initial load and refresh
  const checkAvailabilityAndLoadSettings = useCallback(async () => {
    if (!isElectronAvailable()) {
      setIsCheckingAvailability(false);
      return;
    }

    // Set loading state for manual refreshes too
    if (isMounted.current) {
      setIsCheckingAvailability(true);
    }

    try {
      // Use centralized CLI availability service for optimal performance
      // Single IPC call instead of three separate checkCommand calls
      // Use refresh() to ensure fresh data on mount (handles mid-session CLI installs)
      const [cliAvailability, settings] = await Promise.all([
        cliAvailabilityClient.refresh(),
        agentSettingsClient.get(),
      ]);

      if (isMounted.current) {
        setAvailability(cliAvailability);
        setAgentSettings(settings);
      }
    } catch (error) {
      console.error("Failed to check CLI availability or load settings:", error);
      // On error, keep safe defaults (false) to avoid enabling unavailable CLIs
    } finally {
      if (isMounted.current) {
        setIsCheckingAvailability(false);
      }
    }
  }, []);

  // Check CLI availability and load agent settings on mount
  useEffect(() => {
    isMounted.current = true;
    checkAvailabilityAndLoadSettings();

    return () => {
      isMounted.current = false;
    };
  }, [checkAvailabilityAndLoadSettings]);

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

      // Build command with settings-based CLI flags
      let command = config.command;
      if (command && agentSettings) {
        let flags: string[] = [];

        switch (type) {
          case "claude":
            flags = generateClaudeFlags(agentSettings.claude);
            break;
          case "gemini":
            flags = generateGeminiFlags(agentSettings.gemini);
            break;
          case "codex":
            flags = generateCodexFlags(agentSettings.codex);
            break;
        }

        if (flags.length > 0) {
          command = `${config.command} ${flags.join(" ")}`;
        }
      }

      const options: AddTerminalOptions = {
        type: config.type,
        title: config.title,
        cwd,
        worktreeId: activeId || undefined,
        command,
      };

      try {
        const terminalId = await addTerminal(options);
        return terminalId;
      } catch (error) {
        console.error(`Failed to launch ${type} agent:`, error);
        return null;
      }
    },
    [activeId, worktreeMap, addTerminal, currentProject, agentSettings]
  );

  return {
    launchAgent,
    availability,
    isCheckingAvailability,
    agentSettings,
    refreshSettings: checkAvailabilityAndLoadSettings,
  };
}
