import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── IPC mocks ──────────────────────────────────────────────────────────────
const ipcMainMock = vi.hoisted(() => ({
  handle: vi.fn(),
  removeHandler: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: ipcMainMock,
  systemPreferences: { getMediaAccessStatus: vi.fn(() => "granted") },
  shell: { openExternal: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
}));

// ── Shared state container for mocks ───────────────────────────────────────
type MockTranscriptionEvent = {
  type: string;
  text?: string;
  status?: string;
  message?: string;
};

const shared = vi.hoisted(() => ({
  transcriptionEventCallback: null as ((e: MockTranscriptionEvent) => void) | null,
  /** Deferred drain promise — resolve externally to control stopGracefully() timing. */
  drainResolve: null as (() => void) | null,
  /** When true, stopGracefully uses a deferred promise instead of resolving immediately. */
  useDeferredDrain: false,
}));

vi.mock("../../../services/VoiceTranscriptionService.js", () => ({
  VoiceTranscriptionService: function VoiceTranscriptionService(this: Record<string, unknown>) {
    this.onEvent = function (cb: (e: MockTranscriptionEvent) => void) {
      shared.transcriptionEventCallback = cb;
      return () => {};
    };
    this.start = function () {
      return Promise.resolve({ ok: true });
    };
    this.stopGracefully = function () {
      if (shared.useDeferredDrain) {
        return new Promise<void>((resolve) => {
          shared.drainResolve = resolve;
        });
      }
      return Promise.resolve();
    };
    this.sendAudioChunk = function () {};
    this.destroy = function () {};
    this.commitParagraphBoundary = function () {};
  },
}));

vi.mock("../../../services/VoiceCorrectionService.js", () => ({
  VoiceCorrectionService: function VoiceCorrectionService(this: Record<string, unknown>) {
    this.correct = function () {
      return Promise.resolve({
        action: "no_change",
        correctedText: "",
        confidence: "high",
        confirmedText: "",
      });
    };
    this.detectFileLinkTokens = function () {
      return Promise.resolve([]);
    };
    this.setSessionSignal = function () {};
  },
}));

vi.mock("../../../services/ProjectStore.js", () => ({
  projectStore: {
    getCurrentProject: vi.fn(() => null),
    getCurrentProjectId: vi.fn(() => null),
  },
}));

vi.mock("../../../store.js", () => ({
  store: {
    get: vi.fn((key: string) => {
      if (key === "voiceInput") {
        return {
          enabled: true,
          openaiApiKey: "sk-test",
          correctionEnabled: true,
          correctionModel: "gpt-5-mini",
          customDictionary: [],
          correctionCustomInstructions: "",
          language: "en",
          transcriptionModel: "gpt-realtime-whisper",
          paragraphingStrategy: "spoken-command",
          resolveFileLinks: true,
        };
      }
      return undefined;
    }),
    set: vi.fn(),
  },
}));

vi.mock("../../channels.js", () => ({
  CHANNELS: {
    VOICE_INPUT_GET_SETTINGS: "voice-input:get-settings",
    VOICE_INPUT_SET_SETTINGS: "voice-input:set-settings",
    VOICE_INPUT_START: "voice-input:start",
    VOICE_INPUT_STOP: "voice-input:stop",
    VOICE_INPUT_AUDIO_CHUNK: "voice-input:audio-chunk",
    VOICE_INPUT_TRANSCRIPTION_DELTA: "voice-input:transcription-delta",
    VOICE_INPUT_TRANSCRIPTION_COMPLETE: "voice-input:transcription-complete",
    VOICE_INPUT_ERROR: "voice-input:error",
    VOICE_INPUT_STATUS: "voice-input:status",
    VOICE_INPUT_CHECK_MIC_PERMISSION: "voice-input:check-mic-permission",
    VOICE_INPUT_REQUEST_MIC_PERMISSION: "voice-input:request-mic-permission",
    VOICE_INPUT_OPEN_MIC_SETTINGS: "voice-input:open-mic-settings",
    VOICE_INPUT_VALIDATE_API_KEY: "voice-input:validate-api-key",
    VOICE_INPUT_FLUSH_PARAGRAPH: "voice-input:flush-paragraph",
    VOICE_INPUT_PARAGRAPH_BOUNDARY: "voice-input:paragraph-boundary",
    VOICE_INPUT_FILE_TOKEN_RESOLVED: "voice-input:file-token-resolved",
  },
}));

// ── Module import (once) ───────────────────────────────────────────────────
import { registerVoiceInputHandlers, getVoiceSettings } from "../voiceInput.js";

// ── Helpers ────────────────────────────────────────────────────────────────

type SentMessage = { channel: string; payload: unknown };

function buildMainWindow(): {
  webContents: { send: ReturnType<typeof vi.fn> };
  isDestroyed: ReturnType<typeof vi.fn>;
  __sent: SentMessage[];
} {
  const sentMessages: SentMessage[] = [];
  return {
    webContents: {
      send: vi.fn((channel: string, payload: unknown) => {
        sentMessages.push({ channel, payload });
      }),
    },
    isDestroyed: vi.fn(() => false),
    __sent: sentMessages,
  };
}

function getHandler(channel: string) {
  const call = ipcMainMock.handle.mock.calls.find(([c]) => c === channel);
  if (!call) throw new Error(`No handler registered for channel: ${channel}`);
  return call[1] as (...args: unknown[]) => unknown;
}

const fakeEvent = {
  sender: { once: vi.fn(), removeListener: vi.fn(), isDestroyed: () => false },
} as unknown as Electron.IpcMainInvokeEvent;

function emitTranscriptionEvent(event: MockTranscriptionEvent) {
  if (!shared.transcriptionEventCallback) {
    throw new Error("No transcription event callback registered — was handleStart called?");
  }
  shared.transcriptionEventCallback(event);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("voiceInput — IPC handler surface", () => {
  let win: ReturnType<typeof buildMainWindow>;
  let cleanup: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    shared.transcriptionEventCallback = null;
    shared.drainResolve = null;
    shared.useDeferredDrain = false;

    win = buildMainWindow();
    cleanup = registerVoiceInputHandlers({
      mainWindow: win as unknown as Electron.BrowserWindow,
    } as Parameters<typeof registerVoiceInputHandlers>[0]);

    const handleStart = getHandler("voice-input:start");
    await (handleStart as (e: unknown) => Promise<unknown>)(fakeEvent);
  });

  afterEach(() => {
    cleanup?.();
  });

  it("forwards transcription complete events to the renderer", () => {
    emitTranscriptionEvent({ type: "complete", text: "Hello world" });

    const completeMsg = win.__sent.find((m) => m.channel === "voice-input:transcription-complete");
    expect(completeMsg).toBeDefined();
    expect(completeMsg?.payload).toEqual({ text: "Hello world", willCorrect: false });
  });

  it("paragraph_boundary forwards a payload with only rawText", () => {
    emitTranscriptionEvent({ type: "paragraph_boundary" });

    const boundaryMsg = win.__sent.find((m) => m.channel === "voice-input:paragraph-boundary");
    expect(boundaryMsg).toBeDefined();
    expect(boundaryMsg?.payload).toEqual({ rawText: null });
  });

  it("stop returns { rawText: null }", async () => {
    const handleStop = getHandler("voice-input:stop");
    const result = (await (handleStop as (e: unknown) => Promise<unknown>)(fakeEvent)) as {
      rawText: string | null;
    };
    expect(result).toEqual({ rawText: null });
  });

  it("flushParagraph returns { rawText: null }", () => {
    const handleFlush = getHandler("voice-input:flush-paragraph");
    const result = handleFlush(fakeEvent) as { rawText: string | null };
    expect(result).toEqual({ rawText: null });
  });

  it("status events are forwarded to the renderer unchanged", () => {
    for (const status of ["connecting", "recording", "finishing", "idle", "error"] as const) {
      emitTranscriptionEvent({ type: "status", status });
    }

    const statusMsgs = win.__sent.filter((m) => m.channel === "voice-input:status");
    const statuses = statusMsgs.map((m) => m.payload as string);
    expect(statuses).toEqual(["connecting", "recording", "finishing", "idle", "error"]);
  });
});

describe("voiceInput — spoken-command paragraphing", () => {
  let win: ReturnType<typeof buildMainWindow>;
  let cleanup: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    shared.transcriptionEventCallback = null;
    shared.drainResolve = null;
    shared.useDeferredDrain = false;

    win = buildMainWindow();
    cleanup = registerVoiceInputHandlers({
      mainWindow: win as unknown as Electron.BrowserWindow,
    } as Parameters<typeof registerVoiceInputHandlers>[0]);

    const handleStart = getHandler("voice-input:start");
    await (handleStart as (e: unknown) => Promise<unknown>)(fakeEvent);
  });

  afterEach(() => {
    cleanup?.();
  });

  it("splits text containing a literal \\n\\n into separate completes with a paragraph-boundary between", () => {
    // OpenAI may emit a `\n\n` inside a single completed item when the model
    // detects a paragraph break. The handler is expected to split on that
    // boundary and interleave a paragraph-boundary event.
    emitTranscriptionEvent({
      type: "complete",
      text: "first sentence\n\nsecond sentence",
    });

    const splitEvents = win.__sent.filter(
      (m) =>
        m.channel === "voice-input:transcription-complete" ||
        m.channel === "voice-input:paragraph-boundary"
    );
    expect(splitEvents).toEqual([
      {
        channel: "voice-input:transcription-complete",
        payload: { text: "first sentence", willCorrect: false },
      },
      {
        channel: "voice-input:paragraph-boundary",
        payload: { rawText: null, correctionId: null },
      },
      {
        channel: "voice-input:transcription-complete",
        payload: { text: "second sentence", willCorrect: false },
      },
    ]);
  });

  it("strips a trailing 'new paragraph' command and emits only the prefix as one complete", () => {
    // applyDictationCommands turns "hello new paragraph" into "hello\n\n";
    // the handler's split + filter(Boolean) drops the trailing empty part,
    // so a single complete fires with no paragraph-boundary.
    emitTranscriptionEvent({ type: "complete", text: "hello new paragraph" });

    const completes = win.__sent.filter((m) => m.channel === "voice-input:transcription-complete");
    const boundaries = win.__sent.filter((m) => m.channel === "voice-input:paragraph-boundary");
    expect(completes).toHaveLength(1);
    expect(completes[0]?.payload).toEqual({ text: "hello", willCorrect: false });
    expect(boundaries).toHaveLength(0);
  });

  it("emits nothing when the utterance is just a paragraph command", () => {
    emitTranscriptionEvent({ type: "complete", text: "new paragraph" });

    const completes = win.__sent.filter((m) => m.channel === "voice-input:transcription-complete");
    const boundaries = win.__sent.filter((m) => m.channel === "voice-input:paragraph-boundary");
    expect(completes).toHaveLength(0);
    expect(boundaries).toHaveLength(0);
  });

  it("rewrites a trailing 'period' command into '.' on the emitted text", () => {
    emitTranscriptionEvent({ type: "complete", text: "hello period" });

    const complete = win.__sent.find((m) => m.channel === "voice-input:transcription-complete");
    expect(complete?.payload).toEqual({ text: "hello.", willCorrect: false });
  });

  it("leaves a mid-sentence 'new paragraph' literal (applyDictationCommands is trailing-only)", () => {
    emitTranscriptionEvent({
      type: "complete",
      text: "hello new paragraph world",
    });

    const completes = win.__sent.filter((m) => m.channel === "voice-input:transcription-complete");
    const boundaries = win.__sent.filter((m) => m.channel === "voice-input:paragraph-boundary");
    expect(completes).toHaveLength(1);
    expect(completes[0]?.payload).toEqual({
      text: "hello new paragraph world",
      willCorrect: false,
    });
    expect(boundaries).toHaveLength(0);
  });
});

describe("voiceInput — manual paragraphing strategy", () => {
  let win: ReturnType<typeof buildMainWindow>;
  let cleanup: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    shared.transcriptionEventCallback = null;
    shared.drainResolve = null;
    shared.useDeferredDrain = false;

    const { store } = await import("../../../store.js");
    vi.mocked(store.get).mockReturnValue({
      enabled: true,
      openaiApiKey: "sk-test",
      correctionEnabled: true,
      correctionModel: "gpt-5-mini",
      customDictionary: [],
      correctionCustomInstructions: "",
      language: "en",
      transcriptionModel: "gpt-realtime-whisper",
      paragraphingStrategy: "manual",
      resolveFileLinks: true,
    });

    win = buildMainWindow();
    cleanup = registerVoiceInputHandlers({
      mainWindow: win as unknown as Electron.BrowserWindow,
    } as Parameters<typeof registerVoiceInputHandlers>[0]);

    const handleStart = getHandler("voice-input:start");
    await (handleStart as (e: unknown) => Promise<unknown>)(fakeEvent);
  });

  afterEach(() => {
    cleanup?.();
  });

  it("leaves spoken commands literal and does not emit paragraph boundaries", () => {
    emitTranscriptionEvent({
      type: "complete",
      text: "hello new paragraph world",
    });

    const completes = win.__sent.filter((m) => m.channel === "voice-input:transcription-complete");
    const boundaries = win.__sent.filter((m) => m.channel === "voice-input:paragraph-boundary");
    expect(completes).toHaveLength(1);
    expect(completes[0]?.payload).toEqual({
      text: "hello new paragraph world",
      willCorrect: false,
    });
    expect(boundaries).toHaveLength(0);
  });
});

describe("getVoiceSettings migration", () => {
  beforeEach(async () => {
    const { store } = await import("../../../store.js");
    vi.mocked(store.set).mockReset();
    vi.mocked(store.get).mockReset();
  });

  it("migrates legacy correctionApiKey (sk-*) into openaiApiKey and persists cleanup", async () => {
    const { store } = await import("../../../store.js");
    vi.mocked(store.get).mockReturnValueOnce({
      enabled: true,
      correctionApiKey: "sk-correction",
      language: "en",
      customDictionary: [],
      transcriptionModel: "gpt-realtime-whisper",
      correctionEnabled: false,
      correctionModel: "gpt-5-mini",
      correctionCustomInstructions: "",
      paragraphingStrategy: "spoken-command",
    });

    const settings = getVoiceSettings();

    expect(settings.openaiApiKey).toBe("sk-correction");
    expect(vi.mocked(store.set)).toHaveBeenCalledWith(
      "voiceInput",
      expect.objectContaining({ openaiApiKey: "sk-correction" })
    );
    // Persisted object should not retain legacy keys.
    const persisted = (
      vi.mocked(store.set).mock.calls[0] as unknown as [string, Record<string, unknown>]
    )[1];
    expect(persisted).not.toHaveProperty("correctionApiKey");
    expect(persisted).not.toHaveProperty("deepgramApiKey");
    expect(persisted).not.toHaveProperty("apiKey");
  });

  it("migrates first-generation apiKey (sk-*) into openaiApiKey", async () => {
    const { store } = await import("../../../store.js");
    vi.mocked(store.get).mockReturnValueOnce({
      enabled: true,
      apiKey: "sk-original",
    });

    const settings = getVoiceSettings();

    expect(settings.openaiApiKey).toBe("sk-original");
    expect(vi.mocked(store.set)).toHaveBeenCalledOnce();
  });

  it("drops deepgramApiKey without carrying it into openaiApiKey", async () => {
    const { store } = await import("../../../store.js");
    vi.mocked(store.get).mockReturnValueOnce({
      enabled: true,
      deepgramApiKey: "dg-xxx",
    });

    const settings = getVoiceSettings();

    expect(settings.openaiApiKey).toBe("");
    // Cleanup is still persisted so the dropped key disappears from disk.
    expect(vi.mocked(store.set)).toHaveBeenCalledOnce();
    const persisted = (
      vi.mocked(store.set).mock.calls[0] as unknown as [string, Record<string, unknown>]
    )[1];
    expect(persisted).not.toHaveProperty("deepgramApiKey");
  });

  it("does not overwrite an existing openaiApiKey when legacy fields are present", async () => {
    const { store } = await import("../../../store.js");
    vi.mocked(store.get).mockReturnValueOnce({
      enabled: true,
      openaiApiKey: "sk-new",
      correctionApiKey: "sk-old",
    });

    const settings = getVoiceSettings();

    expect(settings.openaiApiKey).toBe("sk-new");
  });

  it("does not write to disk when no legacy fields are present", async () => {
    const { store } = await import("../../../store.js");
    vi.mocked(store.get).mockReturnValueOnce({
      enabled: true,
      openaiApiKey: "sk-present",
    });

    getVoiceSettings();

    expect(vi.mocked(store.set)).not.toHaveBeenCalled();
  });
});
