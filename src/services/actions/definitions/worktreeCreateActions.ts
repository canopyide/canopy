import type { ActionCallbacks, ActionRegistry } from "../actionTypes";
import { defineAction } from "../defineAction";
import { z } from "zod";
import { worktreeClient } from "@/clients";
import { usePanelStore } from "@/store/panelStore";
import { useWorktreeSelectionStore } from "@/store/worktreeStore";

const WORKTREE_DELETE_TERMINAL_CLOSE_TIMEOUT_MS = 10_000;
const WORKTREE_DELETE_TERMINAL_CLOSE_POLL_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLiveTerminalIdsForWorktree(worktreeId: string): string[] {
  const state = usePanelStore.getState();
  return state.panelIds.filter((id) => {
    const panel = state.panelsById[id];
    return (
      panel?.worktreeId === worktreeId && panel.location !== "trash" && panel.ephemeral !== true
    );
  });
}

async function waitForTerminalsToClose(terminalIds: string[]): Promise<void> {
  if (terminalIds.length === 0) return;
  if (typeof window === "undefined" || !window.electron?.terminal?.getInfo) return;

  const remaining = new Set(terminalIds);
  const deadline = Date.now() + WORKTREE_DELETE_TERMINAL_CLOSE_TIMEOUT_MS;

  while (remaining.size > 0 && Date.now() < deadline) {
    await Promise.all(
      Array.from(remaining, async (terminalId) => {
        try {
          const info = await window.electron.terminal.getInfo(terminalId);
          // hasPty flips before the backend forgets the terminal, which can leave cwd locked on Windows.
          if (info.hasPty === false) return;
        } catch {
          remaining.delete(terminalId);
        }
      })
    );

    if (remaining.size > 0) {
      await sleep(WORKTREE_DELETE_TERMINAL_CLOSE_POLL_MS);
    }
  }

  if (remaining.size > 0) {
    throw new Error(
      `Timed out waiting for ${remaining.size} terminal(s) to close before deleting worktree`
    );
  }
}

async function closeTerminalsForWorktree(worktreeId: string): Promise<void> {
  const terminalIds = getLiveTerminalIdsForWorktree(worktreeId);
  if (terminalIds.length === 0) return;

  const store = usePanelStore.getState();
  terminalIds.forEach((id) => store.removePanel(id));
  await waitForTerminalsToClose(terminalIds);
}

export function registerWorktreeCreateActions(
  actions: ActionRegistry,
  _callbacks: ActionCallbacks
): void {
  actions.set("worktree.quickCreate", () => ({
    id: "worktree.quickCreate",
    title: "Quick Create Worktree",
    description: "Open recipe picker for quick worktree creation",
    category: "worktree",
    kind: "command",
    danger: "safe",
    scope: "renderer",
    keywords: ["new", "branch", "checkout", "recipe"],
    run: async () => {
      useWorktreeSelectionStore.getState().openQuickCreate();
    },
  }));

  actions.set("worktree.createDialog.open", () => ({
    id: "worktree.createDialog.open",
    title: "New Worktree",
    description: "Open dialog to create a new worktree",
    category: "worktree",
    kind: "command",
    danger: "safe",
    scope: "renderer",
    keywords: ["create", "branch", "checkout", "add"],
    run: async () => {
      useWorktreeSelectionStore.getState().openCreateDialog();
    },
  }));

  actions.set("worktree.create", () =>
    defineAction({
      id: "worktree.create",
      title: "Create Worktree",
      description: "Create a new worktree",
      category: "worktree",
      kind: "command",
      danger: "safe",
      scope: "renderer",
      argsSchema: z.object({
        rootPath: z.string().describe("Root path of the git repository"),
        options: z
          .object({
            baseBranch: z.string().describe("Branch to base the worktree on"),
            newBranch: z.string().describe("Name for the new branch"),
            path: z.string().describe("Filesystem path for the new worktree"),
            fromRemote: z.boolean().optional().describe("Whether baseBranch is a remote branch"),
            useExistingBranch: z
              .boolean()
              .optional()
              .describe("Use an existing branch instead of creating a new one"),
            provisionResource: z
              .boolean()
              .optional()
              .describe("Run resource.provision after setup"),
            worktreeMode: z
              .string()
              .optional()
              .describe('Worktree environment mode ("local" or an environment key)'),
          })
          .describe("Worktree creation options"),
      }),
      resultSchema: z.string(),
      run: async ({ rootPath, options }) => {
        const worktreeId = await worktreeClient.create(options, rootPath);
        if (!worktreeId) {
          throw new Error("Failed to create worktree: no worktreeId returned from backend");
        }
        return worktreeId;
      },
    })
  );

  actions.set("worktree.delete", () =>
    defineAction({
      id: "worktree.delete",
      title: "Delete Worktree",
      description: "Delete a worktree",
      category: "worktree",
      kind: "command",
      danger: "confirm",
      scope: "renderer",
      argsSchema: z.object({
        worktreeId: z.string(),
        force: z.boolean().optional(),
        deleteBranch: z.boolean().optional(),
        closeTerminals: z.boolean().optional(),
      }),
      run: async ({ worktreeId, force, deleteBranch, closeTerminals }) => {
        if (closeTerminals) {
          await closeTerminalsForWorktree(worktreeId);
        }
        await worktreeClient.delete(worktreeId, force, deleteBranch);
      },
    })
  );
}
