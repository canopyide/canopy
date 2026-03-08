import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @google-cloud/speech v2 client
const speechMock = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;

  class MockStream {
    private handlers = new Map<string, Set<Handler>>();
    written: unknown[] = [];
    ended = false;

    on(event: string, handler: Handler) {
      const set = this.handlers.get(event) ?? new Set<Handler>();
      set.add(handler);
      this.handlers.set(event, set);
      return this;
    }

    write(payload: unknown) {
      this.written.push(payload);
      return true;
    }

    end() {
      this.ended = true;
      this.emit("end");
    }

    emit(event: string, ...args: unknown[]) {
      const listeners = this.handlers.get(event);
      if (!listeners) return;
      for (const h of listeners) h(...args);
    }
  }

  const streams: MockStream[] = [];

  class MockSpeechClient {
    closed = false;
    _streamingRecognize() {
      const stream = new MockStream();
      streams.push(stream);
      return stream;
    }
    close() {
      this.closed = true;
    }
  }

  return { MockSpeechClient, streams };
});

vi.mock("@google-cloud/speech", () => ({
  v2: {
    SpeechClient: speechMock.MockSpeechClient,
  },
}));

import { VoiceTranscriptionService } from "../VoiceTranscriptionService.js";

const BASE_SETTINGS = {
  enabled: true,
  googleCloudCredentialPath: "/fake/service-account.json",
  geminiApiKey: "",
  language: "en",
  customDictionary: [],
  correctionEnabled: false,
  correctionCustomInstructions: "",
};

describe("VoiceTranscriptionService", () => {
  beforeEach(() => {
    speechMock.streams.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns error when no credential path is configured", async () => {
    const service = new VoiceTranscriptionService();
    const result = await service.start({
      ...BASE_SETTINGS,
      googleCloudCredentialPath: "",
    });
    expect(result).toEqual({ ok: false, error: "Google Cloud service account key not configured" });
  });

  it("transitions from connecting to recording on start", async () => {
    const service = new VoiceTranscriptionService();
    const statuses: string[] = [];

    service.onEvent((event) => {
      if (event.type === "status") statuses.push(event.status);
    });

    const result = await service.start(BASE_SETTINGS);

    expect(result).toEqual({ ok: true });
    expect(statuses).toContain("connecting");
    expect(statuses.at(-1)).toBe("recording");

    service.destroy();
  });

  it("writes config as the first message to the stream", async () => {
    const service = new VoiceTranscriptionService();
    await service.start(BASE_SETTINGS);

    const stream = speechMock.streams.at(-1);
    expect(stream).toBeDefined();
    expect(stream!.written.length).toBeGreaterThanOrEqual(1);

    const firstWrite = stream!.written[0] as Record<string, unknown>;
    expect(firstWrite).toHaveProperty("streamingConfig");
    const config = (firstWrite.streamingConfig as Record<string, unknown>).config as Record<
      string,
      unknown
    >;
    expect(config.model).toBe("chirp_3");

    service.destroy();
  });

  it("sends custom dictionary as phrase hints in adaptation", async () => {
    const service = new VoiceTranscriptionService();
    await service.start({
      ...BASE_SETTINGS,
      customDictionary: ["Canopy", "worktree"],
    });

    const stream = speechMock.streams.at(-1)!;
    const firstWrite = stream.written[0] as Record<string, unknown>;
    const config = (firstWrite.streamingConfig as Record<string, unknown>).config as Record<
      string,
      unknown
    >;
    expect(config).toHaveProperty("adaptation");

    service.destroy();
  });

  it("maps language code to Chirp 3 locale", async () => {
    const service = new VoiceTranscriptionService();
    await service.start({ ...BASE_SETTINGS, language: "fr" });

    const stream = speechMock.streams.at(-1)!;
    const firstWrite = stream.written[0] as Record<string, unknown>;
    const config = (firstWrite.streamingConfig as Record<string, unknown>).config as Record<
      string,
      unknown
    >;
    expect((config.languageCodes as string[])[0]).toBe("fr-FR");

    service.destroy();
  });

  it("emits delta events for interim results", async () => {
    const service = new VoiceTranscriptionService();
    const deltas: string[] = [];
    service.onEvent((e) => {
      if (e.type === "delta") deltas.push(e.text);
    });

    await service.start(BASE_SETTINGS);

    const stream = speechMock.streams.at(-1)!;
    stream.emit("data", {
      results: [{ isFinal: false, alternatives: [{ transcript: "hello" }] }],
    });

    expect(deltas).toEqual(["hello"]);
    service.destroy();
  });

  it("emits complete events for final results", async () => {
    const service = new VoiceTranscriptionService();
    const completed: string[] = [];
    service.onEvent((e) => {
      if (e.type === "complete") completed.push(e.text);
    });

    await service.start(BASE_SETTINGS);

    const stream = speechMock.streams.at(-1)!;
    stream.emit("data", {
      results: [{ isFinal: true, alternatives: [{ transcript: "hello world" }] }],
    });

    expect(completed).toEqual(["hello world"]);
    service.destroy();
  });

  it("stop() transitions to idle and ends the stream", async () => {
    const service = new VoiceTranscriptionService();
    const statuses: string[] = [];
    service.onEvent((e) => {
      if (e.type === "status") statuses.push(e.status);
    });

    await service.start(BASE_SETTINGS);
    service.stop();

    const stream = speechMock.streams.at(-1)!;
    expect(stream.ended).toBe(true);
    expect(statuses.at(-1)).toBe("idle");
  });

  it("does not emit idle when start() replaces a previous session", async () => {
    const service = new VoiceTranscriptionService();
    const events: Array<{ type: string; status?: string }> = [];
    service.onEvent((e) => events.push(e));

    await service.start(BASE_SETTINGS);
    events.length = 0;

    await service.start(BASE_SETTINGS);

    const idleEvents = events.filter((e) => e.type === "status" && e.status === "idle");
    expect(idleEvents).toHaveLength(0);

    service.destroy();
  });

  it("pre-emptive reconnect fires after 4.5 minutes", async () => {
    const service = new VoiceTranscriptionService();
    await service.start(BASE_SETTINGS);

    const streamsBefore = speechMock.streams.length;

    // Advance to just past the reconnect threshold
    await vi.advanceTimersByTimeAsync(4.5 * 60 * 1000 + 100);

    expect(speechMock.streams.length).toBeGreaterThan(streamsBefore);
    service.destroy();
  });
});
