import { AGENT_REGISTRY } from "../config/agentRegistry.js";
import { escapeShellArg } from "../utils/shellEscape.js";

export interface AgentSettingsEntry {
  enabled?: boolean;
  customFlags?: string;
  /** Additional args appended when dangerous mode is enabled */
  dangerousArgs?: string;
  /** Toggle to include dangerousArgs in the final command */
  dangerousEnabled?: boolean;
  [key: string]: unknown;
}

export interface AgentSettings {
  agents: Record<string, AgentSettingsEntry>;
}

export const DEFAULT_DANGEROUS_ARGS: Record<string, string> = {
  claude: "--dangerously-skip-permissions",
  gemini: "--yolo",
  codex: "--dangerously-bypass-approvals-and-sandbox",
};

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  agents: Object.fromEntries(
    Object.keys(AGENT_REGISTRY).map((id) => [
      id,
      {
        enabled: true,
        customFlags: "",
        dangerousArgs: DEFAULT_DANGEROUS_ARGS[id] ?? "",
        dangerousEnabled: false,
      },
    ])
  ),
};

export function getAgentSettingsEntry(
  settings: AgentSettings | null | undefined,
  agentId: string
): AgentSettingsEntry {
  if (!settings || !settings.agents) return {};
  return settings.agents[agentId] ?? {};
}

export function generateAgentFlags(entry: AgentSettingsEntry, agentId?: string): string[] {
  const flags: string[] = [];
  if (entry.dangerousEnabled) {
    // Use entry.dangerousArgs if set, otherwise fall back to default for this agent
    const dangerousArgs =
      entry.dangerousArgs?.trim() || (agentId ? DEFAULT_DANGEROUS_ARGS[agentId] : "");
    if (dangerousArgs) {
      flags.push(...dangerousArgs.split(/\s+/));
    }
  }
  if (entry.customFlags) {
    const trimmed = entry.customFlags.trim();
    if (trimmed) {
      flags.push(...trimmed.split(/\s+/));
    }
  }
  return flags;
}

export interface GenerateAgentCommandOptions {
  /** Initial prompt to pass to the agent CLI */
  initialPrompt?: string;
  /** If true, agent runs in interactive mode (default). If false, runs one-shot/print mode. */
  interactive?: boolean;
}

/**
 * Generates a complete agent command string including base command, flags, and optional initial prompt.
 *
 * @param baseCommand - The base command for the agent (e.g., "claude", "gemini")
 * @param entry - Agent settings entry containing flags configuration
 * @param agentId - The agent identifier (e.g., "claude", "gemini", "codex")
 * @param options - Optional configuration including initial prompt and interactive mode
 * @returns The complete command string to spawn the agent
 *
 * @example
 * // Claude interactive with prompt
 * generateAgentCommand("claude", entry, "claude", { initialPrompt: "Fix the bug" });
 * // => "claude --flags 'Fix the bug'"
 *
 * // Claude one-shot (print mode)
 * generateAgentCommand("claude", entry, "claude", { initialPrompt: "Fix the bug", interactive: false });
 * // => "claude --flags -p 'Fix the bug'"
 */
export function generateAgentCommand(
  baseCommand: string,
  entry: AgentSettingsEntry,
  agentId?: string,
  options?: GenerateAgentCommandOptions
): string {
  const flags = generateAgentFlags(entry, agentId);
  const parts: string[] = [baseCommand];

  // Add flags, escaping non-flag values
  for (const flag of flags) {
    if (flag.startsWith("-")) {
      parts.push(flag);
    } else {
      parts.push(escapeShellArg(flag));
    }
  }

  // Add initial prompt if provided
  const prompt = options?.initialPrompt?.trim();
  if (prompt) {
    const interactive = options?.interactive ?? true;
    // Normalize multi-line prompts to single line (replace newlines with spaces)
    const normalizedPrompt = prompt.replace(/\r\n/g, " ").replace(/\n/g, " ");
    const escapedPrompt = escapeShellArg(normalizedPrompt);

    switch (agentId) {
      case "claude":
        // Claude: -p for print mode (non-interactive), otherwise just the prompt
        if (!interactive) {
          parts.push("-p");
        }
        parts.push(escapedPrompt);
        break;

      case "gemini":
        // Gemini: -i for interactive with prompt, otherwise just the prompt
        if (interactive) {
          parts.push("-i", escapedPrompt);
        } else {
          parts.push(escapedPrompt);
        }
        break;

      case "codex":
        // Codex: "exec" subcommand for non-interactive, otherwise just the prompt
        if (!interactive) {
          parts.push("exec");
        }
        parts.push(escapedPrompt);
        break;

      default:
        // Generic agent: just append the prompt
        parts.push(escapedPrompt);
    }
  }

  return parts.join(" ");
}
