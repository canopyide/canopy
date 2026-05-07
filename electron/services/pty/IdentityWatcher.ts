import {
  detectCommandIdentity,
  redactArgv,
  type CommandIdentity,
  type DetectionResult,
  type ProcessDetector,
} from "../ProcessDetector.js";
import { detectPrompt } from "./PromptDetector.js";
import { MutableDisposable, toDisposable, type IDisposable } from "../../utils/lifecycle.js";

export const SHELL_IDENTITY_FALLBACK_COMMIT_MS = 1200;
export const SHELL_IDENTITY_FALLBACK_POLL_MS = 200;
export const SHELL_IDENTITY_FALLBACK_PROMPT_POLLS = 2;
export const SHELL_IDENTITY_FALLBACK_SCAN_LINES = 4;
export const SHELL_INPUT_BUFFER_MAX = 4096;

const SHELL_PROMPT_PATTERNS = [
  /^\s*[>›❯⟩$#%]\s*$/,
  // `user@host:/path $` style — bash default with hostname. Path token may
  // contain `/`, `:`, `~`, etc., so use \S+ rather than \w/.- only.
  /^\s*[A-Za-z0-9_.-]+@\S+(?:\s+[^\r\n]*)?\s*[#$%>]\s*$/,
  /^\s*[➜➤➟➔❯›]\s+.*$/,
  // macOS bash default — `host:cwd user$` (no `@`, `:` separator). Two
  // whitespace-separated tokens followed by a single trailing prompt char so
  // command output like `cat <foo>` or `foo > bar.txt` doesn't false-positive.
  /^\s*\S+:\S+\s+\S+\s*[#$%>]\s*$/,
] as const;

// Locale-independent fallback signals for "command not found" detection. POSIX
// exit code 127 is invisible to node-pty.onExit while the shell is alive
// (interactive case), so output parsing remains the only viable signal here.
// Localized phrases cover the major shell locales; PowerShell's
// `CommandNotFoundException` is locale-independent. Issue #6062.
const COMMAND_NOT_FOUND_PATTERNS = [
  "command not found",
  "not found",
  "no such file",
  "permission denied",
  "commande introuvable",
  "Befehl nicht gefunden",
  "no se encontró la orden",
  "orden no encontrada",
  "コマンドが見つかりません",
  "未找到命令",
  "команда не найдена",
  "comando não encontrado",
  "comando non trovato",
  "명령어를 찾을 수 없습니다",
  "opdracht niet gevonden",
  "Unknown command:",
  "CommandNotFoundException",
  "is not recognized as the name of a cmdlet",
] as const;

const COMMAND_NOT_FOUND_REGEX = new RegExp(COMMAND_NOT_FOUND_PATTERNS.join("|"), "iu");

export interface IdentityWatcherDelegate {
  readonly terminalId: string;
  readonly isExited: boolean;
  readonly wasKilled: boolean;
  readonly detectedAgentId: string | undefined;
  readonly lastOutputTime: number;
  readonly spawnedAt: number;
  readonly lastDetectedProcessIconId: string | undefined;
  readonly processDetector: ProcessDetector | null;
  getLastNLines(n: number): string[];
  getCursorLine(): string | null;
  getLastCommand(): string | undefined;
  getPtyDescendantCount(): number | undefined;
  readForegroundProcessGroupSnapshot(): { shellPgid: number; foregroundPgid: number } | null;
  handleAgentDetection(result: DetectionResult, spawnedAt: number): void;
}

export function normalizeShellCommandText(commandText?: string): string | undefined {
  if (!commandText) return undefined;
  const normalized = commandText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

/**
 * Owns the shell-command identity fallback state machine: keystroke capture,
 * post-submit polling, and the commit/demote heuristics that surface a
 * `pnpm`/`docker`/`claude` badge when the process-tree path is too slow or
 * silent. Lifted out of `TerminalProcess` so the heuristic policy is testable
 * in isolation and the host class no longer carries seven scattered fields
 * for a single concern.
 */
export class IdentityWatcher {
  private timer = new MutableDisposable<IDisposable>();
  private submittedAt: number | null = null;
  private commandText: string | undefined;
  private identity: CommandIdentity | null = null;
  private committed = false;
  private promptStreak = 0;
  private sawPtyDescendant = false;
  private suppressNext = false;
  private inputBuffer = "";
  private seededCommand: string | undefined;
  private stopped = false;

  constructor(private readonly delegate: IdentityWatcherDelegate) {}

  seed(commandText?: string): void {
    if (this.stopped) return;
    if (!this.delegate.processDetector) return;
    const normalized = normalizeShellCommandText(commandText);
    if (!normalized) return;
    const identity = detectCommandIdentity(normalized);
    if (!identity) return;
    this.seededCommand = normalized;
    console.log(
      `[IdentityDebug] shell-submit term=${this.delegate.terminalId.slice(-8)} src=spawn ` +
        `agent=${identity.agentType ?? "<none>"} icon=${identity.processIconId ?? "<none>"} ` +
        `argv0=${redactArgv(normalized)}`
    );
    this.delegate.processDetector.injectShellCommandEvidence(identity, normalized);
    this.onShellSubmit(normalized, { allowWhenAgentDetected: true });
    this.seededCommand = undefined;
  }

  captureInput(data: string): string | undefined {
    if (this.stopped) return undefined;

    let submittedCommandText: string | undefined;
    // ESC parser states:
    //   0 = normal text
    //   1 = saw ESC, awaiting intro byte (Fe escape vs. CSI/OSC opener)
    //   2 = inside CSI — terminates on a final byte in 0x40..0x7E
    //   3 = inside OSC/DCS/SOS/APC/PM — terminates on BEL (or ST `ESC \`,
    //       handled implicitly when the embedded ESC restarts the parser)
    // A 2-state ESC machine treated `[` as a final byte (0x5B is inside
    // 0x40..0x7E), so `\x1b[A` leaked its final byte into the buffer; folding
    // OSC into the same state would also break, because OSC parameter bytes
    // include lowercase letters in 0x40..0x7E (e.g. the `w` in
    // `\x1b]0;window-title\x07`).
    let escState = 0;

    for (const char of data) {
      if (escState === 3) {
        if (char === "\u0007") {
          escState = 0;
        } else if (char === "\x1b") {
          // Treat embedded ESC as restart — also recovers the `\` of an ST
          // terminator (`ESC \`) via the state-1 fall-through to state 0.
          escState = 1;
        }
        continue;
      }

      if (escState === 2) {
        if (char >= "@" && char <= "~") {
          escState = 0;
        } else if (char === "\x1b") {
          escState = 1;
        }
        continue;
      }

      if (escState === 1) {
        if (char === "[") {
          escState = 2;
        } else if (char === "]" || char === "P" || char === "X" || char === "_" || char === "^") {
          escState = 3;
        } else {
          // Fe escape (e.g. `ESC A`, `ESC M`) — the single intro byte
          // completes the sequence; this branch also recovers the trailing
          // `\` of an ST terminator.
          escState = 0;
        }
        continue;
      }

      if (char === "\x1b") {
        escState = 1;
        continue;
      }

      if (char === "\b" || char === "\x7f") {
        this.inputBuffer = this.inputBuffer.slice(0, -1);
        continue;
      }

      if (char === "\r" || char === "\n") {
        submittedCommandText = normalizeShellCommandText(this.inputBuffer);
        this.inputBuffer = "";
        continue;
      }

      if (char < " ") {
        continue;
      }

      if (this.inputBuffer.length >= SHELL_INPUT_BUFFER_MAX) {
        // Drop oldest chars; preserve the live tail (most recent keystrokes matter for identity).
        this.inputBuffer = this.inputBuffer.slice(
          this.inputBuffer.length - SHELL_INPUT_BUFFER_MAX + 1
        );
      }
      this.inputBuffer += char;
    }

    return submittedCommandText;
  }

  onShellSubmit(commandText?: string, options: { allowWhenAgentDetected?: boolean } = {}): void {
    if (this.stopped || this.delegate.isExited || this.delegate.wasKilled) {
      return;
    }

    // Only skip when a live agent is already detected. A stale
    // `lastDetectedProcessIconId` must not block re-arming the fallback — if
    // the user ran `npm run dev` then Ctrl+C then typed `pnpm dev`, the new
    // command must be allowed to restart detection regardless of whether the
    // previous badge was cleared by the process-tree path yet.
    if (this.delegate.detectedAgentId && !options.allowWhenAgentDetected) {
      return;
    }

    this.submittedAt = Date.now();
    this.commandText = normalizeShellCommandText(commandText);
    this.identity = this.commandText ? detectCommandIdentity(this.commandText) : null;
    this.committed = false;
    this.promptStreak = 0;
    this.sawPtyDescendant = false;

    // If the new command has no recognizable identity (e.g. `echo hi` after a
    // prior `npm run dev` that committed `npm`), clear any stale shell
    // evidence on the detector so it doesn't keep the prior identity sticky
    // for the full TTL. Identity-carrying commands overwrite via the
    // watcher's later inject call. #5809
    if (!this.identity) {
      this.delegate.processDetector?.clearShellCommandEvidence();
    }

    this.start();
  }

  armSuppressSignal(): void {
    this.suppressNext = true;
  }

  consumeSuppressSignal(): boolean {
    if (this.suppressNext) {
      this.suppressNext = false;
      return true;
    }
    return false;
  }

  hasAgentUiPromptFalsePositive(): boolean {
    const lines = this.delegate.getLastNLines(SHELL_IDENTITY_FALLBACK_SCAN_LINES);
    const lastVisibleLine = [...lines]
      .reverse()
      .find((line) => typeof line === "string" && line.trim().length > 0);
    const recent = [this.delegate.getCursorLine(), lastVisibleLine]
      .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
      .join("\n");
    return (
      /(?:accessing workspace|yes,\s*i trust this folder|enter to confirm|quick safety check)/i.test(
        recent
      ) || /^\s*[❯›]\s+\d+\./m.test(recent)
    );
  }

  get pendingFallbackIdentity(): CommandIdentity | null {
    return this.identity;
  }

  get isFallbackCommitted(): boolean {
    return this.committed;
  }

  get seededCommandText(): string | undefined {
    return this.seededCommand;
  }

  clearSeededCommandText(): void {
    this.seededCommand = undefined;
  }

  stop(): void {
    this.timer.clear();
    this.submittedAt = null;
    this.commandText = undefined;
    this.identity = null;
    this.committed = false;
    this.promptStreak = 0;
    this.sawPtyDescendant = false;
  }

  dispose(): void {
    this.stopped = true;
    this.stop();
    // Drop any injected shell evidence so a torn-down watcher doesn't leave a
    // stale identity hanging on the detector for the full TTL. Default reason
    // ("manual") respects the `promptReturned`/`shellWasSoleSupport` gate, so
    // an agent the process tree independently corroborates won't be demoted.
    this.delegate.processDetector?.clearShellCommandEvidence();
    // Mark the MutableDisposable container itself disposed (safety fence) so
    // any later assignment to `this.timer.value` short-circuits instead of
    // silently retaining a new disposable.
    this.timer.dispose();
  }

  private start(): void {
    if (this.timer.value || this.stopped) {
      return;
    }
    const id = setInterval(() => {
      // An uncaught throw in a setInterval callback would tear down the
      // interval (and on Electron 37+ utility processes, crash the host).
      try {
        this.poll();
      } catch (err) {
        console.error(`[IdentityWatcher] poll failed for ${this.delegate.terminalId}:`, err);
      }
    }, SHELL_IDENTITY_FALLBACK_POLL_MS);
    this.timer.value = toDisposable(() => clearInterval(id));
  }

  private hasRecentCommandFailureOutput(): boolean {
    const recent = this.delegate.getLastNLines(SHELL_IDENTITY_FALLBACK_SCAN_LINES).join("\n");
    return COMMAND_NOT_FOUND_REGEX.test(recent);
  }

  private isShellPromptVisible(): boolean {
    const prompt = detectPrompt(
      this.delegate.getLastNLines(SHELL_IDENTITY_FALLBACK_SCAN_LINES),
      {
        promptPatterns: [...SHELL_PROMPT_PATTERNS],
        promptHintPatterns: [],
        promptScanLineCount: SHELL_IDENTITY_FALLBACK_SCAN_LINES,
        promptConfidence: 0.85,
      },
      this.delegate.getCursorLine()
    );
    return prompt.isPrompt;
  }

  private isForegroundShellIdleForAgentDemotion(): boolean {
    const snapshot = this.delegate.readForegroundProcessGroupSnapshot();
    if (!snapshot) {
      // Non-POSIX and unsupported environments fall back to the legacy prompt
      // path. On macOS/Linux this snapshot is the authoritative demotion gate.
      return true;
    }

    if (snapshot.shellPgid <= 0 || snapshot.foregroundPgid <= 0) {
      return true;
    }

    return snapshot.shellPgid === snapshot.foregroundPgid;
  }

  private poll(): void {
    if (this.stopped) return;

    const submittedAt = this.submittedAt;
    if (submittedAt === null || this.delegate.isExited || this.delegate.wasKilled) {
      this.stop();
      return;
    }

    if (!this.identity) {
      const commandText =
        this.commandText ??
        (this.delegate.lastOutputTime >= submittedAt ? this.delegate.getLastCommand() : undefined);
      const normalized = normalizeShellCommandText(commandText);
      if (normalized) {
        this.commandText = normalized;
        this.identity = detectCommandIdentity(normalized);
      }
    }

    const ptyDescendantCount = this.delegate.getPtyDescendantCount();
    const hasPtyDescendants = ptyDescendantCount !== undefined && ptyDescendantCount > 0;
    if (hasPtyDescendants) {
      this.sawPtyDescendant = true;
    }

    const promptVisible = this.isShellPromptVisible();
    // A live identity only pre-empts the fallback commit when it matches what
    // the fallback detected — a stale badge (e.g. a prior `npm run dev` whose
    // icon hasn't been cleared yet) must NOT block the fallback from emitting
    // a fresh `pnpm`/`docker`/etc. detection for the next command. #5813
    const fallbackIdentity = this.identity;
    // "If the field is provided, it must agree" — AND across every populated
    // field on the fallback identity. OR semantics let a single-field match
    // pre-empt the commit even when the *other* field disagreed (a stale icon
    // could short-circuit a freshly typed agent command, or vice versa).
    const liveIdentityMatchesFallback =
      fallbackIdentity !== null &&
      (fallbackIdentity.agentType !== undefined || fallbackIdentity.processIconId !== undefined) &&
      (fallbackIdentity.agentType === undefined ||
        this.delegate.detectedAgentId === fallbackIdentity.agentType) &&
      (fallbackIdentity.processIconId === undefined ||
        this.delegate.lastDetectedProcessIconId === fallbackIdentity.processIconId);

    if (!this.identity) {
      if (promptVisible && Date.now() - submittedAt >= SHELL_IDENTITY_FALLBACK_COMMIT_MS) {
        console.log(
          `[IdentityDebug] shell-fallback-stop term=${this.delegate.terminalId.slice(-8)} reason=no-identity-prompt`
        );
        this.stop();
      }
      return;
    }

    if (!this.committed) {
      if (liveIdentityMatchesFallback) {
        this.committed = true;
        return;
      }

      if (promptVisible && !this.identity.agentType) {
        console.log(
          `[IdentityDebug] shell-fallback-stop term=${this.delegate.terminalId.slice(-8)} ` +
            `reason=prompt-before-commit icon=${this.identity.processIconId ?? "<none>"}`
        );
        this.stop();
        return;
      }

      if (Date.now() - submittedAt < SHELL_IDENTITY_FALLBACK_COMMIT_MS) {
        return;
      }

      // Route shell-command evidence through ProcessDetector so the merge with
      // process-tree evidence lives in one place. The detector applies the
      // sticky TTL (~12 s) which anchors this commit through blind-`ps`
      // cycles and short-lived subprocess thrash. If no detector exists
      // (null cache path), fall back to the legacy direct emission so a
      // degraded terminal still surfaces shell-command identity. #5809
      if (this.delegate.processDetector) {
        this.delegate.processDetector.injectShellCommandEvidence(this.identity, this.commandText);
      } else {
        this.delegate.handleAgentDetection(
          {
            detectionState: "agent",
            detected: true,
            agentType: this.identity.agentType,
            processIconId: this.identity.processIconId,
            processName: this.identity.processName,
            isBusy: true,
            currentCommand: this.commandText,
            evidenceSource: "shell_command",
          },
          this.delegate.spawnedAt
        );
      }
      this.committed = true;
      return;
    }

    if (!promptVisible) {
      this.promptStreak = 0;
      return;
    }

    if (
      this.identity.agentType &&
      !this.hasRecentCommandFailureOutput() &&
      !this.isForegroundShellIdleForAgentDemotion()
    ) {
      if (this.promptStreak > 0) {
        console.log(
          `[IdentityDebug] shell-fallback-hold term=${this.delegate.terminalId.slice(-8)} ` +
            `reason=foreground-child-active`
        );
      }
      this.promptStreak = 0;
      return;
    }

    if (
      this.identity.agentType &&
      !this.hasRecentCommandFailureOutput() &&
      this.hasAgentUiPromptFalsePositive()
    ) {
      if (this.promptStreak > 0) {
        console.log(
          `[IdentityDebug] shell-fallback-hold term=${this.delegate.terminalId.slice(-8)} ` +
            `reason=agent-ui-prompt count=${ptyDescendantCount ?? "unknown"} ` +
            `sawDescendant=${this.sawPtyDescendant}`
        );
      }
      this.promptStreak = 0;
      return;
    }

    this.promptStreak += 1;
    if (this.promptStreak < SHELL_IDENTITY_FALLBACK_PROMPT_POLLS) {
      return;
    }

    // Prompt has returned — the command has finished. Clear the injected
    // shell evidence as an explicit lifecycle demotion. Process-tree absence
    // is not authoritative for agent exit; shell prompt return is. When no
    // detector is attached, fall back to the legacy direct emission so the UI
    // still demotes promptly.
    if (this.delegate.processDetector) {
      this.delegate.processDetector.clearShellCommandEvidence("prompt-return");
    } else {
      this.delegate.handleAgentDetection(
        {
          detectionState: "no_agent",
          detected: false,
          isBusy: false,
          currentCommand: undefined,
        },
        this.delegate.spawnedAt
      );
    }
    this.stop();
  }
}
