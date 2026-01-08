import { terminalClient } from "@/clients";
import type { ManagedTerminal } from "./types";
import { INCREMENTAL_RESTORE_CONFIG } from "./types";

const WAKE_RATE_LIMIT_MS = 1000;

export interface WakeManagerDeps {
  getInstance: (id: string) => ManagedTerminal | undefined;
  hasInstance: (id: string) => boolean;
  restoreFromSerialized: (id: string, state: string) => boolean;
  restoreFromSerializedIncremental: (id: string, state: string) => Promise<boolean>;
}

export class TerminalWakeManager {
  private lastWakeTime = new Map<string, number>();
  private deps: WakeManagerDeps;

  constructor(deps: WakeManagerDeps) {
    this.deps = deps;
  }

  async wakeAndRestore(id: string): Promise<boolean> {
    const managed = this.deps.getInstance(id);
    if (!managed) return false;

    const { state } = await terminalClient.wake(id);
    if (!state) return false;

    if (state.length > INCREMENTAL_RESTORE_CONFIG.indicatorThresholdBytes) {
      await this.deps.restoreFromSerializedIncremental(id, state);
    } else {
      this.deps.restoreFromSerialized(id, state);
    }

    if (this.deps.getInstance(id) === managed) {
      managed.terminal.refresh(0, managed.terminal.rows - 1);
    }
    return true;
  }

  wake(id: string): void {
    if (!this.deps.hasInstance(id)) {
      return;
    }

    const now = Date.now();
    const lastWake = this.lastWakeTime.get(id) ?? 0;

    if (now - lastWake < WAKE_RATE_LIMIT_MS) {
      return;
    }

    this.lastWakeTime.set(id, now);
    void this.wakeAndRestore(id);
  }

  clearWakeState(id: string): void {
    this.lastWakeTime.delete(id);
  }

  dispose(): void {
    this.lastWakeTime.clear();
  }
}
