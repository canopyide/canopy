# Agent Launcher

The `useAgentLauncher` hook provides a unified interface for spawning AI agent terminals (Claude, Gemini, Codex) with optional initial prompts.

## Basic Usage

```tsx
import { useAgentLauncher } from "@/hooks/useAgentLauncher";

function MyComponent() {
  const { launchAgent, availability } = useAgentLauncher();

  // Launch an interactive Claude session
  await launchAgent("claude");

  // Launch Gemini in a specific worktree
  await launchAgent("gemini", { worktreeId: "some-worktree-id" });
}
```

## Launching with Prompts

You can spawn an agent with an initial prompt pre-loaded:

```tsx
// Interactive mode (default) - agent stays open after responding
await launchAgent("claude", {
  prompt: "Explain the authentication flow in this codebase",
  interactive: true,
});

// One-shot mode - agent exits after responding
await launchAgent("claude", {
  prompt: "What is 2 + 2?",
  interactive: false,
});
```

### CLI Command Formats

The hook constructs the appropriate CLI command based on agent type and mode:

| Agent  | Interactive Mode     | One-Shot Mode         |
| ------ | -------------------- | --------------------- |
| Claude | `claude 'prompt'`    | `claude -p 'prompt'`  |
| Gemini | `gemini -i 'prompt'` | `gemini 'prompt'`     |
| Codex  | `codex 'prompt'`     | `codex exec 'prompt'` |

## Shell Escaping

Prompts are automatically escaped for shell safety:

- **POSIX (macOS/Linux)**: Uses single-quote escaping
- **Windows**: Uses double-quote escaping

You don't need to escape prompts yourself. Multi-line prompts and prompts containing special characters (`&&`, `;`, `|`, etc.) are fully supported.

## Options

```typescript
interface LaunchAgentOptions {
  /** Override terminal location (default: "grid") */
  location?: "grid" | "dock";

  /** Override working directory */
  cwd?: string;

  /** Override worktree ID (derives cwd from worktree if provided) */
  worktreeId?: string;

  /** Initial prompt to send to the agent */
  prompt?: string;

  /** Whether to keep session interactive after prompt (default: true) */
  interactive?: boolean;
}
```

## Return Value

```typescript
interface UseAgentLauncherReturn {
  /** Launch an agent terminal, returns terminal ID or null on failure */
  launchAgent: (type: AgentType, options?: LaunchAgentOptions) => Promise<string | null>;

  /** CLI availability status for each agent */
  availability: { claude: boolean; gemini: boolean; codex: boolean };

  /** Whether availability check is in progress */
  isCheckingAvailability: boolean;

  /** Current agent settings */
  agentSettings: AgentSettings | null;

  /** Force refresh settings */
  refreshSettings: () => Promise<void>;
}
```

## Behavior Notes

### Terminal Restart

When a terminal is restarted, the initial prompt is **intentionally not preserved**. The restart spawns a fresh agent session with current settings but without the original prompt. This prevents accidentally re-executing one-time prompts.

### Agent Settings

The hook automatically applies agent settings (model, approval mode, custom flags, etc.) from the user's configuration. These settings are combined with any prompt you provide.

## Future Integration Points

This hook is designed to support future features such as:

- Quick Run bar with natural language queries
- Saved recipes/workflows with pre-defined prompts
- Context injection before prompts
- Multi-agent orchestration
