import { WebglAddon } from "@xterm/addon-webgl";
import { TerminalRefreshTier } from "@/types";
import { detectHardware, HardwareProfile } from "@/utils/hardwareDetection";
import {
  ManagedTerminal,
  MAX_WEBGL_CONTEXTS,
  MAX_WEBGL_RECOVERY_ATTEMPTS,
  WEBGL_DISPOSE_GRACE_MS,
} from "./types";

const TERMINAL_COUNT_THRESHOLD = 20;
const BUDGET_SCALE_FACTOR = 0.5;
const MIN_WEBGL_BUDGET = 2;

type TerminalGetter = (id: string) => ManagedTerminal | undefined;
type TerminalIterator = (cb: (t: ManagedTerminal, id: string) => void) => void;

export class WebGLContextManager {
  private webglLru: string[] = [];
  private webglRecoverySeq = 0;
  private hardwareProfile: HardwareProfile;

  constructor(
    private readonly getTerminal: TerminalGetter,
    private readonly forEachTerminal: TerminalIterator
  ) {
    this.hardwareProfile = detectHardware();
    console.log("[WebGLContextManager] Hardware profile:", this.hardwareProfile);
  }

  acquire(id: string, managed: ManagedTerminal): void {
    if (managed.hasWebglError || managed.webglRecoveryAttempts >= MAX_WEBGL_RECOVERY_ATTEMPTS) {
      return;
    }

    this.enforceWebglBudget();

    let activeCount = 0;
    this.forEachTerminal((t) => {
      if (t.webglAddon) activeCount++;
    });

    const effectiveBudget = Math.min(this.getWebGLBudget(), MAX_WEBGL_CONTEXTS);

    if (activeCount >= effectiveBudget) {
      return;
    }

    try {
      const webglAddon = new WebglAddon();
      const token = ++this.webglRecoverySeq;
      managed.webglRecoveryToken = token;

      webglAddon.onContextLoss(() => {
        console.warn(`[WebGLContextManager] WebGL context lost for ${id}`);
        webglAddon.dispose();
        managed.webglAddon = undefined;
        this.webglLru = this.webglLru.filter((existing) => existing !== id);
        managed.hasWebglError = true;

        const attempt = managed.webglRecoveryAttempts + 1;
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);

        setTimeout(() => {
          const currentManaged = this.getTerminal(id);
          if (!currentManaged || currentManaged.webglRecoveryToken !== token) return;

          if (!currentManaged.isVisible) {
            console.log(`[WebGLContextManager] Deferring WebGL recovery for ${id} (hidden)`);
            currentManaged.webglRecoveryAttempts = 0;
            currentManaged.hasWebglError = false;
            return;
          }

          requestAnimationFrame(() => {
            const retryManaged = this.getTerminal(id);
            if (
              !retryManaged ||
              retryManaged.webglRecoveryToken !== token ||
              !retryManaged.terminal.element
            ) {
              return;
            }

            try {
              if (retryManaged.webglRecoveryAttempts < MAX_WEBGL_RECOVERY_ATTEMPTS) {
                retryManaged.webglRecoveryAttempts = attempt;
                retryManaged.hasWebglError = false;
                console.log(
                  `[WebGLContextManager] Attempting WebGL recovery for ${id} ` +
                    `(attempt ${attempt}/${MAX_WEBGL_RECOVERY_ATTEMPTS}, delay was ${delay}ms)`
                );
                this.acquire(id, retryManaged);
              } else {
                console.warn(
                  `[WebGLContextManager] Max WebGL recovery attempts reached for ${id}, ` +
                    `staying in canvas mode`
                );
              }
            } catch (error) {
              console.error(`[WebGLContextManager] Recovery failed for ${id}:`, error);
            }
          });
        }, delay);
      });

      managed.terminal.loadAddon(webglAddon);
      managed.webglAddon = webglAddon;
      managed.hasWebglError = false;
      managed.webglRecoveryAttempts = 0;

      this.webglLru = this.webglLru.filter((existing) => existing !== id);
      this.webglLru.push(id);
    } catch (error) {
      console.warn("[WebGLContextManager] WebGL addon failed to load:", error);
      managed.hasWebglError = true;
    }
  }

  release(id: string, managed: ManagedTerminal): void {
    managed.webglRecoveryToken = ++this.webglRecoverySeq;
    if (managed.webglAddon) {
      managed.webglAddon.dispose();
      managed.webglAddon = undefined;
    }
    this.webglLru = this.webglLru.filter((existing) => existing !== id);
  }

  releaseWithGrace(id: string): void {
    const managed = this.getTerminal(id);
    if (!managed?.webglAddon) return;

    if (managed.webglDisposeTimer === undefined) {
      managed.webglDisposeTimer = window.setTimeout(() => {
        const current = this.getTerminal(id);
        if (current && !current.isVisible && current.webglAddon) {
          this.release(id, current);
          current.terminal.refresh(0, current.terminal.rows - 1);
        }
        if (current) {
          current.webglDisposeTimer = undefined;
        }
      }, WEBGL_DISPOSE_GRACE_MS);
    }
  }

  cancelGracePeriod(managed: ManagedTerminal): void {
    if (managed.webglDisposeTimer !== undefined) {
      clearTimeout(managed.webglDisposeTimer);
      managed.webglDisposeTimer = undefined;
    }
  }

  promoteInLru(id: string): void {
    const idx = this.webglLru.indexOf(id);
    if (idx !== -1 && idx < this.webglLru.length - 1) {
      this.webglLru.splice(idx, 1);
      this.webglLru.push(id);
    }
  }

  wantsWebgl(managed: ManagedTerminal, tier: TerminalRefreshTier): boolean {
    return (
      managed.isVisible &&
      (tier === TerminalRefreshTier.BURST ||
        tier === TerminalRefreshTier.FOCUSED ||
        tier === TerminalRefreshTier.VISIBLE)
    );
  }

  private getWebGLBudget(): number {
    let budget = this.hardwareProfile.baseWebGLBudget;
    let terminalCount = 0;
    this.forEachTerminal(() => {
      terminalCount++;
    });

    if (terminalCount > TERMINAL_COUNT_THRESHOLD) {
      const scaleFactor = Math.max(BUDGET_SCALE_FACTOR, TERMINAL_COUNT_THRESHOLD / terminalCount);
      budget = Math.floor(budget * scaleFactor);
    }

    return Math.max(MIN_WEBGL_BUDGET, budget);
  }

  private enforceWebglBudget(): void {
    const activeContexts: string[] = [];
    this.forEachTerminal((term, id) => {
      if (term.webglAddon) {
        activeContexts.push(id);
      }
    });

    const effectiveBudget = Math.min(this.getWebGLBudget(), MAX_WEBGL_CONTEXTS);

    if (activeContexts.length <= effectiveBudget) {
      return;
    }

    // Sort by priority (lowest first - evicted first):
    // 1. Hidden terminals sorted by lastActiveTime (oldest first)
    // 2. Visible terminals sorted by lastActiveTime (oldest first)
    activeContexts.sort((aId, bId) => {
      const a = this.getTerminal(aId)!;
      const b = this.getTerminal(bId)!;

      if (a.isVisible !== b.isVisible) {
        return a.isVisible ? 1 : -1;
      }
      return a.lastActiveTime - b.lastActiveTime;
    });

    while (activeContexts.length > effectiveBudget) {
      const victimId = activeContexts.shift();
      if (!victimId) break;
      const victim = this.getTerminal(victimId);

      if (victim?.webglAddon) {
        console.log(
          `[WebGLContextManager] Evicting WebGL context for ${victimId} (Visible: ${victim.isVisible})`
        );
        this.release(victimId, victim);
        victim.terminal.refresh(0, victim.terminal.rows - 1);
      }
    }
  }
}
