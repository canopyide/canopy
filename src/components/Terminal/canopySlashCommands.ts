import { useTerminalStore } from "@/store/terminalStore";

export type CanopyCommandScope = "canopy";

export interface CanopyCommandContext {
  terminalId: string;
  worktreeId?: string;
}

export interface CanopySlashCommand {
  id: string;
  label: string;
  description: string;
  scope: CanopyCommandScope;
  execute: (ctx: CanopyCommandContext) => void | Promise<void>;
}

export const CANOPY_SLASH_COMMANDS: CanopySlashCommand[] = [
  {
    id: "canopy-restart",
    label: "/restart",
    description: "Restart the current terminal",
    scope: "canopy",
    execute: async (ctx) => {
      await useTerminalStore.getState().restartTerminal(ctx.terminalId);
    },
  },
];

export function getCanopyCommand(input: string): CanopySlashCommand | null {
  const trimmed = input.trim();
  const commandPart = trimmed.split(/\s+/)[0];
  return CANOPY_SLASH_COMMANDS.find((cmd) => cmd.label === commandPart) ?? null;
}

export function isCanopyCommand(input: string): boolean {
  return getCanopyCommand(input) !== null;
}

export function isEscapedCommand(input: string): boolean {
  return input.trimStart().startsWith("\\/");
}

export function unescapeCommand(input: string): string {
  const trimmedStart = input.trimStart();
  if (!trimmedStart.startsWith("\\/")) return input;
  const leading = input.length - trimmedStart.length;
  return input.slice(0, leading) + trimmedStart.slice(1);
}
