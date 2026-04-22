import type { PanelExitBehavior, PanelKind } from "@shared/types/panel";
import type { TerminalRestartError } from "@/types";
import type { BuiltInAgentId } from "@shared/config/agentIds";

export type RestartBannerVariant =
  | { type: "auto-restarting" }
  | { type: "exit-error"; exitCode: number }
  | { type: "none" };

export interface RestartBannerInput {
  isExited: boolean;
  exitCode: number | null;
  dismissedRestartPrompt: boolean;
  restartError: TerminalRestartError | undefined;
  isRestarting: boolean;
  isAutoRestarting: boolean;
  exitBehavior: PanelExitBehavior | undefined;
}

export function getRestartBannerVariant(input: RestartBannerInput): RestartBannerVariant {
  if (input.isAutoRestarting) {
    return { type: "auto-restarting" };
  }

  if (
    input.isExited &&
    input.exitCode !== null &&
    input.exitCode !== 0 &&
    input.exitCode !== 130 &&
    !input.dismissedRestartPrompt &&
    !input.restartError &&
    !input.isRestarting &&
    input.exitBehavior !== "restart"
  ) {
    return { type: "exit-error", exitCode: input.exitCode };
  }

  return { type: "none" };
}

export type DegradedBannerVariant =
  | { type: "degraded-mode"; agentId: BuiltInAgentId }
  | { type: "none" };

export interface DegradedBannerInput {
  kind: PanelKind | undefined;
  everDetectedAgent: boolean | undefined;
  detectedAgentId: BuiltInAgentId | undefined;
  dismissedDegradedBanner: boolean;
  isExited: boolean;
  isRestarting: boolean;
}

// Spawn-sealed promotion: a panel spawned as kind="terminal" inherits a
// non-agent PTY (default scrollback, pool-stripped env, missing FORCE_COLOR
// etc.) — those cannot be repaired in-process for the running child, so the
// banner offers a one-click restart that respawns as kind="agent".
export function getDegradedBannerVariant(input: DegradedBannerInput): DegradedBannerVariant {
  if (input.kind !== "terminal") return { type: "none" };
  if (input.everDetectedAgent !== true) return { type: "none" };
  if (!input.detectedAgentId) return { type: "none" };
  if (input.dismissedDegradedBanner) return { type: "none" };
  if (input.isExited) return { type: "none" };
  if (input.isRestarting) return { type: "none" };
  return { type: "degraded-mode", agentId: input.detectedAgentId };
}
