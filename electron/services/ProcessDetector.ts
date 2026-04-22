import type { TerminalType } from "../../shared/types/panel.js";
import type { ProcessTreeCache } from "./ProcessTreeCache.js";
import { logDebug, logWarn } from "../utils/logger.js";
import { AGENT_REGISTRY } from "../../shared/config/agentRegistry.js";

interface ChildProcess {
  pid: number;
  name: string;
  command?: string;
}

interface DetectedProcessCandidate {
  agentType?: TerminalType;
  processIconId?: string;
  processName: string;
  processCommand?: string;
  priority: number;
  order: number;
}

const AGENT_CLI_NAMES: Record<string, TerminalType> = Object.fromEntries(
  Object.entries(AGENT_REGISTRY).flatMap(([id, config]) => {
    const entries: [string, TerminalType][] = [[config.command, id as TerminalType]];
    if (config.command !== id) {
      entries.push([id, id as TerminalType]);
    }
    return entries;
  })
);

const PROCESS_ICON_MAP: Record<string, string> = {
  // AI agents (derived from registry)
  ...Object.fromEntries(
    Object.entries(AGENT_REGISTRY).flatMap(([id, config]) => {
      const entries: [string, string][] = [[id, config.iconId]];
      if (config.command !== id) {
        entries.push([config.command, config.iconId]);
      }
      return entries;
    })
  ),
  // Package managers
  npm: "npm",
  npx: "npm",
  yarn: "yarn",
  pnpm: "pnpm",
  bun: "bun",
  composer: "composer",
  // Language runtimes
  python: "python",
  python3: "python",
  node: "node",
  deno: "deno",
  ruby: "ruby",
  rails: "ruby",
  bundle: "ruby",
  go: "go",
  cargo: "rust",
  rustc: "rust",
  php: "php",
  kotlin: "kotlin",
  kotlinc: "kotlin",
  swift: "swift",
  swiftc: "swift",
  elixir: "elixir",
  mix: "elixir",
  iex: "elixir",
  // Build tools
  gradle: "gradle",
  gradlew: "gradle",
  webpack: "webpack",
  vite: "vite",
  // Infrastructure
  docker: "docker",
  terraform: "terraform",
  tofu: "terraform",
};

const PACKAGE_MANAGER_ICON_IDS = new Set(["npm", "yarn", "pnpm", "bun", "composer"]);

/**
 * Extract non-flag command name candidates from a full `command` line in
 * argv order. Used when `comm` doesn't match a known CLI — for example:
 *   - `node /path/to/claude --flag` (Node-hosted CLI; argv[1] is the agent)
 *   - `/path/to/claude --flag` (native binary; argv[0] is the agent)
 *   - claude rewrote its `process.title` to its version string, so comm is
 *     "2.1.117" but argv[0] still reflects the original invocation because
 *     `ps -o command` on macOS reads the kernel's copy via sysctl before
 *     the process modified its own argv.
 *
 * Extensions like .js / .py / .rb are stripped so "claude.mjs" → "claude".
 * Returns argv[0], argv[1], etc. as basenames, capped at 3 entries.
 */
export function extractCommandNameCandidates(command: string | undefined): string[] {
  if (!command) return [];
  const parts = command.trim().split(/\s+/);
  const candidates: string[] = [];
  for (let i = 0; i < parts.length && candidates.length < 3; i++) {
    const arg = parts[i];
    if (!arg || arg.startsWith("-")) continue;
    const basename = arg.split(/[\\/]/).pop();
    if (!basename) continue;
    const withoutExt = basename.replace(/\.(m?js|cjs|ts|py|rb|php|pl)$/i, "");
    if (withoutExt) candidates.push(withoutExt);
  }
  return candidates;
}

/** @deprecated Use extractCommandNameCandidates — retained for test import. */
export function extractScriptBasenameFromCommand(command: string | undefined): string | null {
  const all = extractCommandNameCandidates(command);
  // Previous behaviour: skip argv[0], return argv[1]. Preserved so older
  // tests that assume "only the script, not the runtime" still pass.
  return all[1] ?? null;
}

export interface DetectionResult {
  detected: boolean;
  agentType?: TerminalType;
  processIconId?: string;
  processName?: string;
  isBusy?: boolean;
  currentCommand?: string;
}

export type DetectionCallback = (result: DetectionResult, spawnedAt: number) => void;

export class ProcessDetector {
  // Require N consecutive polls agreeing on a new agent/icon state before
  // committing it. At the 1500 ms base poll interval that is ~3 s of confirmation,
  // which is enough to filter out short-lived processes (e.g. `claude --version`)
  // that would otherwise cause the detector to thrash between on/off.
  private static readonly HYSTERESIS_THRESHOLD = 2;

  private terminalId: string;
  private spawnedAt: number;
  private ptyPid: number;
  private callback: DetectionCallback;
  private lastDetected: TerminalType | null = null;
  private lastProcessIconId: string | null = null;
  private lastBusyState: boolean | null = null;
  private lastCurrentCommand: string | undefined;
  private cache: ProcessTreeCache;
  private unsubscribe: (() => void) | null = null;
  private isStarted: boolean = false;
  private onStreak: number = 0;
  private offStreak: number = 0;
  private pendingDetected: { agentType?: TerminalType; processIconId?: string } | null = null;
  private lastUnknownSignature: string | null = null;

  constructor(
    terminalId: string,
    spawnedAt: number,
    ptyPid: number,
    callback: DetectionCallback,
    cache: ProcessTreeCache
  ) {
    this.terminalId = terminalId;
    this.spawnedAt = spawnedAt;
    this.ptyPid = ptyPid;
    this.callback = callback;
    this.cache = cache;
  }

  start(): void {
    if (this.isStarted) {
      logWarn(`ProcessDetector for terminal ${this.terminalId} already started`);
      return;
    }

    logDebug(`Starting ProcessDetector for terminal ${this.terminalId}, PID ${this.ptyPid}`);

    this.isStarted = true;
    this.detect();

    this.unsubscribe = this.cache.onRefresh(() => {
      this.detect();
    });
  }

  stop(): void {
    if (this.unsubscribe) {
      // Flush a pending OFF streak on teardown so a detected agent whose process
      // exited inside the hysteresis window does not leave ghost state in the UI.
      if (this.offStreak > 0 && (this.lastDetected !== null || this.lastProcessIconId !== null)) {
        const spawnedAt = this.spawnedAt;
        this.lastDetected = null;
        this.lastProcessIconId = null;
        this.lastBusyState = false;
        this.lastCurrentCommand = undefined;
        this.offStreak = 0;
        this.onStreak = 0;
        this.pendingDetected = null;
        try {
          this.callback({ detected: false, isBusy: false, currentCommand: undefined }, spawnedAt);
        } catch (err) {
          console.error(`ProcessDetector stop flush error for terminal ${this.terminalId}:`, err);
        }
      } else {
        this.onStreak = 0;
        this.offStreak = 0;
        this.pendingDetected = null;
      }

      this.unsubscribe();
      this.unsubscribe = null;
      logDebug(`Stopped ProcessDetector for terminal ${this.terminalId}`);
    }
    this.isStarted = false;
  }

  private detect(): void {
    try {
      const result = this.detectAgent();

      const rawAgent = result.agentType ?? null;
      const rawIcon = result.processIconId ?? null;
      const rawDetected = result.detected;
      const committedAgent = this.lastDetected;
      const committedIcon = this.lastProcessIconId;

      const agentOrIconDiffers = rawAgent !== committedAgent || rawIcon !== committedIcon;

      let gatedCommitted = false;

      if (agentOrIconDiffers) {
        if (rawDetected) {
          // ON or swap direction: count consecutive polls agreeing on the same
          // candidate; a different candidate mid-streak resets the counter.
          const sameCandidate =
            this.pendingDetected !== null &&
            (this.pendingDetected.agentType ?? null) === rawAgent &&
            (this.pendingDetected.processIconId ?? null) === rawIcon;

          this.onStreak = sameCandidate ? this.onStreak + 1 : 1;
          this.pendingDetected = {
            agentType: result.agentType,
            processIconId: result.processIconId,
          };
          this.offStreak = 0;

          if (this.onStreak >= ProcessDetector.HYSTERESIS_THRESHOLD) {
            this.lastDetected = rawAgent;
            this.lastProcessIconId = rawIcon;
            this.onStreak = 0;
            this.pendingDetected = null;
            gatedCommitted = true;
          }
        } else {
          // OFF direction: raw reports no detection but committed state has one.
          this.offStreak += 1;
          this.onStreak = 0;
          this.pendingDetected = null;

          if (this.offStreak >= ProcessDetector.HYSTERESIS_THRESHOLD) {
            this.lastDetected = null;
            this.lastProcessIconId = null;
            this.offStreak = 0;
            gatedCommitted = true;
          }
        }
      } else {
        // Raw matches committed state — no transition in flight.
        this.onStreak = 0;
        this.offStreak = 0;
        this.pendingDetected = null;
      }

      const inPendingTransition = this.onStreak > 0 || this.offStreak > 0;

      const busyChanged = result.isBusy !== undefined && result.isBusy !== this.lastBusyState;
      const commandChanged = result.currentCommand !== this.lastCurrentCommand;

      // Suppress busy/command emissions while a gated transition is pending —
      // otherwise a one-poll blip would leak through the side-channel and undo
      // the hysteresis gate. Once the gated streak commits (or the raw state
      // stabilises back onto committed), immediate emissions resume.
      const shouldEmitImmediate = (busyChanged || commandChanged) && !inPendingTransition;

      if (gatedCommitted || shouldEmitImmediate) {
        if (result.isBusy !== undefined) {
          this.lastBusyState = result.isBusy;
        }
        this.lastCurrentCommand = result.currentCommand;
        this.callback(result, this.spawnedAt);
      }
    } catch (_error) {
      console.error(`ProcessDetector error for terminal ${this.terminalId}:`, _error);
    }
  }

  private detectAgent(): DetectionResult {
    if (!Number.isInteger(this.ptyPid) || this.ptyPid <= 0) {
      console.warn(`Invalid PTY PID for terminal ${this.terminalId}: ${this.ptyPid}`);
      return { detected: false, isBusy: false };
    }

    const children = this.cache.getChildren(this.ptyPid);
    const isBusy = children.length > 0;

    if (!isBusy) {
      return { detected: false, isBusy: false, currentCommand: undefined };
    }

    const processes: ChildProcess[] = children.map((p) => ({
      pid: p.pid,
      name: p.comm,
      command: p.command,
    }));

    let bestMatch: DetectedProcessCandidate | null = null;
    let order = 0;

    for (const proc of processes) {
      const candidate = this.buildDetectedCandidate(proc.name, proc.command, order++);
      if (candidate) {
        bestMatch = this.selectPreferredCandidate(bestMatch, candidate);
      }
    }

    // Grandchild fallback. Only run when direct children didn't produce an
    // identified agent — avoids showing a "node" badge for claude's Node
    // worker processes when the claude parent renamed its comm. Covers real
    // nesting: `zsh → npm → node /path/to/claude` for `npm run claude`.
    if (!bestMatch || bestMatch.priority > 0) {
      for (const child of children.slice(0, 10)) {
        const grandchildren = this.cache.getChildren(child.pid);
        for (const grandchild of grandchildren) {
          const candidate = this.buildDetectedCandidate(
            grandchild.comm,
            grandchild.command || grandchild.comm,
            order++
          );
          if (candidate) {
            bestMatch = this.selectPreferredCandidate(bestMatch, candidate);
          }
        }
      }
    }

    // Diagnostic: when we saw running processes but couldn't identify any of
    // them, log what the OS actually reported. Fires at most once per
    // unique (comm, command) tuple set so a persistent mystery process
    // doesn't spam — but any NEW mystery process gets surfaced.
    if (!bestMatch) {
      const signature = processes.map((p) => `${p.name}|${p.command ?? ""}`).join("/");
      if (signature !== this.lastUnknownSignature) {
        this.lastUnknownSignature = signature;
        console.warn(
          `[ProcessDetector ${this.terminalId.slice(0, 8)}] unmatched children of pid ${this.ptyPid}:`,
          processes
            .map(
              (p) =>
                `pid=${p.pid} comm=${JSON.stringify(p.name)} cmd=${JSON.stringify(p.command ?? "")}`
            )
            .join(" | ")
        );
      }
    }

    if (bestMatch) {
      return {
        detected: true,
        agentType: bestMatch.agentType,
        processIconId: bestMatch.processIconId,
        processName: bestMatch.processName,
        isBusy,
        currentCommand: bestMatch.processCommand || processes[0]?.command,
      };
    }

    const primaryProcess = processes[0];
    const currentCommand = primaryProcess?.command;

    return { detected: false, isBusy, currentCommand };
  }

  getLastDetected(): TerminalType | null {
    return this.lastDetected;
  }

  private normalizeProcessName(name: string): string {
    const basename = name.split(/[\\/]/).pop() || name;
    return basename.replace(/\.exe$/i, "");
  }

  private buildDetectedCandidate(
    processName: string,
    processCommand: string | undefined,
    order: number
  ): DetectedProcessCandidate | null {
    const normalizedName = this.normalizeProcessName(processName);
    const lowerName = normalizedName.toLowerCase();

    // Primary: match the process basename (comm). Works for native binaries,
    // package managers, and well-behaved CLIs that haven't rewritten their
    // process title.
    let agentType = AGENT_CLI_NAMES[lowerName];
    let processIconId = PROCESS_ICON_MAP[lowerName];
    let effectiveName = normalizedName;

    // Fallback 1: walk argv from `command`. Covers two real cases:
    //   1. Node/Python-hosted CLIs — comm is the runtime ("node"), argv[1]
    //      is the script basename ("claude").
    //   2. CLIs that set `process.title` to something custom — claude, for
    //      example, rewrites its comm to its version string ("2.1.117").
    //      `ps -o command` on macOS reads the kernel's original-argv copy
    //      via sysctl, so "claude" is still recoverable from there.
    if (!agentType && processCommand) {
      const candidates = extractCommandNameCandidates(processCommand);
      for (const candidate of candidates) {
        const lowerCandidate = candidate.toLowerCase();
        const candidateAgent = AGENT_CLI_NAMES[lowerCandidate];
        const candidateIcon = PROCESS_ICON_MAP[lowerCandidate];
        if (candidateAgent || candidateIcon) {
          agentType = candidateAgent;
          // Prefer the candidate's icon — "claude" beats "node".
          processIconId = candidateIcon ?? processIconId;
          effectiveName = candidate;
          break;
        }
      }
    }

    // Fallback 2 (agents only): path-component substring scan on the full
    // command line. Catches aggressively-rewritten processes where both
    // comm and argv[0..N] basenames have been scrambled, but the original
    // invocation path still appears somewhere in the kernel-preserved argv
    // (e.g. "/Users/foo/.npm-global/bin/claude" somewhere in the string).
    // Scoped to AGENT names because substring matching is too loose for
    // short runtime tokens like "node" / "go" which appear as path
    // components in many unrelated commands.
    if (!agentType && processCommand) {
      const lowerCommand = processCommand.toLowerCase();
      for (const cliName of Object.keys(AGENT_CLI_NAMES)) {
        if (
          lowerCommand.includes(`/${cliName} `) ||
          lowerCommand.endsWith(`/${cliName}`) ||
          lowerCommand.includes(` ${cliName} `) ||
          lowerCommand.endsWith(` ${cliName}`) ||
          lowerCommand.startsWith(`${cliName} `) ||
          lowerCommand === cliName
        ) {
          agentType = AGENT_CLI_NAMES[cliName];
          processIconId = PROCESS_ICON_MAP[cliName] ?? processIconId;
          effectiveName = cliName;
          break;
        }
      }
    }

    if (!agentType && !processIconId) {
      return null;
    }

    return {
      agentType,
      processIconId,
      processName: effectiveName,
      processCommand,
      priority: this.getDetectionPriority(agentType, processIconId),
      order,
    };
  }

  private selectPreferredCandidate(
    current: DetectedProcessCandidate | null,
    candidate: DetectedProcessCandidate
  ): DetectedProcessCandidate {
    if (!current) {
      return candidate;
    }

    if (candidate.priority < current.priority) {
      return candidate;
    }

    if (candidate.priority === current.priority && candidate.order < current.order) {
      return candidate;
    }

    return current;
  }

  private getDetectionPriority(agentType?: TerminalType, processIconId?: string): number {
    if (agentType) {
      return 0;
    }

    if (processIconId && PACKAGE_MANAGER_ICON_IDS.has(processIconId)) {
      return 1;
    }

    return 2;
  }
}
