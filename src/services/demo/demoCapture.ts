// Renderer-side driver for demo capture. Subscribes to DEMO_CAPTURE_START /
// DEMO_CAPTURE_STOP signals from main, runs getDisplayMedia + MediaRecorder,
// streams VP9 WebM chunks back to main via IPC. Only bootstrapped when
// window.electron.demo is available (i.e., --demo-mode is on).
//
// Stop sequence is W3C-ordered: main signals stop → mediaRecorder.stop() →
// final ondataavailable → onstop. Before signalling DEMO_CAPTURE_FINISHED the
// renderer awaits every in-flight blob.arrayBuffer() so main writes the tail
// chunk to disk before closing the output stream.

const CHUNK_TIMESLICE_MS = 1000;
const RECORDER_MIME_TYPE = "video/webm;codecs=vp9";

type CaptureStatus = "pending-start" | "recording" | "stopping" | "done";

interface ActiveRecording {
  captureId: string;
  status: CaptureStatus;
  aborted: boolean;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  pendingChunks: Set<Promise<void>>;
}

export function initDemoCapture(): () => void {
  const electron = window.electron;
  if (!electron?.demo) {
    return () => {};
  }
  const demo = electron.demo;

  let active: ActiveRecording | null = null;

  function stopStreamTracks(stream: MediaStream | null): void {
    if (!stream) return;
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Track already ended.
      }
    }
  }

  async function finalizeRecording(
    recording: ActiveRecording,
    opts: { error?: string } = {}
  ): Promise<void> {
    if (recording.status === "done") return;
    // Wait for any queued chunk promises to resolve BEFORE flipping to "done"
    // so the chunk closures don't see a stale status and drop the tail blob.
    // Main receives every chunk before we tell it to close the file.
    if (recording.pendingChunks.size > 0) {
      await Promise.allSettled(Array.from(recording.pendingChunks));
    }
    recording.status = "done";
    stopStreamTracks(recording.stream);
    if (active === recording) {
      active = null;
    }
    if (opts.error) {
      demo.sendCaptureFinished(recording.captureId, opts.error);
    } else {
      demo.sendCaptureFinished(recording.captureId);
    }
  }

  async function start(payload: { captureId: string; fps: number }): Promise<void> {
    const { captureId, fps } = payload;

    if (active) {
      console.warn("[demoCapture] Start requested while active session running; ignoring");
      return;
    }

    if (
      typeof MediaRecorder === "undefined" ||
      !MediaRecorder.isTypeSupported(RECORDER_MIME_TYPE)
    ) {
      console.error(`[demoCapture] MediaRecorder does not support ${RECORDER_MIME_TYPE}`);
      demo.sendCaptureFinished(captureId, `unsupported mime type ${RECORDER_MIME_TYPE}`);
      return;
    }

    // Set active BEFORE the await so a racing stop can see the pending session
    // and mark it aborted. Without this, stop() observes active === null, main
    // never learns the capture is dying, and we leak an orphaned recorder once
    // getDisplayMedia resolves.
    const recording: ActiveRecording = {
      captureId,
      status: "pending-start",
      aborted: false,
      stream: null,
      recorder: null,
      pendingChunks: new Set(),
    };
    active = recording;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: fps },
        audio: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[demoCapture] getDisplayMedia rejected:", err);
      await finalizeRecording(recording, { error: `getDisplayMedia: ${message}` });
      return;
    }

    if (recording.aborted) {
      // Stop arrived while we were awaiting getDisplayMedia. The stop handler
      // already sent DEMO_CAPTURE_FINISHED (without error) so main can resolve
      // cleanly; we just need to release the now-unused stream.
      stopStreamTracks(stream);
      if (active === recording) {
        active = null;
      }
      return;
    }

    recording.stream = stream;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: RECORDER_MIME_TYPE });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[demoCapture] MediaRecorder construction failed:", err);
      await finalizeRecording(recording, { error: `MediaRecorder: ${message}` });
      return;
    }
    recording.recorder = recorder;

    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0) return;
      // Capture captureId in the closure — checking a mutable global across
      // the await boundary can null-check `active` after onstop has already
      // cleared it, silently dropping the final chunk.
      const chunkPromise = event.data
        .arrayBuffer()
        .then((buffer) => {
          // Only forward if the recording still owns this captureId — if the
          // session was finalized with an error we shouldn't emit more chunks.
          if (recording.status === "done") return;
          demo.sendCaptureChunk(captureId, buffer);
        })
        .catch((err) => {
          console.error("[demoCapture] blob.arrayBuffer() failed:", err);
        })
        .finally(() => {
          recording.pendingChunks.delete(chunkPromise);
        });
      recording.pendingChunks.add(chunkPromise);
    };

    recorder.onerror = (event: Event) => {
      console.error("[demoCapture] MediaRecorder error:", event);
      const errObj = (event as { error?: { message?: string; name?: string } }).error;
      const errMessage = errObj?.message || errObj?.name || "recorder error";
      if (recording.status === "done") return;
      void finalizeRecording(recording, { error: errMessage });
    };

    recorder.onstop = () => {
      // onstop fires synchronously after the final ondataavailable. Awaiting
      // pendingChunks inside finalizeRecording ensures the tail blob has been
      // posted before we tell main to close the file.
      void finalizeRecording(recording);
    };

    recorder.start(CHUNK_TIMESLICE_MS);
    recording.status = "recording";
    demo.sendCaptureStarted(captureId);
  }

  function stop(payload: { captureId: string }): void {
    const { captureId } = payload;
    const recording = active;
    if (!recording) {
      // No active session — idempotent ack so main doesn't hang on its
      // finalize timer for a capture that never existed here.
      demo.sendCaptureFinished(captureId);
      return;
    }
    if (recording.captureId !== captureId) {
      // Stale stop for a prior session — ignore.
      return;
    }
    if (recording.status === "stopping" || recording.status === "done") {
      return;
    }
    if (recording.status === "pending-start") {
      // Stop arrived before getDisplayMedia resolved. Mark aborted so start()
      // tears down any obtained stream, then ack main immediately.
      recording.aborted = true;
      recording.status = "stopping";
      demo.sendCaptureFinished(captureId);
      return;
    }
    // status === "recording"
    recording.status = "stopping";
    const recorder = recording.recorder;
    if (!recorder || recorder.state === "inactive") {
      void finalizeRecording(recording);
      return;
    }
    recorder.stop();
  }

  const unsubscribeStart = demo.onCaptureStart((payload) => {
    void start(payload);
  });
  const unsubscribeStop = demo.onCaptureStop((payload) => {
    stop(payload);
  });

  return () => {
    unsubscribeStart();
    unsubscribeStop();
    const recording = active;
    if (recording && recording.status !== "done") {
      try {
        if (recording.recorder && recording.recorder.state !== "inactive") {
          recording.recorder.stop();
        }
      } catch {
        // Already stopped or disposed.
      }
      stopStreamTracks(recording.stream);
      recording.status = "done";
      active = null;
    }
  };
}
