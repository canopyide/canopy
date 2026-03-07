import { useProjectStore } from "@/store/projectStore";
import { useTerminalStore } from "@/store/terminalStore";
import { useVoiceRecordingStore, type VoiceRecordingTarget } from "@/store/voiceRecordingStore";
import { useWorktreeDataStore } from "@/store/worktreeDataStore";
import { useWorktreeSelectionStore } from "@/store/worktreeStore";
import { VOICE_INPUT_SETTINGS_CHANGED_EVENT } from "@/lib/voiceInputSettingsEvents";

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

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    const voiceInput = window.electron?.voiceInput;
    if (!voiceInput) return;

    this.unsubscribers.push(
      voiceInput.onTranscriptionDelta((delta) => {
        useVoiceRecordingStore.getState().appendDelta(delta);
      })
    );

    this.unsubscribers.push(
      voiceInput.onTranscriptionComplete((text) => {
        useVoiceRecordingStore.getState().completeSegment(text);
      })
    );

    this.unsubscribers.push(
      voiceInput.onError((error) => {
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
        if (status !== "idle") {
          useVoiceRecordingStore.getState().setStatus(status);
        }

        if (this.isStoppingSession) {
          return;
        }

        if (status === "idle" && useVoiceRecordingStore.getState().activeTarget) {
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
      void this.stop("Dictation stopped because the app lost focus.", {
        preserveLiveText: true,
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      if (!useVoiceRecordingStore.getState().activeTarget) return;
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
    useVoiceRecordingStore.getState().setConfigured(isConfigured);
    return isConfigured;
  }

  async toggle(target: VoiceRecordingTarget): Promise<void> {
    this.initialize();
    const state = useVoiceRecordingStore.getState();
    const isActiveTarget = state.activeTarget?.panelId === target.panelId;
    const isRecording = state.status === "connecting" || state.status === "recording";

    if (isActiveTarget && isRecording) {
      await this.stop("Dictation stopped.", { preserveLiveText: true });
      return;
    }

    await this.start(target);
  }

  async start(target: VoiceRecordingTarget): Promise<void> {
    this.initialize();

    const isConfigured = await this.refreshConfiguration().catch(() => false);
    if (!isConfigured) {
      useVoiceRecordingStore.getState().setError("Voice input is not configured.");
      useVoiceRecordingStore
        .getState()
        .announce("Voice dictation is not configured. Open Voice settings to continue.");
      return;
    }

    if (useVoiceRecordingStore.getState().activeTarget) {
      await this.stop(undefined, { preserveLiveText: true, announce: false });
    }

    const generation = ++this.generation;
    useVoiceRecordingStore.getState().beginSession(target);

    const result = await window.electron.voiceInput.start();
    if (this.generation !== generation) return;

    if (!result.ok) {
      useVoiceRecordingStore.getState().setError(result.error);
      useVoiceRecordingStore.getState().finishSession({ nextStatus: "error" });
      useVoiceRecordingStore.getState().announce("Voice dictation failed to start.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (error) {
      if (this.generation !== generation) return;
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission denied. Enable it in System Settings and try again."
          : "Could not access the microphone.";
      useVoiceRecordingStore.getState().setError(message);
      await this.stop(undefined, { nextStatus: "error", announce: false });
      useVoiceRecordingStore.getState().announce(message);
      return;
    }

    if (this.generation !== generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    this.stream = stream;

    const audioContext = new AudioContext({ sampleRate: 48000 });
    this.audioContext = audioContext;

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    if (this.generation !== generation) {
      await this.cleanupAudioCapture();
      return;
    }

    try {
      await audioContext.audioWorklet.addModule("/pcm-processor.js");
    } catch {
      if (this.generation !== generation) return;
      useVoiceRecordingStore.getState().setError("Failed to load the audio processor.");
      await this.stop(undefined, { nextStatus: "error", announce: false });
      useVoiceRecordingStore.getState().announce("Voice dictation failed to initialize.");
      return;
    }

    if (this.generation !== generation) {
      await this.cleanupAudioCapture();
      return;
    }

    const source = audioContext.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
    this.workletNode = workletNode;

    workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (this.generation !== generation) return;
      window.electron.voiceInput.sendAudioChunk(event.data);
    };

    source.connect(workletNode);

    this.sessionStartedAt = Date.now();
    this.startElapsedTimer();
    this.startAutoStopTimer();
    useVoiceRecordingStore.getState().setStatus("recording");
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

    const hasSession =
      useVoiceRecordingStore.getState().activeTarget !== null ||
      useVoiceRecordingStore.getState().status === "connecting" ||
      useVoiceRecordingStore.getState().status === "recording";

    this.generation++;
    this.clearTimers();
    await this.cleanupAudioCapture();

    if (!skipRemoteStop) {
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
