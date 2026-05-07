/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";

type GainMock = {
  gain: { setTargetAtTime: ReturnType<typeof vi.fn>; value: number };
  connect: ReturnType<typeof vi.fn>;
};

type SourceMock = {
  buffer: AudioBuffer | null;
  detune: { value: number };
  detuneAtStart: number | null;
  connect: ReturnType<typeof vi.fn>;
  gainNode: GainMock | null;
  start: (when?: number) => void;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
};

function createMockAudioContext() {
  const mockStart = vi.fn();
  const mockResume = vi.fn().mockResolvedValue(undefined);
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockDecodeAudioData = vi.fn();
  const sources: SourceMock[] = [];

  let state = "running";
  // Holds the gain node returned by the most recent createGain() call so
  // source.connect(gainNode) can capture it without an unsafe cast.
  let pendingGainNode: GainMock | null = null;

  const ctx = {
    get state() {
      return state;
    },
    set state(v: string) {
      state = v;
    },
    currentTime: 0,
    destination: {},
    createBufferSource: vi.fn(() => {
      const source: SourceMock = {
        buffer: null,
        detune: { value: 0 },
        detuneAtStart: null,
        connect: vi.fn(() => {
          if (pendingGainNode) {
            source.gainNode = pendingGainNode;
            pendingGainNode = null;
          }
        }),
        gainNode: null,
        start: (when?: number) => {
          source.detuneAtStart = source.detune.value;
          mockStart(when);
        },
        stop: vi.fn(),
        onended: null,
      };
      sources.push(source);
      return source;
    }),
    createGain: vi.fn(() => {
      const gainNode: GainMock = {
        gain: { setTargetAtTime: vi.fn(), value: 1 },
        connect: vi.fn(),
      };
      pendingGainNode = gainNode;
      return gainNode;
    }),
    decodeAudioData: mockDecodeAudioData,
    resume: mockResume,
    close: mockClose,
  };

  return { ctx, mockStart, mockResume, mockClose, mockDecodeAudioData, sources };
}

describe("WebAudioService", () => {
  async function setupTest(opts: { ctxState?: string } = {}) {
    vi.resetModules();
    vi.restoreAllMocks();

    const { ctx, ...mocks } = createMockAudioContext();
    if (opts.ctxState) ctx.state = opts.ctxState;

    vi.stubGlobal("AudioContext", function () {
      return ctx;
    });

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electron = {
      sound: { getSoundDir: vi.fn().mockResolvedValue("/app/resources/sounds") },
    };

    const service = await import("@/services/WebAudioService");

    const fakeBuffer = { duration: 1, length: 44100 } as AudioBuffer;
    function mockSuccessfulFetch() {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
      });
      mocks.mockDecodeAudioData.mockResolvedValueOnce(fakeBuffer);
    }

    return { service, ctx, mockFetch, mockSuccessfulFetch, fakeBuffer, ...mocks };
  }

  it("plays a sound by fetching via daintree-file:// and decoding", async () => {
    const { service, mockFetch, mockSuccessfulFetch, mockDecodeAudioData, mockStart, sources } =
      await setupTest();
    mockSuccessfulFetch();

    await service.playSound("chime.wav");

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("daintree-file://"));
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("chime.wav"));
    expect(mockDecodeAudioData).toHaveBeenCalled();
    expect(sources[0]!.connect).toHaveBeenCalled();
    expect(sources[0]!.gainNode).toBeTruthy();
    expect(mockStart).toHaveBeenCalledWith(0);
  });

  it("caches decoded buffers on second play", async () => {
    const { service, mockFetch, mockSuccessfulFetch, mockDecodeAudioData, ctx } = await setupTest();
    mockSuccessfulFetch();

    await service.playSound("chime.wav");
    await service.playSound("chime.wav");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockDecodeAudioData).toHaveBeenCalledTimes(1);
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(2);
  });

  it("cancelSound fades out via gain ramp and schedules stop after the tail", async () => {
    const { service, mockSuccessfulFetch, sources, ctx } = await setupTest();
    mockSuccessfulFetch();

    await service.playSound("chime.wav");
    service.cancelSound();

    const gainNode = sources[0]!.gainNode!;
    expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0, ctx.currentTime, 0.015);
    expect(sources[0]!.stop).toHaveBeenCalledWith(ctx.currentTime + 0.1);
  });

  it("does not stop in-flight sources when starting a new one (polyphony)", async () => {
    const { service, mockSuccessfulFetch, sources } = await setupTest();
    mockSuccessfulFetch();
    mockSuccessfulFetch();

    await service.playSound("first.wav");
    await service.playSound("second.wav");

    expect(sources).toHaveLength(2);
    expect(sources[0]!.stop).not.toHaveBeenCalled();
    expect(sources[1]!.stop).not.toHaveBeenCalled();
  });

  it("evicts the oldest voice via fade when MAX_VOICES (4) is exceeded", async () => {
    const { service, mockSuccessfulFetch, sources, ctx } = await setupTest();
    for (let i = 0; i < 5; i++) mockSuccessfulFetch();

    for (let i = 0; i < 5; i++) {
      await service.playSound(`voice${i}.wav`);
    }

    expect(sources).toHaveLength(5);
    // First voice is evicted via fadeOut
    expect(sources[0]!.gainNode!.gain.setTargetAtTime).toHaveBeenCalledWith(
      0,
      ctx.currentTime,
      0.015
    );
    expect(sources[0]!.stop).toHaveBeenCalledWith(ctx.currentTime + 0.1);
    // Voices 1-4 are untouched
    for (let i = 1; i < 5; i++) {
      expect(sources[i]!.stop).not.toHaveBeenCalled();
    }
  });

  it("onended removes the correct voice by identity", async () => {
    const { service, mockSuccessfulFetch, sources } = await setupTest();
    for (let i = 0; i < 3; i++) mockSuccessfulFetch();

    await service.playSound("a.wav");
    await service.playSound("b.wav");
    await service.playSound("c.wav");

    expect(sources).toHaveLength(3);
    sources[1]!.onended?.();

    // Cancel should now only fade voices A and C — voice B was already removed
    service.cancelSound();
    expect(sources[0]!.stop).toHaveBeenCalled();
    expect(sources[1]!.stop).not.toHaveBeenCalled();
    expect(sources[2]!.stop).toHaveBeenCalled();
  });

  it("handles fetch failure gracefully", async () => {
    const { service, mockFetch, ctx } = await setupTest();
    mockFetch.mockResolvedValueOnce({ ok: false });

    await service.playSound("missing.wav");

    expect(ctx.createBufferSource).not.toHaveBeenCalled();
  });

  it("resumes a suspended AudioContext", async () => {
    const { service, mockSuccessfulFetch, mockResume } = await setupTest({
      ctxState: "suspended",
    });
    mockSuccessfulFetch();

    await service.playSound("resume-test.wav");

    expect(mockResume).toHaveBeenCalled();
  });

  it("applies detune to the source before start when provided", async () => {
    const { service, mockSuccessfulFetch, sources, mockStart } = await setupTest();
    mockSuccessfulFetch();

    await service.playSound("pulse.wav", 12);

    // Snapshot captured at start() proves detune was assigned BEFORE start,
    // not after — the entire premise of this feature.
    expect(sources[0]!.detuneAtStart).toBe(12);
    expect(mockStart).toHaveBeenCalledWith(0);
  });

  it("leaves detune at default (0) when no detune argument is passed", async () => {
    const { service, mockSuccessfulFetch, sources } = await setupTest();
    mockSuccessfulFetch();

    await service.playSound("chime.wav");

    expect(sources[0]!.detuneAtStart).toBe(0);
  });

  it("respects an explicit detune of 0 (does not drop via truthiness)", async () => {
    const { service, mockSuccessfulFetch, sources } = await setupTest();
    mockSuccessfulFetch();

    await service.playSound("pulse.wav", 0);

    expect(sources[0]!.detuneAtStart).toBe(0);
  });

  it("cancelSound during async decode aborts the pending playback", async () => {
    const { service, mockFetch, mockDecodeAudioData, sources, ctx } = await setupTest();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    });
    let resolveDecode!: (buffer: AudioBuffer) => void;
    mockDecodeAudioData.mockReturnValueOnce(
      new Promise<AudioBuffer>((r) => {
        resolveDecode = r;
      })
    );

    const playPromise = service.playSound("chime.wav");
    service.cancelSound();
    resolveDecode({ duration: 1, length: 44100 } as AudioBuffer);
    await playPromise;

    expect(sources).toHaveLength(0);
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
  });

  it("does not pollute activeVoices when source.start throws", async () => {
    const { service, ctx, mockSuccessfulFetch, sources } = await setupTest();
    for (let i = 0; i < 5; i++) mockSuccessfulFetch();

    const originalCreate = ctx.createBufferSource;
    let throwOnce = true;
    ctx.createBufferSource = vi.fn(() => {
      const source = originalCreate();
      if (throwOnce) {
        throwOnce = false;
        source.start = vi.fn(() => {
          throw new Error("InvalidStateError");
        });
      }
      return source;
    });

    await service.playSound("first.wav");
    expect(sources).toHaveLength(1);

    // Four more successful plays must not be evicted by the failed voice
    await service.playSound("a.wav");
    await service.playSound("b.wav");
    await service.playSound("c.wav");
    await service.playSound("d.wav");

    // Voices a/b/c/d should still be live (no fade) — failed first voice was popped
    expect(sources[1]!.stop).not.toHaveBeenCalled();
    expect(sources[2]!.stop).not.toHaveBeenCalled();
    expect(sources[3]!.stop).not.toHaveBeenCalled();
    expect(sources[4]!.stop).not.toHaveBeenCalled();
  });

  it("dispose closes the AudioContext", async () => {
    const { service, mockSuccessfulFetch, mockClose } = await setupTest();
    mockSuccessfulFetch();

    await service.playSound("dispose-test.wav");
    service.dispose();

    expect(mockClose).toHaveBeenCalled();
  });
});
