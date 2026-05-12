import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceInputSettings } from "../../../shared/types/ipc/api.js";
import { VoiceTranscriptionService } from "../VoiceTranscriptionService.js";
import type { VoiceTranscriptionEvent } from "../VoiceTranscriptionService.js";

// ── Mock WebSocket ────────────────────────────────────────────────────────────
//
// The service uses Node 22's global `WebSocket` (Electron 41 main process). We
// stub the global so each test can drive the lifecycle (open / message / error
// / close) deterministically. Constructor options (`{ headers }`) are captured
// for header assertions; `sent` records the JSON payloads the service emits.

interface MockOptions {
  headers: Record<string, string>;
}

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  url: string;
  options: MockOptions;
  readyState: number = MockWebSocket.CONNECTING;
  sent: string[] = [];
  closeCalls = 0;
  closeCode?: number;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: { message?: string; error?: unknown }) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;

  constructor(url: string, _protocols: string[] | undefined, options: MockOptions) {
    this.url = url;
    this.options = options;
    instances.push(this);
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(code?: number): void {
    this.closeCalls++;
    this.closeCode = code;
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(type: string, payload: Record<string, unknown> = {}): void {
    this.onmessage?.({ data: JSON.stringify({ type, ...payload }) });
  }

  simulateRawMessage(data: string): void {
    this.onmessage?.({ data });
  }

  simulateError(error?: unknown, message?: string): void {
    this.onerror?.({ error, message });
  }

  simulateClose(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  sentJson(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}

const instances: MockWebSocket[] = [];
let throwOnConstruct = false;
let constructError: Error | null = null;
class ThrowingWebSocket {
  constructor(_url: string, _protocols: string[] | undefined, _options: MockOptions) {
    throw constructError ?? new Error("WebSocket construction failed");
  }
}

const WS_FACTORY = function (
  url: string,
  protocols: string[] | undefined,
  options: MockOptions
): MockWebSocket | ThrowingWebSocket {
  if (throwOnConstruct) {
    return new ThrowingWebSocket(url, protocols, options);
  }
  return new MockWebSocket(url, protocols, options);
} as unknown as typeof WebSocket;

const BASE_SETTINGS: VoiceInputSettings = {
  enabled: true,
  openaiApiKey: "sk-test",
  language: "en",
  customDictionary: [],
  transcriptionModel: "gpt-realtime-whisper",
  correctionEnabled: false,
  correctionModel: "gpt-5-mini",
  correctionCustomInstructions: "",
  paragraphingStrategy: "spoken-command",
  resolveFileLinks: true,
};

function latestInstance(): MockWebSocket {
  const instance = instances.at(-1);
  if (!instance) throw new Error("No MockWebSocket instance created");
  return instance;
}

/** Advance the service through connect → ready. Returns the active mock socket. */
async function bringSessionReady(
  service: VoiceTranscriptionService,
  settings: VoiceInputSettings = BASE_SETTINGS
): Promise<{ socket: MockWebSocket; result: { ok: true } | { ok: false; error: string } }> {
  const startPromise = service.start(settings);
  // start() runs synchronously through to assigning pendingStart; allow the
  // microtask queue to settle so the constructor + onopen wiring is in place.
  await Promise.resolve();
  const socket = latestInstance();
  socket.simulateOpen();
  socket.simulateMessage("session.updated");
  const result = await startPromise;
  return { socket, result };
}

describe("VoiceTranscriptionService", () => {
  beforeEach(() => {
    instances.length = 0;
    throwOnConstruct = false;
    constructError = null;
    vi.stubGlobal("WebSocket", WS_FACTORY);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ── Startup / readiness ──────────────────────────────────────────────────

  it("fails to start when no OpenAI API key is configured", async () => {
    const service = new VoiceTranscriptionService();
    const result = await service.start({ ...BASE_SETTINGS, openaiApiKey: "" });
    expect(result).toEqual({ ok: false, error: "OpenAI API key not configured" });
    expect(instances).toHaveLength(0);
  });

  it("constructs the WebSocket with the realtime URL and auth headers", async () => {
    const service = new VoiceTranscriptionService();
    void service.start({ ...BASE_SETTINGS, openaiApiKey: "sk-abc" });
    await Promise.resolve();
    const socket = latestInstance();
    expect(socket.url).toBe(
      "wss://api.openai.com/v1/realtime?model=gpt-realtime-whisper"
    );
    expect(socket.options.headers.Authorization).toBe("Bearer sk-abc");
    expect(socket.options.headers["OpenAI-Beta"]).toBe("realtime=v1");
    service.stop();
  });

  it("sends session.update on WebSocket open and stays not-ready until session.updated", async () => {
    const service = new VoiceTranscriptionService();
    const statuses: string[] = [];
    service.onEvent((e) => {
      if (e.type === "status") statuses.push(e.status);
    });

    const startPromise = service.start(BASE_SETTINGS);
    expect(statuses).toEqual(["connecting"]);
    await Promise.resolve();
    const socket = latestInstance();
    socket.simulateOpen();

    expect(socket.sent).toHaveLength(1);
    const sessionUpdate = JSON.parse(socket.sent[0]) as {
      type: string;
      session: { type: string; audio: { input: Record<string, unknown> } };
    };
    expect(sessionUpdate.type).toBe("session.update");
    expect(sessionUpdate.session.type).toBe("transcription");
    expect(sessionUpdate.session.audio.input).toMatchObject({
      format: { type: "audio/pcm", rate: 24000 },
      transcription: { model: "gpt-realtime-whisper", language: "en" },
      turn_detection: { type: "server_vad" },
    });

    // Still not ready — start() must wait for session.updated
    expect(statuses).toEqual(["connecting"]);

    socket.simulateMessage("session.updated");
    await expect(startPromise).resolves.toEqual({ ok: true });
    expect(statuses).toEqual(["connecting", "recording"]);
  });

  it("uses the configured language in session.update", async () => {
    const service = new VoiceTranscriptionService();
    void service.start({ ...BASE_SETTINGS, language: "es" });
    await Promise.resolve();
    const socket = latestInstance();
    socket.simulateOpen();
    const payload = JSON.parse(socket.sent[0]) as {
      session: { audio: { input: { transcription: { language: string } } } };
    };
    expect(payload.session.audio.input.transcription.language).toBe("es");
    service.stop();
  });

  it("settles a pending start when the session is stopped before session.updated", async () => {
    const service = new VoiceTranscriptionService();
    const startPromise = service.start(BASE_SETTINGS);
    await Promise.resolve();
    latestInstance().simulateOpen();
    // No session.updated yet — stop before ready.
    service.stop();
    await expect(startPromise).resolves.toEqual({
      ok: false,
      error: "Voice session stopped",
    });
  });

  it("does not emit idle when start() replaces a previous session", async () => {
    const service = new VoiceTranscriptionService();
    await bringSessionReady(service);

    const events: VoiceTranscriptionEvent[] = [];
    service.onEvent((e) => events.push(e));

    const secondPromise = service.start(BASE_SETTINGS);
    const idleBeforeConnect = events.filter((e) => e.type === "status" && e.status === "idle");
    expect(idleBeforeConnect).toHaveLength(0);

    await Promise.resolve();
    const socket = latestInstance();
    socket.simulateOpen();
    socket.simulateMessage("session.updated");
    await secondPromise;
  });

  it("times out with an error if session.updated does not arrive within 10s", async () => {
    const service = new VoiceTranscriptionService();
    const errors: string[] = [];
    service.onEvent((e) => {
      if (e.type === "error") errors.push(e.message);
    });

    const startPromise = service.start(BASE_SETTINGS);
    await Promise.resolve();
    latestInstance().simulateOpen();
    // Never simulate session.updated.

    vi.advanceTimersByTime(10_000);

    await expect(startPromise).resolves.toEqual({ ok: false, error: "Connection timed out" });
    expect(errors).toContain("Connection timed out");
  });

  // ── Delta / complete events ──────────────────────────────────────────────

  it("emits delta for incremental transcription deltas", async () => {
    const service = new VoiceTranscriptionService();
    const deltas: string[] = [];
    service.onEvent((e) => {
      if (e.type === "delta") deltas.push(e.text);
    });

    const { socket } = await bringSessionReady(service);
    socket.simulateMessage("conversation.item.input_audio_transcription.delta", {
      delta: "Hello",
    });
    socket.simulateMessage("conversation.item.input_audio_transcription.delta", {
      delta: " world",
    });

    expect(deltas).toEqual(["Hello", " world"]);
  });

  it("ignores empty deltas", async () => {
    const service = new VoiceTranscriptionService();
    const deltas: string[] = [];
    service.onEvent((e) => {
      if (e.type === "delta") deltas.push(e.text);
    });

    const { socket } = await bringSessionReady(service);
    socket.simulateMessage("conversation.item.input_audio_transcription.delta", { delta: "" });
    socket.simulateMessage("conversation.item.input_audio_transcription.delta", {});

    expect(deltas).toEqual([]);
  });

  it("emits complete with stub confidence on transcription.completed", async () => {
    const service = new VoiceTranscriptionService();
    const events: VoiceTranscriptionEvent[] = [];
    service.onEvent((e) => events.push(e));

    const { socket } = await bringSessionReady(service);
    socket.simulateMessage("conversation.item.input_audio_transcription.completed", {
      transcript: "Hello world",
    });

    const complete = events.find((e) => e.type === "complete");
    expect(complete).toEqual({
      type: "complete",
      text: "Hello world",
      confidence: { minConfidence: 1.0, wordCount: 0, uncertainWords: [], words: [] },
    });
  });

  it("does not emit complete when transcript is empty or whitespace-only", async () => {
    const service = new VoiceTranscriptionService();
    const completes: string[] = [];
    service.onEvent((e) => {
      if (e.type === "complete") completes.push(e.text);
    });

    const { socket } = await bringSessionReady(service);
    socket.simulateMessage("conversation.item.input_audio_transcription.completed", {
      transcript: "",
    });
    socket.simulateMessage("conversation.item.input_audio_transcription.completed", {
      transcript: "   ",
    });
    socket.simulateMessage("conversation.item.input_audio_transcription.completed", {});

    expect(completes).toEqual([]);
  });

  // ── Audio chunk handling ─────────────────────────────────────────────────

  it("sends audio chunks as base64 input_audio_buffer.append after session.updated", async () => {
    const service = new VoiceTranscriptionService();
    const { socket } = await bringSessionReady(service);

    const chunk = new Uint8Array([1, 2, 3, 4]).buffer;
    const sentBeforeAudio = socket.sent.length;
    service.sendAudioChunk(chunk);
    expect(socket.sent.length).toBe(sentBeforeAudio + 1);
    const payload = JSON.parse(socket.sent.at(-1)!) as { type: string; audio: string };
    expect(payload.type).toBe("input_audio_buffer.append");
    expect(payload.audio).toBe(Buffer.from(chunk).toString("base64"));
  });

  it("buffers pre-connect audio chunks and flushes them after session.updated", async () => {
    const service = new VoiceTranscriptionService();
    const startPromise = service.start(BASE_SETTINGS);
    await Promise.resolve();
    const socket = latestInstance();

    // Queue chunks before the WS open / session.updated round-trip.
    service.sendAudioChunk(new Uint8Array([1]).buffer);
    service.sendAudioChunk(new Uint8Array([2]).buffer);

    expect(socket.sent).toHaveLength(0);

    socket.simulateOpen();
    // session.update sent on open, no audio yet
    expect(socket.sent).toHaveLength(1);

    socket.simulateMessage("session.updated");
    await startPromise;

    const audioPayloads = socket
      .sentJson()
      .filter((p) => p.type === "input_audio_buffer.append")
      .map((p) => p.audio as string);
    expect(audioPayloads).toEqual([
      Buffer.from(new Uint8Array([1])).toString("base64"),
      Buffer.from(new Uint8Array([2])).toString("base64"),
    ]);
  });

  it("caps the pre-connect buffer at 100 chunks and warns once on overflow", async () => {
    const service = new VoiceTranscriptionService();
    void service.start(BASE_SETTINGS);
    await Promise.resolve();

    // Push 105 chunks before session.updated — last 5 should be dropped.
    for (let i = 0; i < 105; i++) {
      service.sendAudioChunk(new Uint8Array([i % 256]).buffer);
    }
    const socket = latestInstance();
    socket.simulateOpen();
    socket.simulateMessage("session.updated");

    const audioCount = socket.sentJson().filter((p) => p.type === "input_audio_buffer.append")
      .length;
    expect(audioCount).toBe(100);
    service.stop();
  });

  it("drops audio chunks while draining", async () => {
    const service = new VoiceTranscriptionService();
    const { socket } = await bringSessionReady(service);

    const drainPromise = service.stopGracefully();
    const sentAtStartOfDrain = socket.sent.length;
    service.sendAudioChunk(new Uint8Array([99]).buffer);
    expect(socket.sent.length).toBe(sentAtStartOfDrain);

    socket.simulateMessage("conversation.item.input_audio_transcription.completed", {
      transcript: "done",
    });
    await drainPromise;
  });

  // ── Graceful stop / drain ────────────────────────────────────────────────

  it("sends input_audio_buffer.commit on stopGracefully and waits for completed", async () => {
    const service = new VoiceTranscriptionService();
    const statuses: string[] = [];
    service.onEvent((e) => {
      if (e.type === "status") statuses.push(e.status);
    });

    const { socket } = await bringSessionReady(service);
    const drainPromise = service.stopGracefully();
    expect(statuses).toContain("finishing");

    const commitPayloads = socket.sentJson().filter((p) => p.type === "input_audio_buffer.commit");
    expect(commitPayloads).toHaveLength(1);

    socket.simulateMessage("conversation.item.input_audio_transcription.completed", {
      transcript: "final",
    });
    await drainPromise;
    expect(statuses.at(-1)).toBe("idle");
  });

  it("drain resolves after the timeout if no completed event arrives", async () => {
    const service = new VoiceTranscriptionService();
    await bringSessionReady(service);

    const drainPromise = service.stopGracefully();
    vi.advanceTimersByTime(3_000);
    await expect(drainPromise).resolves.toBeUndefined();
  });

  it("repeated stopGracefully calls share a single in-flight drain", async () => {
    const service = new VoiceTranscriptionService();
    const { socket } = await bringSessionReady(service);

    const first = service.stopGracefully();
    const second = service.stopGracefully();

    // Only one commit is sent, even though stop was called twice.
    const commits = socket.sentJson().filter((p) => p.type === "input_audio_buffer.commit");
    expect(commits).toHaveLength(1);

    socket.simulateMessage("conversation.item.input_audio_transcription.completed", {
      transcript: "ok",
    });
    await Promise.all([first, second]);
  });

  it("stopGracefully without an open connection goes straight to idle", async () => {
    const service = new VoiceTranscriptionService();
    const statuses: string[] = [];
    service.onEvent((e) => {
      if (e.type === "status") statuses.push(e.status);
    });

    await service.stopGracefully();
    expect(statuses).toEqual(["idle"]);
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it("emits error and error status when the WebSocket reports an error", async () => {
    const service = new VoiceTranscriptionService();
    const events: VoiceTranscriptionEvent[] = [];
    service.onEvent((e) => events.push(e));

    const startPromise = service.start(BASE_SETTINGS);
    await Promise.resolve();
    const socket = latestInstance();
    socket.simulateOpen();
    socket.simulateError(new Error("network down"), "network down");

    await expect(startPromise).resolves.toEqual({ ok: false, error: "network down" });
    expect(events.some((e) => e.type === "error" && /network down/.test(e.message))).toBe(true);
    expect(events.some((e) => e.type === "status" && e.status === "error")).toBe(true);
  });

  it("propagates server-side error events", async () => {
    const service = new VoiceTranscriptionService();
    const errors: string[] = [];
    service.onEvent((e) => {
      if (e.type === "error") errors.push(e.message);
    });

    const { socket } = await bringSessionReady(service);
    socket.simulateMessage("error", {
      error: { message: "invalid_session_config", type: "invalid_request_error" },
    });

    expect(errors).toContain("invalid_session_config");
  });

  it("ignores malformed JSON messages without throwing", async () => {
    const service = new VoiceTranscriptionService();
    const events: VoiceTranscriptionEvent[] = [];
    service.onEvent((e) => events.push(e));

    const { socket } = await bringSessionReady(service);
    expect(() => socket.simulateRawMessage("not json {")).not.toThrow();

    // Service still functional afterward
    socket.simulateMessage("conversation.item.input_audio_transcription.completed", {
      transcript: "ok",
    });
    expect(events.some((e) => e.type === "complete")).toBe(true);
  });

  it("fails start when WebSocket construction throws", async () => {
    throwOnConstruct = true;
    constructError = new Error("ECONNREFUSED");
    const service = new VoiceTranscriptionService();
    const result = await service.start(BASE_SETTINGS);
    expect(result).toEqual({ ok: false, error: "ECONNREFUSED" });
  });

  // ── Reentrancy / stale-session guard ─────────────────────────────────────

  it("ignores transcript events from a stale session", async () => {
    const service = new VoiceTranscriptionService();
    const completes: string[] = [];
    service.onEvent((e) => {
      if (e.type === "complete") completes.push(e.text);
    });

    const { socket: firstSocket } = await bringSessionReady(service);
    // Start a second session; the first socket is now stale.
    const secondPromise = service.start(BASE_SETTINGS);
    await Promise.resolve();
    const secondSocket = latestInstance();
    secondSocket.simulateOpen();
    secondSocket.simulateMessage("session.updated");
    await secondPromise;

    firstSocket.simulateMessage("conversation.item.input_audio_transcription.completed", {
      transcript: "ghost",
    });

    expect(completes).toEqual([]);
  });

  // ── commitParagraphBoundary ──────────────────────────────────────────────

  it("commitParagraphBoundary resets state and does not touch the WebSocket", async () => {
    const service = new VoiceTranscriptionService();
    const { socket } = await bringSessionReady(service);
    const sentBefore = socket.sent.length;

    socket.simulateMessage("conversation.item.input_audio_transcription.delta", {
      delta: "Hello",
    });
    service.commitParagraphBoundary();

    expect(socket.sent.length).toBe(sentBefore);
    expect(socket.closeCalls).toBe(0);
  });

  // ── destroy ─────────────────────────────────────────────────────────────

  it("destroy closes the socket and clears listeners", async () => {
    const service = new VoiceTranscriptionService();
    const events: VoiceTranscriptionEvent[] = [];
    service.onEvent((e) => events.push(e));

    const { socket } = await bringSessionReady(service);
    service.destroy();
    expect(socket.closeCalls).toBe(1);

    // Listeners cleared: subsequent emits should not reach the recorded array.
    const lengthAtDestroy = events.length;
    // Spawn a brand-new session — the listener from before destroy should be gone.
    const { socket: socket2 } = await bringSessionReady(service);
    socket2.simulateMessage("conversation.item.input_audio_transcription.completed", {
      transcript: "after destroy",
    });
    expect(events.length).toBe(lengthAtDestroy);
  });
});
