import type { ActionCallbacks, ActionRegistry } from "../actionTypes";
import type { ActionContext } from "@shared/types/actions";
import { z } from "zod";
import { projectClient } from "@/clients";
import { usePanelStore } from "@/store/panelStore";

const devPreviewTargetSchema = z.object({
  panelId: z.string(),
  projectId: z.string(),
});

export function registerDevServerActions(
  actions: ActionRegistry,
  _callbacks: ActionCallbacks
): void {
  actions.set("devServer.start", () => ({
    id: "devServer.start",
    title: "Open Dev Preview",
    description: "Open a dev preview panel and start the dev server when configured",
    category: "devServer",
    kind: "command",
    danger: "safe",
    scope: "renderer",
    run: async (_args: unknown, ctx: ActionContext) => {
      if (!ctx.projectId) {
        throw new Error("No project is currently open");
      }

      const settings = await projectClient.getSettings(ctx.projectId);
      const devServerCommand = settings?.devServerCommand?.trim();

      const cwd = ctx.activeWorktreePath ?? ctx.projectPath;

      await usePanelStore.getState().addPanel({
        kind: "dev-preview",
        title: "Dev Server",
        cwd,
        worktreeId: ctx.activeWorktreeId,
        location: "grid",
        devCommand: devServerCommand || undefined,
      });
    },
  }));

  // Tier 3 stuck-start remedies (#8276). The dedicated cache-clear and
  // dependency-reinstall recovery tiers land in #8274; until then both
  // remedies degrade to a full dev-server restart, which is the strongest
  // recovery currently available — it kills and respawns the process
  // (freeing a still-bound port) and re-runs the dev command (which
  // re-triggers install for missing-dependency cases).
  actions.set("devPreview.restartClearCache", () => ({
    id: "devPreview.restartClearCache",
    title: "Restart and clear cache",
    description: "Restart the dev server and clear its build cache",
    category: "devServer",
    kind: "command",
    danger: "safe",
    scope: "renderer",
    argsSchema: devPreviewTargetSchema,
    run: async (args: unknown) => {
      const { panelId, projectId } = devPreviewTargetSchema.parse(args);
      await window.electron.devPreview.restart({ panelId, projectId });
    },
  }));

  actions.set("devPreview.reinstall", () => ({
    id: "devPreview.reinstall",
    title: "Reinstall dependencies",
    description: "Reinstall dependencies and restart the dev server",
    category: "devServer",
    kind: "command",
    danger: "safe",
    scope: "renderer",
    argsSchema: devPreviewTargetSchema,
    run: async (args: unknown) => {
      const { panelId, projectId } = devPreviewTargetSchema.parse(args);
      await window.electron.devPreview.restart({ panelId, projectId });
    },
  }));
}
