/**
 * Agent Settings Type Definitions
 *
 * Types for configuring AI agent CLI options (Claude, Gemini, Codex).
 * These settings allow users to customize agent behavior through CLI flags
 * like approval modes, models, sandbox policies, and other advanced options.
 */

// ============================================================================
// Claude Settings
// ============================================================================

/**
 * Permission/approval mode for Claude CLI
 * - "default": Standard permission prompts
 * - "bypass": Bypass permission checks (--permission-mode bypassPermissions)
 * - "yolo": Don't ask for permissions (--permission-mode dontAsk)
 */
export type ClaudeApprovalMode = "default" | "bypass" | "yolo";

/**
 * Settings for Claude CLI configuration
 */
export interface ClaudeSettings {
  /** Model selection (e.g., "sonnet", "opus", "haiku", or full name) */
  model?: string;
  /** Permission handling mode */
  approvalMode?: ClaudeApprovalMode;
  /** Skip all permission checks (⚠️ dangerous) */
  dangerouslySkipPermissions?: boolean;
  /** Whitelist of allowed tools (comma-separated when passed to CLI) */
  allowedTools?: string[];
  /** Blacklist of denied tools (comma-separated when passed to CLI) */
  disallowedTools?: string[];
  /** Custom system prompt */
  systemPrompt?: string;
  /** Freeform additional CLI flags */
  customFlags?: string;
}

// ============================================================================
// Gemini Settings
// ============================================================================

/**
 * Approval mode for Gemini CLI
 * - "default": Standard approval prompts
 * - "auto_edit": Auto-approve edits
 * - "yolo": Auto-accept all actions (⚠️ dangerous)
 */
export type GeminiApprovalMode = "default" | "auto_edit" | "yolo";

/**
 * Settings for Gemini CLI configuration
 */
export interface GeminiSettings {
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

// ============================================================================
// Codex Settings
// ============================================================================

/**
 * Sandbox policy for Codex CLI
 * - "read-only": Can only read files
 * - "workspace-write": Can write to workspace
 * - "danger-full-access": Full filesystem access (⚠️ dangerous)
 */
export type CodexSandboxPolicy = "read-only" | "workspace-write" | "danger-full-access";

/**
 * Approval policy for Codex CLI
 * - "untrusted": Requires approval for all commands
 * - "on-failure": Only requires approval on failures
 * - "on-request": Only when explicitly requested
 * - "never": Never ask for approval
 */
export type CodexApprovalPolicy = "untrusted" | "on-failure" | "on-request" | "never";

/**
 * Settings for Codex CLI configuration
 */
export interface CodexSettings {
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

// ============================================================================
// Unified Agent Settings
// ============================================================================

/**
 * Complete agent settings configuration
 */
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
    model: "",
    approvalMode: "default",
    dangerouslySkipPermissions: false,
    allowedTools: [],
    disallowedTools: [],
    systemPrompt: "",
    customFlags: "",
  },
  gemini: {
    model: "",
    approvalMode: "default",
    yolo: false,
    sandbox: false,
    customFlags: "",
  },
  codex: {
    model: "",
    sandbox: "workspace-write",
    approvalPolicy: "untrusted",
    fullAuto: false,
    dangerouslyBypassApprovalsAndSandbox: false,
    search: false,
    customFlags: "",
  },
};

// ============================================================================
// CLI Flag Generation
// ============================================================================

/**
 * Generate CLI flags for Claude from settings
 */
export function generateClaudeFlags(settings: ClaudeSettings): string[] {
  const flags: string[] = [];

  if (settings.model) {
    flags.push("--model", settings.model);
  }

  if (settings.dangerouslySkipPermissions) {
    flags.push("--dangerously-skip-permissions");
  } else if (settings.approvalMode === "bypass") {
    flags.push("--permission-mode", "bypassPermissions");
  } else if (settings.approvalMode === "yolo") {
    flags.push("--permission-mode", "dontAsk");
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

/**
 * Generate CLI flags for Gemini from settings
 */
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

/**
 * Generate CLI flags for Codex from settings
 */
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
