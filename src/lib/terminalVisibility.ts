import type { TerminalInstance } from "@/store/panelStore";

export function isTerminalOrphaned(terminal: TerminalInstance, worktreeIds: Set<string>): boolean {
  const worktreeId = typeof terminal.worktreeId === "string" ? terminal.worktreeId.trim() : "";
  if (!worktreeId) return false;
  if (worktreeIds.size === 0) return false;
  return !worktreeIds.has(worktreeId);
}

export function isTerminalVisible(
  terminal: TerminalInstance,
  isInTrash: (id: string) => boolean,
  worktreeIds: Set<string>
): boolean {
  if (isInTrash(terminal.id)) return false;
  if (terminal.location === "trash") return false;
  if (terminal.location === "background") return false;
  if (terminal.ephemeral === true) return false;
  if (isTerminalOrphaned(terminal, worktreeIds)) return false;
  return true;
}
