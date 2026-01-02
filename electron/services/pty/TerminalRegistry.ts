import { events } from "../events.js";
import type { TerminalSnapshot } from "./types.js";
import { TRASH_TTL_MS } from "./types.js";
import type { TerminalProcess } from "./TerminalProcess.js";

/**
 * Manages the Map of terminal instances, trash/restore functionality, and project filtering.
 */
export class TerminalRegistry {
  private terminals: Map<string, TerminalProcess> = new Map();
  private trashTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private lastKnownProjectId: string | null = null;

  constructor(private readonly trashTtlMs: number = TRASH_TTL_MS) {}

  add(id: string, terminal: TerminalProcess): void {
    this.terminals.set(id, terminal);
  }

  get(id: string): TerminalProcess | undefined {
    return this.terminals.get(id);
  }

  delete(id: string): void {
    this.terminals.delete(id);
  }

  has(id: string): boolean {
    return this.terminals.has(id);
  }

  getAll(): TerminalProcess[] {
    return Array.from(this.terminals.values());
  }

  getAllIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  size(): number {
    return this.terminals.size;
  }

  entries(): IterableIterator<[string, TerminalProcess]> {
    return this.terminals.entries();
  }

  /**
   * Move a terminal to the trash with TTL.
   * Idempotent - calling multiple times has no effect.
   */
  trash(id: string, onExpire: (id: string) => void): void {
    if (this.trashTimeouts.has(id)) {
      return;
    }

    if (!this.terminals.has(id)) {
      console.warn(`[TerminalRegistry] Cannot trash non-existent terminal: ${id}`);
      return;
    }

    const timeout = setTimeout(() => {
      console.log(`[TerminalRegistry] Auto-killing trashed terminal after TTL: ${id}`);
      onExpire(id);
      this.trashTimeouts.delete(id);
    }, this.trashTtlMs);

    this.trashTimeouts.set(id, timeout);
    events.emit("terminal:trashed", { id, expiresAt: Date.now() + this.trashTtlMs });
  }

  /**
   * Restore a terminal from the trash.
   * Returns true if terminal was in trash and restored.
   */
  restore(id: string): boolean {
    const timeout = this.trashTimeouts.get(id);

    if (timeout) {
      clearTimeout(timeout);
      this.trashTimeouts.delete(id);

      if (this.terminals.has(id)) {
        console.log(`[TerminalRegistry] Restored terminal from trash: ${id}`);
        events.emit("terminal:restored", { id });
        return true;
      }
    }

    return false;
  }

  isInTrash(id: string): boolean {
    return this.trashTimeouts.has(id);
  }

  /**
   * Clear a trash timeout (called during kill).
   */
  clearTrashTimeout(id: string): void {
    const timeout = this.trashTimeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.trashTimeouts.delete(id);
    }
  }

  getForProject(projectId: string): string[] {
    const result: string[] = [];
    for (const [id, terminal] of this.terminals) {
      const info = terminal.getInfo();
      // Only match terminals that explicitly belong to this project.
      // Don't use lastKnownProjectId fallback - terminals without projectId
      // should not be counted for any project in stats queries.
      if (info.projectId === projectId) {
        result.push(id);
      }
    }
    return result;
  }

  getProjectStats(projectId: string): {
    terminalCount: number;
    processIds: number[];
    terminalTypes: Record<string, number>;
  } {
    const projectTerminals = Array.from(this.terminals.values()).filter((t) => {
      const info = t.getInfo();
      // Only count terminals that explicitly belong to this project.
      // Don't use lastKnownProjectId fallback for stats - this prevents
      // background project terminals from being misattributed to the active project.
      return info.projectId === projectId;
    });

    const processIds = projectTerminals
      .map((t) => t.getPtyProcess().pid)
      .filter((pid): pid is number => pid !== undefined);

    const terminalTypes = projectTerminals.reduce(
      (acc, t) => {
        const info = t.getInfo();
        const type = info.type || "terminal";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      terminalCount: projectTerminals.length,
      processIds,
      terminalTypes,
    };
  }

  /**
   * Get snapshot of terminal state for AI/heuristic analysis.
   */
  getSnapshot(id: string): TerminalSnapshot | null {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return null;
    }
    return terminal.getSnapshot();
  }

  getAllSnapshots(): TerminalSnapshot[] {
    return Array.from(this.terminals.keys())
      .map((id) => this.getSnapshot(id))
      .filter((snapshot): snapshot is TerminalSnapshot => snapshot !== null);
  }

  markChecked(id: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.markChecked();
    }
  }

  /**
   * Set the last known project ID for legacy terminal handling.
   */
  setLastKnownProjectId(projectId: string): void {
    this.lastKnownProjectId = projectId;
  }

  getLastKnownProjectId(): string | null {
    return this.lastKnownProjectId;
  }

  /**
   * Check if terminal belongs to a project (using fallback logic).
   */
  terminalBelongsToProject(terminal: TerminalProcess, projectId: string): boolean {
    const info = terminal.getInfo();
    const terminalProjectId = info.projectId || this.lastKnownProjectId;
    return terminalProjectId === projectId;
  }

  dispose(): void {
    for (const timeout of this.trashTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.trashTimeouts.clear();
    this.terminals.clear();
  }
}
