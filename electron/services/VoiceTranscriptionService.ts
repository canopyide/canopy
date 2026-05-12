import type { VoiceInputSettings, VoiceInputStatus } from "../../shared/types/ipc/api.js";
import { formatErrorMessage } from "../../shared/utils/errorMessage.js";
import { logDebug, logInfo, logWarn, logError } from "../utils/logger.js";

const P = "[VoiceTranscription]";

const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime-whisper";
const OPENAI_TRANSCRIPTION_MODEL = "gpt-realtime-whisper";
const CONNECT_TIMEOUT_MS = 10_000;
const DRAIN_TIMEOUT_MS = 3_000;
const PRE_CONNECT_BUFFER_MAX = 100;

export interface CorrectionWord {
  word: string;
  confidence: number;
  start?: number;
  end?: number;
}

export interface SegmentConfidence {
  minConfidence: number;
  wordCount: number;
  uncertainWords: string[];
  words: CorrectionWord[];
}

export type VoiceTranscriptionEvent =
  | { type: "delta"; text: string }
  | { type: "complete"; text: string; confidence?: SegmentConfidence }
  | { type: "paragraph_boundary" }
  | { type: "error"; message: string }
  | { type: "status"; status: VoiceInputStatus };

type VoiceStartResult = { ok: true } | { ok: false; error: string };

// The OpenAI realtime endpoint speaks the WHATWG WebSocket interface; we use
// Node 22's global `WebSocket` (available in Electron 41's main process) with
// custom headers via the third constructor argument — a Node-only extension.
interface OpenAIRealtimeSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string | ArrayBufferLike | Buffer }) => void) | null;
  onerror: ((event: { message?: string; error?: unknown }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
}
type WebSocketConstructor = new (
  url: string,
  protocols: string[] | undefined,
  options: { headers: Record<string, string> }
) => OpenAIRealtimeSocket;

const STUB_CONFIDENCE: SegmentConfidence = {
  minConfidence: 1.0,
  wordCount: 0,
  uncertainWords: [],
  words: [],
};

export class VoiceTranscriptionService {
  private connection: OpenAIRealtimeSocket | null = null;
  private sessionId = 0;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<(event: VoiceTranscriptionEvent) => void> = new Set();
  private pendingStart: { sessionId: number; resolve: (result: VoiceStartResult) => void } | null =
    null;

  private preConnectBuffer: ArrayBuffer[] = [];
  private isReady = false;

  private drainResolve: (() => void) | null = null;
  private drainTimeout: ReturnType<typeof setTimeout> | null = null;
  private drainPromise: Promise<void> | null = null;
  private isDraining = false;

  /** Cumulative delta text since the last complete event — used for incremental diffs. */
  private liveText = "";

  private audioChunkCount = 0;
  private staleChunkWarned = false;
  private preConnectBufferOverflowWarned = false;

  onEvent(listener: (event: VoiceTranscriptionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clears any in-flight live-delta state so the next paragraph starts fresh.
   * Called when the user presses Enter mid-utterance; the renderer has already
   * captured the displayed text, so the service just needs to forget it. Audio
   * keeps streaming and the next `completed` event will reflect speech after
   * the boundary. We do NOT send `input_audio_buffer.commit` here — that would
   * disrupt the active server_vad turn.
   */
  commitParagraphBoundary(): void {
    this.liveText = "";
  }

  private emit(event: VoiceTranscriptionEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeout !== null) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
  }

  private settlePendingStart(sessionId: number, result: VoiceStartResult): void {
    if (this.pendingStart?.sessionId !== sessionId) return;
    const { resolve } = this.pendingStart;
    this.pendingStart = null;
    resolve(result);
  }

  async start(settings: VoiceInputSettings): Promise<VoiceStartResult> {
    if (!settings.openaiApiKey) {
      logWarn(`${P} No OpenAI API key configured`);
      return { ok: false, error: "OpenAI API key not configured" };
    }

    const mySessionId = this.sessionId + 1;
    logInfo(`${P} Starting session ${mySessionId}`, {
      language: settings.language,
      hasDictionary: settings.customDictionary.length > 0,
    });
    this.cleanupPreviousSession();
    this.sessionId = mySessionId;
    this.isReady = false;
    this.preConnectBuffer = [];
    this.liveText = "";

    this.emit({ type: "status", status: "connecting" });

    return new Promise((resolve) => {
      this.pendingStart = { sessionId: mySessionId, resolve };

      const WS = (globalThis as unknown as { WebSocket?: WebSocketConstructor }).WebSocket;
      if (!WS) {
        const message = "WebSocket is not available in this runtime";
        logError(`${P} ${message}`);
        this.emit({ type: "error", message });
        this.emit({ type: "status", status: "error" });
        this.settlePendingStart(mySessionId, { ok: false, error: message });
        return;
      }

      let connection: OpenAIRealtimeSocket;
      try {
        connection = new WS(OPENAI_REALTIME_URL, undefined, {
          headers: {
            Authorization: `Bearer ${settings.openaiApiKey}`,
            "OpenAI-Beta": "realtime=v1",
          },
        });
      } catch (err) {
        const message = formatErrorMessage(err, "Failed to open WebSocket");
        logError(`${P} ${message}`);
        this.emit({ type: "error", message });
        this.emit({ type: "status", status: "error" });
        this.settlePendingStart(mySessionId, { ok: false, error: message });
        return;
      }

      this.connection = connection;
      logDebug(`${P} Opening OpenAI realtime WebSocket`, {
        model: OPENAI_TRANSCRIPTION_MODEL,
        language: settings.language || "en",
      });

      this.connectTimeout = setTimeout(() => {
        this.connectTimeout = null;
        logError(`${P} Connection timed out (${CONNECT_TIMEOUT_MS}ms)`);
        if (this.sessionId === mySessionId) {
          this.cleanupConnection();
          this.emit({ type: "error", message: "Connection timed out" });
          this.emit({ type: "status", status: "error" });
          this.settlePendingStart(mySessionId, { ok: false, error: "Connection timed out" });
        }
      }, CONNECT_TIMEOUT_MS);

      connection.onopen = () => {
        if (this.sessionId !== mySessionId) {
          logWarn(`${P} Session expired during connect, closing`);
          try {
            connection.close();
          } catch {
            // Ignore close errors
          }
          return;
        }
        logInfo(`${P} WebSocket opened, sending session.update`);
        // TODO: pass `transcription.prompt` from settings once #7832 lands.
        const sessionUpdate = {
          type: "session.update",
          session: {
            type: "transcription",
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                transcription: {
                  model: OPENAI_TRANSCRIPTION_MODEL,
                  language: settings.language || "en",
                },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                },
              },
            },
          },
        };
        try {
          connection.send(JSON.stringify(sessionUpdate));
        } catch (err) {
          const message = formatErrorMessage(err, "Failed to send session.update");
          logError(`${P} ${message}`);
          this.handleFatalError(mySessionId, message);
        }
      };

      connection.onmessage = (event) => {
        if (this.sessionId !== mySessionId) return;
        const raw =
          typeof event.data === "string"
            ? event.data
            : event.data instanceof Buffer
              ? event.data.toString("utf8")
              : Buffer.from(event.data as ArrayBufferLike).toString("utf8");

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          logWarn(`${P} Ignoring non-JSON message`);
          return;
        }

        const type = typeof parsed.type === "string" ? parsed.type : "";
        this.handleServerEvent(mySessionId, type, parsed);
      };

      connection.onerror = (event) => {
        this.clearConnectTimeout();
        if (this.sessionId !== mySessionId) return;
        const inner = (event as { error?: unknown; message?: string })?.error;
        const fallback = event?.message ?? "WebSocket error";
        const message = formatErrorMessage(inner ?? event, fallback);
        logError(`${P} WebSocket error`, { message });
        this.handleFatalError(mySessionId, message);
      };

      connection.onclose = (event) => {
        this.clearConnectTimeout();
        if (this.sessionId !== mySessionId) return;
        logInfo(`${P} WebSocket closed`, { code: event?.code, reason: event?.reason });
        this.cleanupConnection();
        this.settlePendingStart(mySessionId, { ok: false, error: "Connection closed" });
        if (this.isDraining) {
          this.settleDrain();
        } else {
          this.emit({ type: "status", status: "idle" });
        }
      };
    });
  }

  private handleFatalError(mySessionId: number, message: string): void {
    this.cleanupConnection();
    this.emit({ type: "error", message });
    this.emit({ type: "status", status: "error" });
    this.settlePendingStart(mySessionId, { ok: false, error: message });
    this.settleDrain();
  }

  private handleServerEvent(
    mySessionId: number,
    type: string,
    payload: Record<string, unknown>
  ): void {
    switch (type) {
      case "session.created":
        logDebug(`${P} session.created`);
        return;

      case "session.updated":
        this.clearConnectTimeout();
        logInfo(`${P} session.updated — session ready`);
        if (this.preConnectBuffer.length > 0 && this.connection) {
          logInfo(`${P} Flushing ${this.preConnectBuffer.length} buffered audio chunks`);
          for (const chunk of this.preConnectBuffer) {
            this.sendAudioJson(chunk);
          }
          this.preConnectBuffer = [];
        }
        this.isReady = true;
        this.emit({ type: "status", status: "recording" });
        this.settlePendingStart(mySessionId, { ok: true });
        return;

      case "conversation.item.input_audio_transcription.delta": {
        const delta = typeof payload.delta === "string" ? payload.delta : "";
        if (!delta) return;
        this.emit({ type: "delta", text: delta });
        this.liveText += delta;
        return;
      }

      case "conversation.item.input_audio_transcription.completed": {
        const transcript =
          typeof payload.transcript === "string" ? payload.transcript.trim() : "";
        this.liveText = "";
        if (transcript) {
          this.emit({ type: "complete", text: transcript, confidence: { ...STUB_CONFIDENCE } });
        }
        if (this.isDraining) {
          this.settleDrain();
        }
        return;
      }

      case "error": {
        const errorPayload = payload.error as { message?: string; type?: string } | undefined;
        const message = errorPayload?.message ?? "OpenAI realtime error";
        logError(`${P} Server error event`, { message, type: errorPayload?.type });
        this.handleFatalError(mySessionId, message);
        return;
      }

      default:
        logDebug(`${P} Unhandled server event`, { type });
    }
  }

  private sendAudioJson(chunk: ArrayBuffer): void {
    if (!this.connection) return;
    const audio = Buffer.from(chunk).toString("base64");
    this.connection.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
  }

  sendAudioChunk(chunk: ArrayBuffer): void {
    if (this.isDraining) return;

    if (!this.isReady || !this.connection) {
      if (this.connection || this.pendingStart) {
        if (this.preConnectBuffer.length < PRE_CONNECT_BUFFER_MAX) {
          this.preConnectBuffer.push(chunk);
        } else if (!this.preConnectBufferOverflowWarned) {
          this.preConnectBufferOverflowWarned = true;
          logWarn(
            `${P} Pre-connect buffer full (${PRE_CONNECT_BUFFER_MAX} chunks), dropping audio`
          );
        }
      } else if (!this.staleChunkWarned) {
        this.staleChunkWarned = true;
        logWarn(`${P} sendAudioChunk called but no active session`);
      }
      return;
    }
    this.audioChunkCount++;
    if (this.audioChunkCount <= 3 || this.audioChunkCount % 200 === 0) {
      logDebug(`${P} Sending audio chunk #${this.audioChunkCount}`, { bytes: chunk.byteLength });
    }
    this.sendAudioJson(chunk);
  }

  private cleanupConnection(): void {
    this.connection = null;
    this.isReady = false;
  }

  private cleanupPreviousSession(): void {
    logDebug(`${P} Cleaning up previous session`, {
      sessionId: this.sessionId,
      hasConnection: !!this.connection,
    });
    const pendingSessionId = this.pendingStart?.sessionId;
    this.sessionId++;
    this.audioChunkCount = 0;
    this.staleChunkWarned = false;
    this.preConnectBufferOverflowWarned = false;
    this.isReady = false;
    this.preConnectBuffer = [];
    this.clearConnectTimeout();
    this.clearDrainTimeout();
    this.isDraining = false;
    this.liveText = "";
    if (this.drainResolve) {
      this.drainResolve();
      this.drainResolve = null;
    }
    this.drainPromise = null;
    if (pendingSessionId !== undefined) {
      this.settlePendingStart(pendingSessionId, { ok: false, error: "Voice session stopped" });
    }
    if (this.connection) {
      try {
        this.connection.close();
      } catch {
        // Ignore close errors
      }
      this.connection = null;
    }
  }

  private clearDrainTimeout(): void {
    if (this.drainTimeout !== null) {
      clearTimeout(this.drainTimeout);
      this.drainTimeout = null;
    }
  }

  private settleDrain(): void {
    this.clearDrainTimeout();
    this.isDraining = false;
    this.drainPromise = null;
    if (this.drainResolve) {
      logInfo(`${P} Drain completed`);
      const resolve = this.drainResolve;
      this.drainResolve = null;
      resolve();
    }
  }

  async stopGracefully(): Promise<void> {
    logInfo(`${P} stopGracefully() called`, {
      sessionId: this.sessionId,
      hasConnection: !!this.connection,
    });

    if (this.drainPromise) {
      logDebug(`${P} Already draining, joining existing promise`);
      return this.drainPromise;
    }

    if (!this.connection || !this.isReady) {
      this.cleanupPreviousSession();
      this.emit({ type: "status", status: "idle" });
      return;
    }

    this.isDraining = true;
    this.emit({ type: "status", status: "finishing" });

    try {
      this.connection.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      logDebug(`${P} Sent input_audio_buffer.commit`);
    } catch {
      logWarn(`${P} Failed to send commit, closing immediately`);
      this.cleanupPreviousSession();
      this.emit({ type: "status", status: "idle" });
      return;
    }

    this.drainPromise = new Promise<void>((resolve) => {
      this.drainResolve = resolve;
      this.drainTimeout = setTimeout(() => {
        logWarn(`${P} Drain timed out after ${DRAIN_TIMEOUT_MS}ms, force closing`);
        this.settleDrain();
      }, DRAIN_TIMEOUT_MS);
    });

    const sessionIdBeforeDrain = this.sessionId;
    await this.drainPromise;

    // If start() was called during drain it already ran cleanupPreviousSession()
    // and incremented sessionId — don't tear down the new session.
    if (this.sessionId === sessionIdBeforeDrain) {
      this.cleanupPreviousSession();
      this.emit({ type: "status", status: "idle" });
    }
  }

  stop(): void {
    logInfo(`${P} stop() called`, { sessionId: this.sessionId, hasConnection: !!this.connection });
    this.cleanupPreviousSession();
    this.emit({ type: "status", status: "idle" });
  }

  destroy(): void {
    this.stop();
    this.listeners.clear();
  }
}
