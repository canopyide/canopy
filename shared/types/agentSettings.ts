// Claude Settings

/** Claude approval mode: default | bypass | yolo */
export type ClaudeApprovalMode = "default" | "bypass" | "yolo";

/**
 * Settings for Claude CLI configuration
 */
export interface ClaudeSettings {
  /** Whether the Claude agent is enabled in the toolbar */
  enabled?: boolean;
  /** Model selection (e.g., "sonnet", "opus", "haiku", or full name) */
  model?: string;
  /** Permission handling mode */
  approvalMode?: ClaudeApprovalMode;
  /** Whitelist of allowed tools (comma-separated when passed to CLI) */
  allowedTools?: string[];
  /** Blacklist of denied tools (comma-separated when passed to CLI) */
  disallowedTools?: string[];
  /** Custom system prompt */
  systemPrompt?: string;
  /** Freeform additional CLI flags */
  customFlags?: string;
}

// Gemini Settings

/** Gemini approval mode: default | auto_edit | yolo */
export type GeminiApprovalMode = "default" | "auto_edit" | "yolo";

/**
 * Settings for Gemini CLI configuration
 */
export interface GeminiSettings {
  /** Whether the Gemini agent is enabled in the toolbar */
  enabled?: boolean;
  /** Model selection */
  model?: string;
  /** Approval mode */
  approvalMode?: GeminiApprovalMode;
  /** Auto-accept all actions (⚠️ dangerous) - shortcut for yolo mode */
  yolo?: boolean;
  /** Run in sandbox mode */
  sandbox?: boolean;
  /** Freeform additional CLI flags */
  customFlags?: string;
}

// Codex Settings

/** Codex sandbox: read-only | workspace-write | danger-full-access */
export type CodexSandboxPolicy = "read-only" | "workspace-write" | "danger-full-access";

/** Codex approval: untrusted | on-failure | on-request | never */
export type CodexApprovalPolicy = "untrusted" | "on-failure" | "on-request" | "never";

/**
 * Settings for Codex CLI configuration
 */
export interface CodexSettings {
  /** Whether the Codex agent is enabled in the toolbar */
  enabled?: boolean;
  /** Model selection (e.g., "o3", "o4-mini") */
  model?: string;
  /** Sandbox policy */
  sandbox?: CodexSandboxPolicy;
  /** Approval policy for shell commands */
  approvalPolicy?: CodexApprovalPolicy;
  /** Low-friction sandboxed execution */
  fullAuto?: boolean;
  /** Skip all checks (⚠️ EXTREMELY DANGEROUS) */
  dangerouslyBypassApprovalsAndSandbox?: boolean;
  /** Enable web search */
  search?: boolean;
  /** Freeform additional CLI flags */
  customFlags?: string;
}

// Unified Agent Settings

/** Complete agent settings */
export interface AgentSettings {
  claude: ClaudeSettings;
  gemini: GeminiSettings;
  codex: CodexSettings;
}

/**
 * Default agent settings with safe values
 */
export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  claude: {
    enabled: true,
    model: "",
    approvalMode: "default",
    allowedTools: [],
    disallowedTools: [],
    systemPrompt: "",
    customFlags: "",
  },
  gemini: {
    enabled: true,
    model: "",
    approvalMode: "default",
    yolo: false,
    sandbox: false,
    customFlags: "",
  },
  codex: {
    enabled: true,
    model: "",
    sandbox: "workspace-write",
    approvalPolicy: "untrusted",
    fullAuto: false,
    dangerouslyBypassApprovalsAndSandbox: false,
    search: false,
    customFlags: "",
  },
};

// CLI Flag Generation

/** Generate Claude CLI flags from settings */
export function generateClaudeFlags(settings: ClaudeSettings): string[] {
  const flags: string[] = [];

  if (settings.model) {
    flags.push("--model", settings.model);
  }

  if (settings.approvalMode === "yolo") {
    flags.push("--dangerously-skip-permissions");
  } else if (settings.approvalMode === "bypass") {
    flags.push("--permission-mode", "bypassPermissions");
  }

  if (settings.allowedTools && settings.allowedTools.length > 0) {
    flags.push("--allowed-tools", settings.allowedTools.join(","));
  }

  if (settings.disallowedTools && settings.disallowedTools.length > 0) {
    flags.push("--disallowed-tools", settings.disallowedTools.join(","));
  }

  if (settings.systemPrompt) {
    flags.push("--system-prompt", settings.systemPrompt);
  }

  // Append custom flags (split on spaces, basic parsing)
  if (settings.customFlags) {
    const trimmed = settings.customFlags.trim();
    if (trimmed) {
      flags.push(...trimmed.split(/\s+/));
    }
  }

  return flags;
}

/** Generate Gemini CLI flags from settings */
export function generateGeminiFlags(settings: GeminiSettings): string[] {
  const flags: string[] = [];

  if (settings.model) {
    flags.push("--model", settings.model);
  }

  if (settings.yolo || settings.approvalMode === "yolo") {
    flags.push("--yolo");
  } else if (settings.approvalMode && settings.approvalMode !== "default") {
    flags.push("--approval-mode", settings.approvalMode);
  }

  if (settings.sandbox) {
    flags.push("--sandbox");
  }

  // Append custom flags
  if (settings.customFlags) {
    const trimmed = settings.customFlags.trim();
    if (trimmed) {
      flags.push(...trimmed.split(/\s+/));
    }
  }

  return flags;
}

/** Generate Codex CLI flags from settings */
export function generateCodexFlags(settings: CodexSettings): string[] {
  const flags: string[] = [];

  if (settings.model) {
    flags.push("--model", settings.model);
  }

  if (settings.dangerouslyBypassApprovalsAndSandbox) {
    flags.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    if (settings.sandbox) {
      flags.push("--sandbox", settings.sandbox);
    }

    if (settings.approvalPolicy) {
      flags.push("--ask-for-approval", settings.approvalPolicy);
    }

    if (settings.fullAuto) {
      flags.push("--full-auto");
    }
  }

  if (settings.search) {
    flags.push("--search");
  }

  // Append custom flags
  if (settings.customFlags) {
    const trimmed = settings.customFlags.trim();
    if (trimmed) {
      flags.push(...trimmed.split(/\s+/));
    }
  }

  return flags;
}
