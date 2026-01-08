import { terminalClient } from "@/clients";
import { TerminalRefreshTier } from "@/types";
import type { ManagedTerminal } from "./types";
import { TIER_DOWNGRADE_HYSTERESIS_MS } from "./types";

export interface RendererPolicyDeps {
  getInstance: (id: string) => ManagedTerminal | undefined;
  wakeAndRestore: (id: string) => Promise<boolean>;
}

export class TerminalRendererPolicy {
  private lastBackendTier = new Map<string, "active" | "background">();
  private deps: RendererPolicyDeps;

  constructor(deps: RendererPolicyDeps) {
    this.deps = deps;
  }

  getLastBackendTier(id: string): "active" | "background" | undefined {
    return this.lastBackendTier.get(id);
  }

  setBackendTier(id: string, tier: "active" | "background"): void {
    this.lastBackendTier.set(id, tier);
    terminalClient.setActivityTier(id, tier);
  }

  applyRendererPolicy(id: string, tier: TerminalRefreshTier): void {
    const managed = this.deps.getInstance(id);
    if (!managed) return;

    if (tier === TerminalRefreshTier.FOCUSED || tier === TerminalRefreshTier.BURST) {
      managed.lastActiveTime = Date.now();
    }

    const currentAppliedTier =
      managed.lastAppliedTier ?? managed.getRefreshTier() ?? TerminalRefreshTier.FOCUSED;

    if (tier === currentAppliedTier) {
      if (managed.tierChangeTimer !== undefined) {
        clearTimeout(managed.tierChangeTimer);
        managed.tierChangeTimer = undefined;
        managed.pendingTier = undefined;
      }
      return;
    }

    const isUpgrade = tier < currentAppliedTier;

    if (isUpgrade) {
      if (managed.tierChangeTimer !== undefined) {
        clearTimeout(managed.tierChangeTimer);
        managed.tierChangeTimer = undefined;
      }
      managed.pendingTier = undefined;
      this.applyRendererPolicyImmediate(id, managed, tier);
      return;
    }

    if (managed.pendingTier === tier && managed.tierChangeTimer !== undefined) {
      return;
    }

    if (managed.tierChangeTimer !== undefined) {
      clearTimeout(managed.tierChangeTimer);
    }

    managed.pendingTier = tier;
    managed.tierChangeTimer = window.setTimeout(() => {
      const current = this.deps.getInstance(id);
      if (current && current.pendingTier === tier) {
        this.applyRendererPolicyImmediate(id, current, tier);
        current.pendingTier = undefined;
      }
      if (current) {
        current.tierChangeTimer = undefined;
      }
    }, TIER_DOWNGRADE_HYSTERESIS_MS);
  }

  private applyRendererPolicyImmediate(
    id: string,
    managed: ManagedTerminal,
    tier: TerminalRefreshTier
  ): void {
    managed.lastAppliedTier = tier;

    const backendTier: "active" | "background" =
      tier === TerminalRefreshTier.BACKGROUND ? "background" : "active";
    const prevBackendTier = this.lastBackendTier.get(id) ?? "active";
    this.setBackendTier(id, backendTier);

    if (backendTier === "background" && prevBackendTier === "active") {
      managed.needsWake = true;
    }

    if (backendTier === "active" && prevBackendTier !== "active") {
      if (managed.needsWake !== false) {
        void this.deps
          .wakeAndRestore(id)
          .then((ok) => {
            const current = this.deps.getInstance(id);
            if (!current) return;
            current.needsWake = ok ? false : true;
          })
          .catch(() => {
            const current = this.deps.getInstance(id);
            if (current) current.needsWake = true;
          });
      }
    }
  }

  clearTierState(id: string): void {
    this.lastBackendTier.delete(id);
  }

  dispose(): void {
    this.lastBackendTier.clear();
  }
}
