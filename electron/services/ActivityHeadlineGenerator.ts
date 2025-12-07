import type { TerminalActivityStatus, TerminalTaskType } from "../../shared/types/terminal.js";
import type { AgentState, TerminalType } from "../../shared/types/domain.js";

export interface ActivityContext {
  terminalId: string;
  terminalType?: TerminalType;
  agentId?: string;
  agentState?: AgentState;
  lastCommand?: string;
  activity?: "busy" | "idle";
}

export interface GeneratedActivity {
  headline: string;
  status: TerminalActivityStatus;
  type: TerminalTaskType;
}

const COMMAND_PATTERNS: Array<{ pattern: RegExp; headline: string }> = [
  {
    pattern: /^npm\s+install|^npm\s+i\b|^yarn\s+install|^yarn\s*$|^pnpm\s+install|^bun\s+install/i,
    headline: "Installing dependencies",
  },
  {
    pattern: /^npm\s+test|^yarn\s+test|^pnpm\s+test|^jest|^vitest|^mocha/i,
    headline: "Running tests",
  },
  {
    pattern: /^npm\s+run\s+build|^yarn\s+build|^pnpm\s+build|^vite\s+build|^webpack/i,
    headline: "Building project",
  },
  { pattern: /^npm\s+run\s+dev|^yarn\s+dev|^pnpm\s+dev|^vite/i, headline: "Starting dev server" },
  { pattern: /^npm\s+run\s+lint|^eslint|^prettier/i, headline: "Running linter" },
  { pattern: /^git\s+clone/i, headline: "Cloning repository" },
  { pattern: /^git\s+push/i, headline: "Pushing changes" },
  { pattern: /^git\s+pull/i, headline: "Pulling changes" },
  { pattern: /^git\s+fetch/i, headline: "Fetching updates" },
  { pattern: /^git\s+checkout|^git\s+switch/i, headline: "Switching branch" },
  { pattern: /^git\s+merge/i, headline: "Merging changes" },
  { pattern: /^git\s+rebase/i, headline: "Rebasing branch" },
  { pattern: /^docker\s+build/i, headline: "Building image" },
  { pattern: /^docker\s+pull/i, headline: "Pulling image" },
  { pattern: /^docker\s+run|^docker-compose\s+up/i, headline: "Running container" },
  { pattern: /^cargo\s+build/i, headline: "Compiling Rust" },
  { pattern: /^cargo\s+test/i, headline: "Running Rust tests" },
  { pattern: /^go\s+build/i, headline: "Building Go" },
  { pattern: /^go\s+test/i, headline: "Running Go tests" },
  { pattern: /^pip\s+install|^poetry\s+install/i, headline: "Installing packages" },
  { pattern: /^python|^python3/i, headline: "Running Python" },
  { pattern: /^node\s+/i, headline: "Running Node.js" },
  { pattern: /^tsc\b/i, headline: "Type checking" },
  { pattern: /^make\b/i, headline: "Running make" },
  { pattern: /^curl\s+|^wget\s+/i, headline: "Downloading" },
];

export class ActivityHeadlineGenerator {
  generate(context: ActivityContext): GeneratedActivity {
    // Agent terminals use agent state
    if (context.agentId) {
      return this.generateFromAgentState(context.agentState);
    }

    // Shell terminals use activity + command detection
    return this.generateFromShellActivity(context);
  }

  private generateFromAgentState(agentState?: AgentState): GeneratedActivity {
    switch (agentState) {
      case "working":
        return {
          headline: "Agent working",
          status: "working",
          type: "interactive",
        };
      case "waiting":
        return {
          headline: "Waiting for input",
          status: "waiting",
          type: "interactive",
        };
      case "completed":
        return {
          headline: "Completed",
          status: "success",
          type: "idle",
        };
      case "failed":
        return {
          headline: "Failed",
          status: "failure",
          type: "idle",
        };
      case "idle":
      default:
        return {
          headline: "Idle",
          status: "success",
          type: "idle",
        };
    }
  }

  private generateFromShellActivity(context: ActivityContext): GeneratedActivity {
    const { activity, lastCommand } = context;

    if (activity === "busy") {
      const headline = lastCommand ? this.getCommandHeadline(lastCommand) : "Command running";

      return {
        headline,
        status: "working",
        type: "background",
      };
    }

    // Idle state
    return {
      headline: "Idle",
      status: "success",
      type: "idle",
    };
  }

  private getCommandHeadline(command: string): string {
    const trimmedCommand = command.trim();

    for (const { pattern, headline } of COMMAND_PATTERNS) {
      if (pattern.test(trimmedCommand)) {
        return headline;
      }
    }

    // Generic fallback: extract the base command
    const parts = trimmedCommand.split(/\s+/);
    const baseCommand = parts[0]?.replace(/^\.\//, "") || "command";

    // Capitalize first letter
    const capitalizedCommand = baseCommand.charAt(0).toUpperCase() + baseCommand.slice(1);

    return `Running ${capitalizedCommand}`;
  }
}
