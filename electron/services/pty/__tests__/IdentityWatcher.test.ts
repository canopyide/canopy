import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityWatcher, type IdentityWatcherDelegate } from "../IdentityWatcher.js";
import type { ProcessDetector } from "../../ProcessDetector.js";

interface FakeDelegateState {
  isExited: boolean;
  wasKilled: boolean;
  detectedAgentId: string | undefined;
  lastOutputTime: number;
  spawnedAt: number;
  lastDetectedProcessIconId: string | undefined;
  processDetector: ProcessDetector | null;
  visibleLines: string[];
  cursorLine: string | null;
  lastCommand: string | undefined;
  ptyDescendantCount: number | undefined;
  foreground: { shellPgid: number; foregroundPgid: number } | null;
  detectionCalls: Array<{ agentType?: string; processIconId?: string; isBusy: boolean }>;
}

function createFakeDelegate(overrides: Partial<FakeDelegateState> = {}): {
  delegate: IdentityWatcherDelegate;
  state: FakeDelegateState;
} {
  const state: FakeDelegateState = {
    isExited: false,
    wasKilled: false,
    detectedAgentId: undefined,
    lastOutputTime: 0,
    spawnedAt: 1_000,
    lastDetectedProcessIconId: undefined,
    processDetector: null,
    visibleLines: [],
    cursorLine: null,
    lastCommand: undefined,
    ptyDescendantCount: 0,
    foreground: null,
    detectionCalls: [],
    ...overrides,
  };

  const delegate: IdentityWatcherDelegate = {
    terminalId: "fake-term-12345678",
    get isExited() {
      return state.isExited;
    },
    get wasKilled() {
      return state.wasKilled;
    },
    get detectedAgentId() {
      return state.detectedAgentId;
    },
    get lastOutputTime() {
      return state.lastOutputTime;
    },
    get spawnedAt() {
      return state.spawnedAt;
    },
    get lastDetectedProcessIconId() {
      return state.lastDetectedProcessIconId;
    },
    get processDetector() {
      return state.processDetector;
    },
    getLastNLines: () => state.visibleLines,
    getCursorLine: () => state.cursorLine,
    getLastCommand: () => state.lastCommand,
    getPtyDescendantCount: () => state.ptyDescendantCount,
    readForegroundProcessGroupSnapshot: () => state.foreground,
    handleAgentDetection: (result) => {
      state.detectionCalls.push({
        agentType: result.agentType,
        processIconId: result.processIconId,
        isBusy: result.isBusy ?? false,
      });
    },
  };

  return { delegate, state };
}

describe("IdentityWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("suppress signal", () => {
    it("returns false when no signal is armed", () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);
      expect(watcher.consumeSuppressSignal()).toBe(false);
    });

    it("armSuppressSignal followed by consumeSuppressSignal returns true once", () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);

      watcher.armSuppressSignal();
      expect(watcher.consumeSuppressSignal()).toBe(true);
      expect(watcher.consumeSuppressSignal()).toBe(false);
    });

    it("multiple arm calls before consume still consume only once", () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);

      watcher.armSuppressSignal();
      watcher.armSuppressSignal();
      expect(watcher.consumeSuppressSignal()).toBe(true);
      expect(watcher.consumeSuppressSignal()).toBe(false);
    });
  });

  describe("captureInput", () => {
    it("accumulates ASCII input and returns the line on \\r", () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);

      expect(watcher.captureInput("npm")).toBeUndefined();
      expect(watcher.captureInput(" run dev")).toBeUndefined();
      expect(watcher.captureInput("\r")).toBe("npm run dev");
    });

    it("returns the line on \\n separator", () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);

      expect(watcher.captureInput("ls -la\n")).toBe("ls -la");
    });

    it("handles backspace by removing the last character", () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);

      watcher.captureInput("nppm");
      watcher.captureInput("\b");
      watcher.captureInput("\b");
      watcher.captureInput("m");
      expect(watcher.captureInput("\r")).toBe("npm");
    });

    it("skips simple escape-prefixed sequences (e.g. function keys)", () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);

      // Start with an ESC + single-char terminator (e.g. an alt-key sequence)
      // followed by typed text. The escape pair is consumed; the typed body
      // remains.
      watcher.captureInput("\x1bAclaude");
      expect(watcher.captureInput("\r")).toBe("claude");
    });

    it("clears its buffer between submissions", () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);

      watcher.captureInput("first\r");
      expect(watcher.captureInput("second\r")).toBe("second");
    });

    // CSI sequences end on a final byte in the 0x40–0x7E range. The previous
    // 2-state machine treated `[` (0x5B) as a final byte, dropping arrow-key
    // payloads like the `A` in `\x1b[A` straight into the buffer.
    it("does not pollute the buffer with CSI cursor-key payloads", () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);

      watcher.captureInput("\x1b[A\x1b[B\x1b[C\x1b[Dclaude");
      expect(watcher.captureInput("\r")).toBe("claude");
    });

    it("does not pollute the buffer with CSI function-key sequences (\\x1b[5~)", () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);

      watcher.captureInput("\x1b[5~\x1b[6~claude");
      expect(watcher.captureInput("\r")).toBe("claude");
    });

    it("does not pollute the buffer with OSC title sequences (\\x1b]0;…\\x07)", () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);

      watcher.captureInput("\x1b]0;window-title\x07pnpm dev");
      expect(watcher.captureInput("\r")).toBe("pnpm dev");
    });

    it("returns undefined and ignores input after dispose", () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);

      watcher.captureInput("partial");
      watcher.dispose();
      expect(watcher.captureInput("more\r")).toBeUndefined();
    });

    it("rolls the buffer when input exceeds SHELL_INPUT_BUFFER_MAX (drops oldest, keeps tail)", async () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);
      const { SHELL_INPUT_BUFFER_MAX } = await import("../IdentityWatcher.js");

      // Fill exactly to capacity, then append one more printable char. The
      // buggy implementation would drop the new char; the fixed one drops the
      // oldest so the live tail (`!`) is preserved.
      watcher.captureInput("a".repeat(SHELL_INPUT_BUFFER_MAX));
      const submitted = watcher.captureInput("!\r");
      expect(submitted).toBeDefined();
      expect(submitted).toHaveLength(SHELL_INPUT_BUFFER_MAX);
      expect(submitted!.endsWith("a!")).toBe(true);
    });
  });

  describe("onShellSubmit gating", () => {
    it("no-ops when terminal is exited", () => {
      const { delegate, state } = createFakeDelegate({ isExited: true });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("npm run dev");
      expect(watcher.pendingFallbackIdentity).toBeNull();
      expect(state.detectionCalls).toHaveLength(0);
    });

    it("no-ops when terminal was killed", () => {
      const { delegate } = createFakeDelegate({ wasKilled: true });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("npm run dev");
      expect(watcher.pendingFallbackIdentity).toBeNull();
    });

    it("no-ops when an agent is detected and allowWhenAgentDetected is false", () => {
      const { delegate } = createFakeDelegate({ detectedAgentId: "claude" });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("npm run dev");
      expect(watcher.pendingFallbackIdentity).toBeNull();
    });

    it("arms when allowWhenAgentDetected overrides a live agent", () => {
      const { delegate } = createFakeDelegate({ detectedAgentId: "claude" });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("claude --version", { allowWhenAgentDetected: true });
      expect(watcher.pendingFallbackIdentity).not.toBeNull();
    });
  });

  describe("dispose", () => {
    it("prevents the poll callback from running after dispose", () => {
      // No detector path means the poll routes through delegate.handleAgentDetection.
      const { delegate, state } = createFakeDelegate({
        cursorLine: "user@host:~$ ",
        visibleLines: ["user@host:~$ "],
        ptyDescendantCount: 0,
      });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("claude");
      watcher.dispose();

      vi.advanceTimersByTime(5_000);
      expect(state.detectionCalls).toHaveLength(0);
    });

    it("stop() is idempotent", () => {
      const { delegate } = createFakeDelegate();
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("npm run dev");
      watcher.stop();
      watcher.stop();
      expect(watcher.pendingFallbackIdentity).toBeNull();
    });

    it("onShellSubmit after dispose is inert", () => {
      // After dispose, a late onShellSubmit must not arm a new poll interval
      // or mutate any state — the watcher is dead.
      const { delegate, state } = createFakeDelegate({
        cursorLine: "user@host:~$ ",
        visibleLines: ["user@host:~$ "],
      });
      const watcher = new IdentityWatcher(delegate);

      watcher.dispose();
      watcher.onShellSubmit("claude");

      expect(watcher.pendingFallbackIdentity).toBeNull();
      vi.advanceTimersByTime(5_000);
      expect(state.detectionCalls).toHaveLength(0);
    });

    // Past lesson #4851: containers that hold timer disposables must call
    // `.dispose()` on teardown, not just `.clear()` — otherwise leaked timer
    // handles surface as `vi.getTimerCount() > 0` after the test ends.
    it("leaves no live timers after dispose on an armed watcher", () => {
      const { delegate } = createFakeDelegate({
        cursorLine: "user@host:~$ ",
        visibleLines: ["user@host:~$ "],
      });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("claude");
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      watcher.dispose();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("clears injected shell evidence on dispose", () => {
      const inject = vi.fn();
      const clear = vi.fn();
      const fakeDetector = {
        injectShellCommandEvidence: inject,
        clearShellCommandEvidence: clear,
      } as unknown as ProcessDetector;
      const { delegate } = createFakeDelegate({ processDetector: fakeDetector });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("claude");
      clear.mockClear();
      watcher.dispose();

      // Default ("manual") reason — respects the sole-support gate so
      // process-tree-corroborated agents aren't force-demoted on teardown.
      expect(clear).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenCalledWith();
    });
  });

  describe("seed", () => {
    it("no-ops when no processDetector is attached", () => {
      const { delegate, state } = createFakeDelegate({ processDetector: null });
      const watcher = new IdentityWatcher(delegate);

      watcher.seed("claude --version");
      expect(state.detectionCalls).toHaveLength(0);
      expect(watcher.seededCommandText).toBeUndefined();
    });

    it("injects shell-command evidence when a processDetector is attached", () => {
      const inject = vi.fn();
      const fakeDetector = { injectShellCommandEvidence: inject } as unknown as ProcessDetector;
      const { delegate } = createFakeDelegate({ processDetector: fakeDetector });
      const watcher = new IdentityWatcher(delegate);

      watcher.seed("claude --model sonnet");
      expect(inject).toHaveBeenCalledTimes(1);
      const [identity, normalizedText] = inject.mock.calls[0];
      expect(identity).toMatchObject({ agentType: "claude" });
      expect(normalizedText).toBe("claude --model sonnet");
    });

    it("clears seededCommandText after the synchronous seed flow", () => {
      const fakeDetector = {
        injectShellCommandEvidence: vi.fn(),
      } as unknown as ProcessDetector;
      const { delegate } = createFakeDelegate({ processDetector: fakeDetector });
      const watcher = new IdentityWatcher(delegate);

      watcher.seed("claude");
      expect(watcher.seededCommandText).toBeUndefined();
    });

    it("does not inject evidence when seeded after dispose", () => {
      const inject = vi.fn();
      const fakeDetector = {
        injectShellCommandEvidence: inject,
        clearShellCommandEvidence: vi.fn(),
      } as unknown as ProcessDetector;
      const { delegate } = createFakeDelegate({ processDetector: fakeDetector });
      const watcher = new IdentityWatcher(delegate);

      watcher.dispose();
      inject.mockClear();
      watcher.seed("claude --version");

      expect(inject).not.toHaveBeenCalled();
      expect(watcher.seededCommandText).toBeUndefined();
    });
  });

  describe("commit & demote (detector path — primary production flow)", () => {
    it("calls processDetector.injectShellCommandEvidence on commit", async () => {
      const inject = vi.fn();
      const clear = vi.fn();
      const fakeDetector = {
        injectShellCommandEvidence: inject,
        clearShellCommandEvidence: clear,
      } as unknown as ProcessDetector;
      const { delegate, state } = createFakeDelegate({
        processDetector: fakeDetector,
        visibleLines: ["pnpm dev\r\n", "> dev output"],
        cursorLine: "> dev output",
        ptyDescendantCount: 1,
      });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("pnpm dev");
      await vi.advanceTimersByTimeAsync(2_000);

      // Detector path is taken — handleAgentDetection is NOT called directly.
      expect(state.detectionCalls).toHaveLength(0);
      expect(inject).toHaveBeenCalledTimes(1);
      const [identity, commandText] = inject.mock.calls[0];
      expect(identity).toMatchObject({ processIconId: "pnpm" });
      expect(commandText).toBe("pnpm dev");
      expect(watcher.isFallbackCommitted).toBe(true);
    });

    it("calls processDetector.clearShellCommandEvidence('prompt-return') on demotion", async () => {
      const inject = vi.fn();
      const clear = vi.fn();
      const fakeDetector = {
        injectShellCommandEvidence: inject,
        clearShellCommandEvidence: clear,
      } as unknown as ProcessDetector;
      const { delegate, state } = createFakeDelegate({
        processDetector: fakeDetector,
        visibleLines: ["claude\r\n", "Starting Claude Code..."],
        cursorLine: "Starting Claude Code...",
        ptyDescendantCount: 1,
        foreground: { shellPgid: 123, foregroundPgid: 123 },
      });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("claude");
      await vi.advanceTimersByTimeAsync(2_000);
      expect(watcher.isFallbackCommitted).toBe(true);

      state.visibleLines = ["user@host daintree % "];
      state.cursorLine = "user@host daintree % ";
      state.ptyDescendantCount = 0;
      await vi.advanceTimersByTimeAsync(600);

      expect(clear).toHaveBeenCalledWith("prompt-return");
      // handleAgentDetection is the legacy fallback; not used when detector is present.
      expect(state.detectionCalls).toHaveLength(0);
    });

    // Bug 2: liveIdentityMatchesFallback used OR. A stale process icon (from a
    // prior `claude` run whose icon hadn't been demoted yet) could short-
    // circuit the commit even when the live agent type disagreed — and vice
    // versa. The AND form requires every populated identity field to agree.
    it("does not pre-empt commit when only one identity field agrees with live state", async () => {
      const inject = vi.fn();
      const clear = vi.fn();
      const fakeDetector = {
        injectShellCommandEvidence: inject,
        clearShellCommandEvidence: clear,
      } as unknown as ProcessDetector;
      const { delegate, state } = createFakeDelegate({
        processDetector: fakeDetector,
        // detectedAgentId matches identity.agentType ("claude") — but the
        // process icon disagrees (live is `pnpm`, fallback identity is
        // `claude`). A correct AND check rejects the live state and lets the
        // fallback commit fresh evidence.
        detectedAgentId: "claude",
        lastDetectedProcessIconId: "pnpm",
        // allowWhenAgentDetected is required because detectedAgentId is set.
        visibleLines: ["claude\r\n", "Starting Claude Code..."],
        cursorLine: "Starting Claude Code...",
        ptyDescendantCount: 1,
      });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("claude", { allowWhenAgentDetected: true });
      await vi.advanceTimersByTimeAsync(2_000);

      // With OR: commit short-circuited (no inject call). With AND: commit
      // proceeds because processIconId disagrees, so injectShellCommandEvidence
      // fires with the watcher's identity.
      expect(inject).toHaveBeenCalledTimes(1);
      expect(state.detectionCalls).toHaveLength(0);
    });

    it("clears stale shell evidence when a new no-identity command is submitted", () => {
      const inject = vi.fn();
      const clear = vi.fn();
      const fakeDetector = {
        injectShellCommandEvidence: inject,
        clearShellCommandEvidence: clear,
      } as unknown as ProcessDetector;
      const { delegate } = createFakeDelegate({ processDetector: fakeDetector });
      const watcher = new IdentityWatcher(delegate);

      // `echo hi` has no recognizable identity — must clear stale evidence
      // immediately so the prior badge doesn't stay sticky for the full TTL.
      watcher.onShellSubmit("echo hi");
      expect(clear).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenCalledWith();
      expect(inject).not.toHaveBeenCalled();
    });
  });

  describe("commit & demote (no detector path)", () => {
    it("commits agent identity after the commit window when prompt is hidden", async () => {
      const { delegate, state } = createFakeDelegate({
        visibleLines: ["claude\r\n", "Starting Claude Code..."],
        cursorLine: "Starting Claude Code...",
        ptyDescendantCount: 1,
      });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("claude");
      // Commit window is 1200 ms; advance enough polls to clear it.
      await vi.advanceTimersByTimeAsync(2_000);

      expect(state.detectionCalls).toHaveLength(1);
      expect(state.detectionCalls[0].agentType).toBe("claude");
      expect(state.detectionCalls[0].isBusy).toBe(true);
      expect(watcher.isFallbackCommitted).toBe(true);
    });

    it("demotes after prompt return (two consecutive prompt polls)", async () => {
      const { delegate, state } = createFakeDelegate({
        visibleLines: ["claude\r\n", "Starting Claude Code..."],
        cursorLine: "Starting Claude Code...",
        ptyDescendantCount: 1,
        foreground: { shellPgid: 123, foregroundPgid: 123 },
      });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("claude");
      await vi.advanceTimersByTimeAsync(2_000);
      expect(watcher.isFallbackCommitted).toBe(true);

      // Now show a shell prompt — two consecutive polls should trigger demotion.
      state.visibleLines = ["user@host daintree % "];
      state.cursorLine = "user@host daintree % ";
      state.ptyDescendantCount = 0;
      await vi.advanceTimersByTimeAsync(600);

      const lastCall = state.detectionCalls[state.detectionCalls.length - 1];
      expect(lastCall).toMatchObject({
        agentType: undefined,
        processIconId: undefined,
        isBusy: false,
      });
    });

    // macOS CI runners ship `\h:\W \u\$ ` (no `@`, `:` separator); regression
    // for the "claude exits, prompt back, badge stuck" failure on those hosts.
    it("demotes after macOS bash default prompt returns (host:cwd user$)", async () => {
      const { delegate, state } = createFakeDelegate({
        visibleLines: ["claude\r\n", "Starting Claude Code..."],
        cursorLine: "Starting Claude Code...",
        ptyDescendantCount: 1,
        foreground: { shellPgid: 123, foregroundPgid: 123 },
      });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("claude");
      await vi.advanceTimersByTimeAsync(2_000);
      expect(watcher.isFallbackCommitted).toBe(true);

      const macOsBashPrompt =
        "iad20-fj920-8588b331-e81f-4e5d-b027-88cf9594933d-165A4DA9C335:daintree-e2e-terminal-agent-promotion-1EOmA5 runner$ ";
      state.visibleLines = [macOsBashPrompt];
      state.cursorLine = macOsBashPrompt;
      state.ptyDescendantCount = 0;
      await vi.advanceTimersByTimeAsync(600);

      const lastCall = state.detectionCalls[state.detectionCalls.length - 1];
      expect(lastCall).toMatchObject({
        agentType: undefined,
        processIconId: undefined,
        isBusy: false,
      });
    });
  });

  describe("hasRecentCommandFailureOutput — locale-independent detection", () => {
    // The detector is private; behavior is verified through the demotion gate.
    // Branch at IdentityWatcher.poll() line ~368: when foreground is busy AND
    // no failure phrase is in recent output, demotion is held. A failure
    // phrase bypasses the hold and allows demotion. Issue #6062.
    const localizedFailures = [
      { locale: "English (command not found)", phrase: "bash: claude: command not found" },
      { locale: "English (no such file)", phrase: "bash: ./claude: No such file or directory" },
      { locale: "French", phrase: "bash: claude : commande introuvable" },
      { locale: "German", phrase: "bash: claude: Befehl nicht gefunden" },
      { locale: "Spanish (es_MX)", phrase: "bash: claude: no se encontró la orden" },
      { locale: "Spanish (es_ES)", phrase: "bash: claude: orden no encontrada" },
      { locale: "Japanese", phrase: "bash: claude: コマンドが見つかりません" },
      { locale: "Chinese (Simplified)", phrase: "bash: claude: 未找到命令" },
      { locale: "Russian", phrase: "bash: claude: команда не найдена" },
      { locale: "Portuguese", phrase: "bash: claude: comando não encontrado" },
      { locale: "Italian", phrase: "bash: claude: comando non trovato" },
      { locale: "Korean", phrase: "bash: claude: 명령어를 찾을 수 없습니다" },
      { locale: "Dutch", phrase: "bash: claude: opdracht niet gevonden" },
      { locale: "Fish shell", phrase: "fish: Unknown command: claude" },
      {
        locale: "PowerShell (CommandNotFoundException)",
        phrase:
          "claude : The term 'claude' is not recognized. + FullyQualifiedErrorId : CommandNotFoundException",
      },
      {
        locale: "PowerShell (is not recognized — tail-window fallback)",
        phrase: "claude : The term 'claude' is not recognized as the name of a cmdlet",
      },
    ];

    it.each(localizedFailures)(
      "bypasses demotion hold when '$locale' failure is in recent output",
      async ({ phrase }) => {
        const { delegate, state } = createFakeDelegate({
          visibleLines: ["claude\r\n", "Starting Claude Code..."],
          cursorLine: "Starting Claude Code...",
          ptyDescendantCount: 1,
          // Foreground is busy (shell pgid != foreground pgid) — would
          // normally hold demotion until the regex match overrides it.
          foreground: { shellPgid: 123, foregroundPgid: 456 },
        });
        const watcher = new IdentityWatcher(delegate);

        watcher.onShellSubmit("claude");
        await vi.advanceTimersByTimeAsync(2_000);
        expect(watcher.isFallbackCommitted).toBe(true);
        // First call is the commit (isBusy=true).
        expect(state.detectionCalls).toHaveLength(1);

        // Now show a shell prompt with the localized failure phrase, while
        // foreground stays busy. Without the regex bypass, branch 1 holds.
        state.visibleLines = ["user@host daintree % ", phrase, "user@host daintree % "];
        state.cursorLine = "user@host daintree % ";
        state.ptyDescendantCount = 0;
        state.foreground = { shellPgid: 123, foregroundPgid: 456 };
        await vi.advanceTimersByTimeAsync(600);

        const lastCall = state.detectionCalls[state.detectionCalls.length - 1];
        expect(lastCall).toMatchObject({
          agentType: undefined,
          processIconId: undefined,
          isBusy: false,
        });
      }
    );

    it("holds demotion when no failure phrase is present and foreground is busy", async () => {
      const { delegate, state } = createFakeDelegate({
        visibleLines: ["claude\r\n", "Starting Claude Code..."],
        cursorLine: "Starting Claude Code...",
        ptyDescendantCount: 1,
        foreground: { shellPgid: 123, foregroundPgid: 456 },
      });
      const watcher = new IdentityWatcher(delegate);

      watcher.onShellSubmit("claude");
      await vi.advanceTimersByTimeAsync(2_000);
      expect(watcher.isFallbackCommitted).toBe(true);

      // Prompt visible, no failure phrase, foreground still busy — hold.
      state.visibleLines = ["user@host daintree % ", "(no failure here)", "user@host daintree % "];
      state.cursorLine = "user@host daintree % ";
      state.ptyDescendantCount = 0;
      state.foreground = { shellPgid: 123, foregroundPgid: 456 };
      await vi.advanceTimersByTimeAsync(600);

      // Only the commit call should exist; no demotion fired.
      expect(state.detectionCalls).toHaveLength(1);
      expect(state.detectionCalls[0].isBusy).toBe(true);
    });
  });

  describe("hasAgentUiPromptFalsePositive", () => {
    it("returns true for trust-prompt UI text", () => {
      const { delegate } = createFakeDelegate({
        visibleLines: ["", "Accessing workspace:", " ❯ 1. Yes, I trust this folder"],
        cursorLine: " ❯ 1. Yes, I trust this folder",
      });
      const watcher = new IdentityWatcher(delegate);

      expect(watcher.hasAgentUiPromptFalsePositive()).toBe(true);
    });

    it("returns false for a normal shell prompt line", () => {
      const { delegate } = createFakeDelegate({
        visibleLines: ["", "user@host daintree % "],
        cursorLine: "user@host daintree % ",
      });
      const watcher = new IdentityWatcher(delegate);

      expect(watcher.hasAgentUiPromptFalsePositive()).toBe(false);
    });
  });
});
