import type { TerminalInstance } from "@/store";
import type { AddPanelOptions } from "@/store/slices/panelRegistry/types";
import type { TabGroupLocation } from "@/types";
import { generateAgentCommand } from "@shared/types";
import { getAgentConfig, isRegisteredAgent } from "@/config/agents";
import { agentSettingsClient, systemClient } from "@/clients";

/**
 * Generate the startup command for a panel being duplicated.
 * For agent panels, re-generates the command from current settings.
 * For all others, copies the existing command.
 */
async function resolveCommandForPanel(panel: TerminalInstance): Promise<string | undefined> {
  if (panel.agentId && isRegisteredAgent(panel.agentId)) {
    const agentConfig = getAgentConfig(panel.agentId);
    if (agentConfig) {
      try {
        const [agentSettings, tmpDir] = await Promise.all([
          agentSettingsClient.get(),
          systemClient.getTmpDir().catch(() => ""),
        ]);
        const entry = agentSettings?.agents?.[panel.agentId] ?? {};
        const clipboardDirectory = tmpDir ? `${tmpDir}/daintree-clipboard` : undefined;
        return generateAgentCommand(agentConfig.command, entry, panel.agentId, {
          interactive: true,
          clipboardDirectory,
          modelId: panel.agentModelId,
        });
      } catch (error) {
        console.warn(
          `Failed to get agent settings for ${panel.agentId}, using existing command:`,
          error
        );
        return panel.command ?? agentConfig.command;
      }
    }
  }
  return panel.command;
}

function buildBrowserOptions(panel: TerminalInstance) {
  return {
    browserUrl: panel.browserUrl,
    browserConsoleOpen: panel.browserConsoleOpen,
  };
}

function buildNotesOptions(panel: TerminalInstance) {
  return {
    notePath: panel.notePath,
    noteId: panel.noteId,
    scope: panel.scope,
    createdAt: Date.now(),
  };
}

function buildDevPreviewOptions(panel: TerminalInstance) {
  return {
    devCommand: panel.devCommand,
    browserUrl: panel.browserUrl,
    devPreviewConsoleOpen: panel.devPreviewConsoleOpen,
  };
}

/**
 * Build a synchronous snapshot of a panel's config for last-closed fallback.
 * Copies the same fields as buildPanelDuplicateOptions but preserves the
 * existing command verbatim (no async agent command regeneration).
 * Does not include location — callers inject it at use time.
 *
 * Called synchronously from `trashPanel` / `trashPanelGroup` — must not throw.
 * If an agent panel has missing `command` or `agentId` (stale historical data),
 * falls back to a terminal-kind snapshot so reopen doesn't break.
 */
export function buildPanelSnapshotOptions(panel: TerminalInstance): AddPanelOptions {
  const kind = panel.kind ?? "terminal";

  if (kind === "agent") {
    if (!panel.agentId || !panel.command) {
      return {
        kind: "terminal",
        type: panel.type,
        agentId: panel.agentId,
        cwd: panel.cwd || "",
        worktreeId: panel.worktreeId,
        exitBehavior: panel.exitBehavior,
        isInputLocked: panel.isInputLocked,
        agentModelId: panel.agentModelId,
        agentLaunchFlags: panel.agentLaunchFlags ? [...panel.agentLaunchFlags] : undefined,
        command: panel.command,
      };
    }
    return {
      kind: "agent",
      type: panel.type,
      agentId: panel.agentId,
      command: panel.command,
      cwd: panel.cwd || "",
      worktreeId: panel.worktreeId,
      exitBehavior: panel.exitBehavior,
      isInputLocked: panel.isInputLocked,
      agentModelId: panel.agentModelId,
      agentLaunchFlags: panel.agentLaunchFlags ? [...panel.agentLaunchFlags] : undefined,
    };
  }

  if (kind === "browser") {
    return {
      kind: "browser",
      type: panel.type,
      cwd: panel.cwd || "",
      worktreeId: panel.worktreeId,
      exitBehavior: panel.exitBehavior,
      isInputLocked: panel.isInputLocked,
      ...buildBrowserOptions(panel),
    };
  }

  if (kind === "notes") {
    return {
      kind: "notes",
      type: panel.type,
      cwd: panel.cwd || "",
      worktreeId: panel.worktreeId,
      exitBehavior: panel.exitBehavior,
      isInputLocked: panel.isInputLocked,
      ...buildNotesOptions(panel),
    };
  }

  if (kind === "dev-preview") {
    return {
      kind: "dev-preview",
      type: panel.type,
      cwd: panel.cwd || "",
      worktreeId: panel.worktreeId,
      exitBehavior: panel.exitBehavior,
      isInputLocked: panel.isInputLocked,
      ...buildDevPreviewOptions(panel),
    };
  }

  return {
    kind: "terminal",
    type: panel.type,
    agentId: panel.agentId,
    cwd: panel.cwd || "",
    worktreeId: panel.worktreeId,
    exitBehavior: panel.exitBehavior,
    isInputLocked: panel.isInputLocked,
    agentModelId: panel.agentModelId,
    agentLaunchFlags: panel.agentLaunchFlags ? [...panel.agentLaunchFlags] : undefined,
    command: panel.command,
  };
}

/**
 * Build the full AddPanelOptions needed to duplicate a panel.
 * Callers pass the target location since it may differ from the source.
 * Target location must be "grid" or "dock" (not "trash").
 *
 * Throws when an agent panel cannot be duplicated because its `command` or
 * `agentId` is unresolvable — callers already wrap this in try/catch.
 */
export async function buildPanelDuplicateOptions(
  sourcePanel: TerminalInstance,
  targetLocation: TabGroupLocation
): Promise<AddPanelOptions> {
  const kind = sourcePanel.kind ?? "terminal";
  const command = await resolveCommandForPanel(sourcePanel);

  if (kind === "agent") {
    if (!sourcePanel.agentId || !command) {
      throw new Error(
        `Cannot duplicate agent panel: ${!sourcePanel.agentId ? "agentId" : "command"} is missing`
      );
    }
    return {
      kind: "agent",
      type: sourcePanel.type,
      agentId: sourcePanel.agentId,
      command,
      cwd: sourcePanel.cwd || "",
      worktreeId: sourcePanel.worktreeId,
      location: targetLocation,
      exitBehavior: sourcePanel.exitBehavior,
      isInputLocked: sourcePanel.isInputLocked,
      agentModelId: sourcePanel.agentModelId,
      agentLaunchFlags: sourcePanel.agentLaunchFlags,
    };
  }

  if (kind === "browser") {
    return {
      kind: "browser",
      type: sourcePanel.type,
      cwd: sourcePanel.cwd || "",
      worktreeId: sourcePanel.worktreeId,
      location: targetLocation,
      exitBehavior: sourcePanel.exitBehavior,
      isInputLocked: sourcePanel.isInputLocked,
      ...buildBrowserOptions(sourcePanel),
    };
  }

  if (kind === "notes") {
    return {
      kind: "notes",
      type: sourcePanel.type,
      cwd: sourcePanel.cwd || "",
      worktreeId: sourcePanel.worktreeId,
      location: targetLocation,
      exitBehavior: sourcePanel.exitBehavior,
      isInputLocked: sourcePanel.isInputLocked,
      ...buildNotesOptions(sourcePanel),
    };
  }

  if (kind === "dev-preview") {
    return {
      kind: "dev-preview",
      type: sourcePanel.type,
      cwd: sourcePanel.cwd || "",
      worktreeId: sourcePanel.worktreeId,
      location: targetLocation,
      exitBehavior: sourcePanel.exitBehavior,
      isInputLocked: sourcePanel.isInputLocked,
      ...buildDevPreviewOptions(sourcePanel),
    };
  }

  return {
    kind: "terminal",
    type: sourcePanel.type,
    agentId: sourcePanel.agentId,
    cwd: sourcePanel.cwd || "",
    worktreeId: sourcePanel.worktreeId,
    location: targetLocation,
    exitBehavior: sourcePanel.exitBehavior,
    isInputLocked: sourcePanel.isInputLocked,
    agentModelId: sourcePanel.agentModelId,
    agentLaunchFlags: sourcePanel.agentLaunchFlags,
    command,
  };
}
