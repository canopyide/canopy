export type AgentInstallOS = "macos" | "windows" | "linux" | "generic";

export interface AgentInstallBlock {
  label?: string;
  steps?: string[];
  commands?: string[];
  notes?: string[];
}

export interface AgentInstallHelp {
  docsUrl?: string;
  byOs?: Partial<Record<AgentInstallOS, AgentInstallBlock[]>>;
  troubleshooting?: string[];
}

export interface AgentConfig {
  id: string;
  name: string;
  command: string;
  color: string;
  iconId: string;
  supportsContextInjection: boolean;
  shortcut?: string | null;
  tooltip?: string;
  usageUrl?: string;
  install?: AgentInstallHelp;
  capabilities?: {
    scrollback?: number;
    blockAltScreen?: boolean;
    blockMouseReporting?: boolean;
    blockScrollRegion?: boolean;
    blockClearScreen?: boolean;
    blockCursorToTop?: boolean;
  };
}

export const AGENT_REGISTRY: Record<string, AgentConfig> = {
  claude: {
    id: "claude",
    name: "Claude",
    command: "claude",
    color: "#CC785C",
    iconId: "claude",
    supportsContextInjection: true,
    shortcut: "Cmd/Ctrl+Alt+C",
    usageUrl: "https://claude.ai/settings/usage",
    install: {
      docsUrl: "https://docs.anthropic.com/en/docs/agents/claude-cli",
      byOs: {
        macos: [
          {
            label: "Homebrew",
            commands: ["brew install anthropics/tap/claude"],
          },
          {
            label: "npm",
            commands: ["npm install -g @anthropic-ai/claude-cli"],
          },
        ],
        windows: [
          {
            label: "npm",
            commands: ["npm install -g @anthropic-ai/claude-cli"],
          },
        ],
        linux: [
          {
            label: "npm",
            commands: ["npm install -g @anthropic-ai/claude-cli"],
          },
        ],
      },
      troubleshooting: [
        "Restart Canopy after installation to re-check PATH.",
        "If installed but not found, ensure the install directory is in your system PATH.",
      ],
    },
    capabilities: {
      scrollback: 10000,
      blockAltScreen: false,
      blockMouseReporting: false,
      blockScrollRegion: false,
      blockClearScreen: false,
      blockCursorToTop: false,
    },
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    command: "gemini",
    color: "#4285F4",
    iconId: "gemini",
    supportsContextInjection: true,
    shortcut: "Cmd/Ctrl+Alt+G",
    tooltip: "quick exploration",
    install: {
      docsUrl: "https://ai.google.dev/gemini-api/docs/cli",
      byOs: {
        macos: [
          {
            label: "npm",
            commands: ["npm install -g @google/generative-ai-cli"],
          },
        ],
        windows: [
          {
            label: "npm",
            commands: ["npm install -g @google/generative-ai-cli"],
          },
        ],
        linux: [
          {
            label: "npm",
            commands: ["npm install -g @google/generative-ai-cli"],
          },
        ],
      },
      troubleshooting: [
        "Restart Canopy after installation to re-check PATH.",
        "Run 'gemini auth login' after installation to authenticate.",
      ],
    },
    capabilities: {
      scrollback: 10000,
      blockAltScreen: false,
      blockMouseReporting: false,
      blockScrollRegion: false,
      blockClearScreen: false,
      blockCursorToTop: false,
    },
  },
  codex: {
    id: "codex",
    name: "Codex",
    command: "codex",
    color: "#e4e4e7",
    iconId: "codex",
    supportsContextInjection: true,
    shortcut: "Cmd/Ctrl+Alt+X",
    tooltip: "careful, methodical runs",
    usageUrl: "https://chatgpt.com/codex/settings/usage",
    install: {
      docsUrl: "https://github.com/openai/codex-cli",
      byOs: {
        macos: [
          {
            label: "Homebrew",
            commands: ["brew install openai/tap/codex"],
          },
          {
            label: "npm",
            commands: ["npm install -g @openai/codex-cli"],
          },
        ],
        windows: [
          {
            label: "npm",
            commands: ["npm install -g @openai/codex-cli"],
          },
        ],
        linux: [
          {
            label: "npm",
            commands: ["npm install -g @openai/codex-cli"],
          },
        ],
      },
      troubleshooting: [
        "Restart Canopy after installation to re-check PATH.",
        "Run 'codex auth login' after installation to authenticate.",
      ],
    },
    capabilities: {
      scrollback: 10000,
      blockAltScreen: false,
      blockMouseReporting: false,
      blockScrollRegion: false,
      blockClearScreen: false,
      blockCursorToTop: false,
    },
  },
};

export function getAgentIds(): string[] {
  return Object.keys(AGENT_REGISTRY);
}

export function getAgentConfig(agentId: string): AgentConfig | undefined {
  return AGENT_REGISTRY[agentId];
}

export function isRegisteredAgent(agentId: string): boolean {
  return agentId in AGENT_REGISTRY;
}
