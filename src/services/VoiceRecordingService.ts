import { useProjectStore } from "@/store/projectStore";
import { useTerminalStore } from "@/store/terminalStore";
import { useVoiceRecordingStore, type VoiceRecordingTarget } from "@/store/voiceRecordingStore";
import { useWorktreeDataStore } from "@/store/worktreeDataStore";
import { useWorktreeSelectionStore } from "@/store/worktreeStore";
import { VOICE_INPUT_SETTINGS_CHANGED_EVENT } from "@/lib/voiceInputSettingsEvents";
import { logDebug, logWarn, logError } from "@/utils/logger";

const LOG_PREFIX = "[VoiceRecording]";
const AUTO_STOP_MS = 60_000;

function formatTargetLabel(target: VoiceRecordingTarget): string {
  const project = target.projectName?.trim();
  const worktree = target.worktreeLabel?.trim();

  if (project && worktree) {
    return `${project} / ${worktree}`;
  }
  if (project) return project;
  if (worktree) return worktree;
  return target.panelTitle?.trim() || "current panel";
}

class VoiceRecordingService {
  private initialized = false;
  private generation = 0;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private sessionStartedAt = 0;
  private unsubscribers: Array<() => void> = [];
  private isStoppingSession = false;
  private startRequestedAt = 0;

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    logDebug(`${LOG_PREFIX} Initializing service`);

    const voiceInput = window.electron?.voiceInput;
    if (!voiceInput) {
      logWarn(`${LOG_PREFIX} window.electron.voiceInput not available`);
      return;
    }

    this.unsubscribers.push(
      voiceInput.onTranscriptionDelta((delta) => {
        logDebug(`${LOG_PREFIX} Received transcription delta`, { length: delta.length });
        useVoiceRecordingStore.getState().appendDelta(delta);
      })
    );

    this.unsubscribers.push(
      voiceInput.onTranscriptionComplete((text) => {
        logDebug(`${LOG_PREFIX} Received transcription complete`, { text });
        useVoiceRecordingStore.getState().completeSegment(text);
      })
    );

    this.unsubscribers.push(
      voiceInput.onError((error) => {
        logError(`${LOG_PREFIX} Received error from backend`, { error });
        useVoiceRecordingStore.getState().setError(error);
        void this.stop("Dictation stopped because the connection failed.", {
          skipRemoteStop: true,
          nextStatus: "error",
          preserveLiveText: true,
        });
      })
    );

    this.unsubscribers.push(
      voiceInput.onStatus((status) => {
        logDebug(`${LOG_PREFIX} Received status from backend`, {
          status,
          isStoppingSession: this.isStoppingSession,
        });
        if (status !== "idle") {
          useVoiceRecordingStore.getState().setStatus(status);
        }

        if (this.isStoppingSession) {
          return;
        }

        if (status === "idle" && useVoiceRecordingStore.getState().activeTarget) {
          logDebug(`${LOG_PREFIX} Backend went idle while session active, stopping`);
          void this.stop("Dictation stopped.", {
            skipRemoteStop: true,
            preserveLiveText: true,
          });
        }
      })
    );

    this.unsubscribers.push(window.electron.systemSleep.onSuspend(() => void this.handleSuspend()));
    this.unsubscribers.push(
      window.electron.systemSleep.onWake(() => {
        if (useVoiceRecordingStore.getState().activeTarget) {
          void this.stop("Dictation stopped after system sleep.", {
            skipRemoteStop: true,
            preserveLiveText: true,
          });
        }
      })
    );

    const handleWindowBlur = () => {
      if (!useVoiceRecordingStore.getState().activeTarget) return;
      const elapsed = Date.now() - this.startRequestedAt;
      if (elapsed < 3000) {
        logDebug(`${LOG_PREFIX} Ignoring window blur during startup grace period`, {
          elapsedMs: elapsed,
        });
        return;
      }
      logDebug(`${LOG_PREFIX} Window blur detected, stopping session`);
      void this.stop("Dictation stopped because the app lost focus.", {
        preserveLiveText: true,
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      if (!useVoiceRecordingStore.getState().activeTarget) return;
      logDebug(`${LOG_PREFIX} Visibility changed to hidden, stopping session`);
      void this.stop("Dictation stopped because the app was hidden.", {
        preserveLiveText: true,
      });
    };

    const handleSettingsChanged = () => {
      void this.refreshConfiguration();
    };

    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(VOICE_INPUT_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    this.unsubscribers.push(() => window.removeEventListener("blur", handleWindowBlur));
    this.unsubscribers.push(() =>
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    );
    this.unsubscribers.push(() =>
      window.removeEventListener(VOICE_INPUT_SETTINGS_CHANGED_EVENT, handleSettingsChanged)
    );

    this.unsubscribers.push(
      useTerminalStore.subscribe((state) => {
        const activeTarget = useVoiceRecordingStore.getState().activeTarget;
        const activePanelId = activeTarget?.panelId ?? null;

        if (!activePanelId) return;

        const panel = state.terminals.find(
          (terminal) => terminal.id === activePanelId && terminal.location !== "trash"
        );

        if (!panel) {
          void this.stop("Dictation stopped because its panel was closed.", {
            preserveLiveText: true,
          });
        }
      })
    );

    void this.refreshConfiguration();
  }

  async refreshConfiguration(): Promise<boolean> {
    const settings = await window.electron.voiceInput.getSettings();
    const isConfigured = settings.enabled && !!settings.apiKey;
    logDebug(`${LOG_PREFIX} refreshConfiguration`, {
      enabled: settings.enabled,
      hasApiKey: !!settings.apiKey,
      isConfigured,
    });
    useVoiceRecordingStore.getState().setConfigured(isConfigured);
    return isConfigured;
  }

  async toggle(target: VoiceRecordingTarget): Promise<void> {
    this.initialize();
    const state = useVoiceRecordingStore.getState();
    const isActiveTarget = state.activeTarget?.panelId === target.panelId;
    const isRecording = state.status === "connecting" || state.status === "recording";

    logDebug(`${LOG_PREFIX} toggle`, {
      panelId: target.panelId,
      isActiveTarget,
      isRecording,
      status: state.status,
    });

    if (isActiveTarget && isRecording) {
      await this.stop("Dictation stopped.", { preserveLiveText: true });
      return;
    }

    await this.start(target);
  }

  async start(target: VoiceRecordingTarget): Promise<void> {
    this.initialize();
    this.startRequestedAt = Date.now();
    logDebug(`${LOG_PREFIX} start() called`, {
      panelId: target.panelId,
      generation: this.generation,
    });

    const isConfigured = await this.refreshConfiguration().catch(() => false);
    if (!isConfigured) {
      logWarn(`${LOG_PREFIX} Not configured, aborting start`);
      useVoiceRecordingStore.getState().setError("Voice input is not configured.");
      useVoiceRecordingStore
        .getState()
        .announce("Voice dictation is not configured. Open Voice settings to continue.");
      return;
    }

    // Check and request OS-level microphone permission (macOS requires this
    // from the main process before getUserMedia will succeed in the renderer).
    logDebug(`${LOG_PREFIX} Checking microphone permission`);
    const micStatus = await window.electron.voiceInput.checkMicPermission();
    logDebug(`${LOG_PREFIX} Microphone permission status`, { micStatus });

    if (micStatus === "denied" || micStatus === "restricted") {
      const message = "Microphone permission denied. Enable it in System Settings and try again.";
      logError(`${LOG_PREFIX} Microphone permission denied at OS level`, { micStatus });
      useVoiceRecordingStore.getState().setError(message);
      useVoiceRecordingStore.getState().announce(message);
      void window.electron.voiceInput.openMicSettings();
      return;
    }

    if (micStatus === "not-determined") {
      logDebug(`${LOG_PREFIX} Requesting OS microphone permission`);
      const granted = await window.electron.voiceInput.requestMicPermission();
      logDebug(`${LOG_PREFIX} OS microphone permission result`, { granted });
      if (!granted) {
        const message = "Microphone permission denied. Enable it in System Settings and try again.";
        useVoiceRecordingStore.getState().setError(message);
        useVoiceRecordingStore.getState().announce(message);
        return;
      }
    }

    // Acquire microphone stream — permission should be granted at this point.
    logDebug(`${LOG_PREFIX} Requesting microphone access`);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      logDebug(`${LOG_PREFIX} Microphone access granted`, {
        tracks: stream.getAudioTracks().length,
      });
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission denied. Enable it in System Settings and try again."
          : "Could not access the microphone.";
      logError(`${LOG_PREFIX} getUserMedia failed`, {
        name: error instanceof DOMException ? error.name : "unknown",
        message,
      });
      useVoiceRecordingStore.getState().setError(message);
      useVoiceRecordingStore.getState().announce(message);
      return;
    }

    if (useVoiceRecordingStore.getState().activeTarget) {
      logDebug(`${LOG_PREFIX} Stopping existing session before starting new one`);
      await this.stop(undefined, { preserveLiveText: true, announce: false });
    }

    const generation = ++this.generation;
    logDebug(`${LOG_PREFIX} Beginning session`, { generation });
    useVoiceRecordingStore.getState().beginSession(target);

    logDebug(`${LOG_PREFIX} Calling voiceInput.start() IPC`);
    const result = await window.electron.voiceInput.start();
    logDebug(`${LOG_PREFIX} voiceInput.start() returned`, {
      ok: result.ok,
      error: !result.ok ? result.error : undefined,
    });
    if (this.generation !== generation) {
      logWarn(`${LOG_PREFIX} Generation mismatch after IPC start`, {
        expected: generation,
        current: this.generation,
      });
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    if (!result.ok) {
      logError(`${LOG_PREFIX} Backend start failed`, { error: result.error });
      stream.getTracks().forEach((track) => track.stop());
      useVoiceRecordingStore.getState().setError(result.error);
      useVoiceRecordingStore.getState().finishSession({ nextStatus: "error" });
      useVoiceRecordingStore.getState().announce("Voice dictation failed to start.");
      return;
    }

    if (this.generation !== generation) {
      logWarn(`${LOG_PREFIX} Generation mismatch after IPC start (late check)`);
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    this.stream = stream;

    logDebug(`${LOG_PREFIX} Creating AudioContext (24kHz)`);
    const audioContext = new AudioContext({ sampleRate: 24000 });
    this.audioContext = audioContext;

    if (audioContext.state === "suspended") {
      logDebug(`${LOG_PREFIX} AudioContext suspended, resuming`);
      await audioContext.resume();
    }
    logDebug(`${LOG_PREFIX} AudioContext state: ${audioContext.state}`);

    if (this.generation !== generation) {
      logWarn(`${LOG_PREFIX} Generation mismatch after AudioContext setup`);
      await this.cleanupAudioCapture();
      return;
    }

    logDebug(`${LOG_PREFIX} Loading pcm-processor worklet`);
    try {
      await audioContext.audioWorklet.addModule("/pcm-processor.js");
      logDebug(`${LOG_PREFIX} pcm-processor worklet loaded`);
    } catch (err) {
      if (this.generation !== generation) return;
      logError(`${LOG_PREFIX} Failed to load pcm-processor worklet`, err);
      useVoiceRecordingStore.getState().setError("Failed to load the audio processor.");
      await this.stop(undefined, { nextStatus: "error", announce: false });
      useVoiceRecordingStore.getState().announce("Voice dictation failed to initialize.");
      return;
    }

    if (this.generation !== generation) {
      logWarn(`${LOG_PREFIX} Generation mismatch after worklet load`);
      await this.cleanupAudioCapture();
      return;
    }

    const source = audioContext.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
    this.workletNode = workletNode;

    let chunkCount = 0;
    workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (this.generation !== generation) return;
      chunkCount++;
      if (chunkCount <= 3 || chunkCount % 100 === 0) {
        logDebug(`${LOG_PREFIX} Audio chunk #${chunkCount}`, { bytes: event.data.byteLength });
      }
      window.electron.voiceInput.sendAudioChunk(event.data);
    };

    source.connect(workletNode);

    this.sessionStartedAt = Date.now();
    this.startElapsedTimer();
    this.startAutoStopTimer();
    useVoiceRecordingStore.getState().setStatus("recording");
    logDebug(`${LOG_PREFIX} Recording started successfully`);
    useVoiceRecordingStore
      .getState()
      .announce(`Dictation started in ${formatTargetLabel(target)}.`);
  }

  async stop(
    announcement = "Dictation stopped.",
    options: {
      skipRemoteStop?: boolean;
      preserveLiveText?: boolean;
      nextStatus?: "idle" | "error";
      announce?: boolean;
    } = {}
  ): Promise<void> {
    this.initialize();
    const { skipRemoteStop = false, preserveLiveText = true, nextStatus = "idle" } = options;
    const shouldAnnounce = options.announce ?? true;

    const storeState = useVoiceRecordingStore.getState();
    const hasSession =
      storeState.activeTarget !== null ||
      storeState.status === "connecting" ||
      storeState.status === "recording";

    logDebug(`${LOG_PREFIX} stop() called`, {
      announcement,
      hasSession,
      skipRemoteStop,
      nextStatus,
      currentStatus: storeState.status,
      hasActiveTarget: !!storeState.activeTarget,
    });

    this.generation++;
    this.clearTimers();
    await this.cleanupAudioCapture();

    if (!skipRemoteStop) {
      logDebug(`${LOG_PREFIX} Sending remote stop`);
      this.isStoppingSession = true;
      await window.electron.voiceInput.stop().catch(() => {});
    }

    if (hasSession) {
      useVoiceRecordingStore.getState().finishSession({ preserveLiveText, nextStatus });
      if (shouldAnnounce) {
        useVoiceRecordingStore.getState().announce(announcement);
      }
    } else if (nextStatus === "idle") {
      useVoiceRecordingStore.getState().setStatus("idle");
    }

    this.isStoppingSession = false;
  }

  async toggleFocusedPanel(): Promise<void> {
    this.initialize();
    const target = this.getFocusedPanelTarget();
    if (!target) {
      useVoiceRecordingStore.getState().setError("No focused terminal is available for dictation.");
      useVoiceRecordingStore
        .getState()
        .announce("Focus a terminal input before starting dictation.");
      return;
    }

    await this.toggle(target);
  }

  async focusActiveTarget(): Promise<boolean> {
    this.initialize();
    const target = useVoiceRecordingStore.getState().activeTarget;
    if (!target) return false;

    const currentProjectId = useProjectStore.getState().currentProject?.id;
    if (target.projectId && currentProjectId !== target.projectId) {
      await useProjectStore.getState().switchProject(target.projectId);
    }

    if (target.worktreeId) {
      const activeWorktreeId = useWorktreeSelectionStore.getState().activeWorktreeId;
      if (activeWorktreeId !== target.worktreeId) {
        useWorktreeSelectionStore.getState().selectWorktree(target.worktreeId);
      }
    }

    await this.waitForPanel(target.panelId);

    const panel = useTerminalStore
      .getState()
      .terminals.find(
        (terminal) => terminal.id === target.panelId && terminal.location !== "trash"
      );
    if (!panel) {
      return false;
    }

    useTerminalStore.getState().activateTerminal(panel.id);
    return true;
  }

  private getFocusedPanelTarget(): VoiceRecordingTarget | null {
    const terminalState = useTerminalStore.getState();
    const panelId = terminalState.focusedId;
    if (!panelId) return null;

    const panel = terminalState.terminals.find(
      (terminal) => terminal.id === panelId && terminal.location !== "trash"
    );
    if (!panel) return null;

    const currentProject = useProjectStore.getState().currentProject;
    const worktree = panel.worktreeId
      ? useWorktreeDataStore.getState().worktrees.get(panel.worktreeId)
      : undefined;

    return {
      panelId: panel.id,
      panelTitle: panel.title,
      projectId: currentProject?.id,
      projectName: currentProject?.name,
      worktreeId: panel.worktreeId,
      worktreeLabel: worktree?.branch || worktree?.name,
    };
  }

  private async waitForPanel(panelId: string, timeoutMs = 5000): Promise<void> {
    const existing = useTerminalStore
      .getState()
      .terminals.some((terminal) => terminal.id === panelId && terminal.location !== "trash");
    if (existing) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        unsubscribe();
        resolve();
      }, timeoutMs);

      const unsubscribe = useTerminalStore.subscribe((state) => {
        const found = state.terminals.some(
          (terminal) => terminal.id === panelId && terminal.location !== "trash"
        );
        if (!found || settled) return;
        settled = true;
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      });
    });
  }

  private async handleSuspend(): Promise<void> {
    if (!useVoiceRecordingStore.getState().activeTarget) return;
    await this.stop("Dictation stopped because the system is going to sleep.", {
      preserveLiveText: true,
    });
  }

  private startElapsedTimer(): void {
    this.clearElapsedTimer();
    useVoiceRecordingStore.getState().setElapsedSeconds(0);
    this.elapsedTimer = setInterval(() => {
      useVoiceRecordingStore
        .getState()
        .setElapsedSeconds(Math.floor((Date.now() - this.sessionStartedAt) / 1000));
    }, 1000);
  }

  private startAutoStopTimer(): void {
    this.clearAutoStopTimer();
    this.autoStopTimer = setTimeout(() => {
      void this.stop("Dictation stopped automatically after 60 seconds.", {
        preserveLiveText: true,
      });
    }, AUTO_STOP_MS);
  }

  private clearAutoStopTimer(): void {
    if (!this.autoStopTimer) return;
    clearTimeout(this.autoStopTimer);
    this.autoStopTimer = null;
  }

  private clearElapsedTimer(): void {
    if (!this.elapsedTimer) return;
    clearInterval(this.elapsedTimer);
    this.elapsedTimer = null;
  }

  private clearTimers(): void {
    this.clearAutoStopTimer();
    this.clearElapsedTimer();
    useVoiceRecordingStore.getState().setElapsedSeconds(0);
  }

  private async cleanupAudioCapture(): Promise<void> {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.audioContext) {
      await this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }
}

export const voiceRecordingService = new VoiceRecordingService();
