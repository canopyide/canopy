import { ipcMain, systemPreferences, shell } from "electron";
import { spawn } from "child_process";
import { CHANNELS } from "../channels.js";
import { store } from "../../store.js";
import { projectStore } from "../../services/ProjectStore.js";
import { VoiceTranscriptionService } from "../../services/VoiceTranscriptionService.js";
import { VoiceCorrectionService } from "../../services/VoiceCorrectionService.js";
import type { HandlerDependencies, IpcContext } from "../types.js";
import type { VoiceInputSettings } from "../../../shared/types/ipc/api.js";
import { logDebug, logWarn } from "../../utils/logger.js";
import { assembleKeyterms } from "../../services/voiceContextKeyterms.js";
import { applyDictationCommands } from "../../services/voiceDictationCommands.js";
import { getAppWebContents } from "../../window/webContentsRegistry.js";
import { voiceFileLinkResolver } from "../../services/VoiceFileLinkResolver.js";
import { typedHandle, typedHandleWithContext } from "../utils.js";

let service: VoiceTranscriptionService | null = null;
let activeEventUnsubscribe: (() => void) | null = null;
let activeDestroyListener: { sender: Electron.WebContents; fn: () => void } | null = null;
let correctionService: VoiceCorrectionService | null = null;
let sessionController: AbortController | null = null;
let sessionProjectInfo: { name?: string; path?: string } = {};

const VOICE_INPUT_DEFAULTS: VoiceInputSettings = {
  enabled: false,
  openaiApiKey: "",
  language: "en",
  customDictionary: [],
  transcriptionModel: "nova-3",
  correctionEnabled: false,
  correctionModel: "gpt-5-mini",
  correctionCustomInstructions: "",
  paragraphingStrategy: "spoken-command",
  resolveFileLinks: true,
};

/** Read voiceInput settings with defaults for fields added after initial store creation. */
export function getVoiceSettings(): VoiceInputSettings {
  const stored = store.get("voiceInput") as
    | (Partial<VoiceInputSettings> & {
        apiKey?: string;
        deepgramApiKey?: string;
        correctionApiKey?: string;
      })
    | undefined;

  // Pluck legacy fields so they don't leak into the merged object via spread.
  const { apiKey, deepgramApiKey, correctionApiKey, ...rest } = stored ?? {};
  const merged: VoiceInputSettings = { ...VOICE_INPUT_DEFAULTS, ...rest };

  // Migrate prior OpenAI keys into the unified field. The Deepgram key is
  // dropped — it belonged to a different provider.
  if (!merged.openaiApiKey) {
    if (correctionApiKey?.startsWith("sk-")) {
      merged.openaiApiKey = correctionApiKey;
    } else if (apiKey?.startsWith("sk-")) {
      merged.openaiApiKey = apiKey;
    }
  }

  // Persist the cleaned object on first read after upgrade so the legacy
  // fields disappear from disk. `store.set` with a full object replaces.
  if (apiKey !== undefined || deepgramApiKey !== undefined || correctionApiKey !== undefined) {
    store.set("voiceInput", merged);
  }

  return merged;
}

function getService(): VoiceTranscriptionService {
  if (!service) {
    service = new VoiceTranscriptionService();
  }
  return service;
}

function cleanupActiveSubscription(): void {
  if (activeEventUnsubscribe) {
    activeEventUnsubscribe();
    activeEventUnsubscribe = null;
  }
  if (activeDestroyListener) {
    activeDestroyListener.sender.removeListener("destroyed", activeDestroyListener.fn);
    activeDestroyListener = null;
  }
}

export type MicPermissionStatus =
  | "granted"
  | "denied"
  | "not-determined"
  | "restricted"
  | "unknown";

function checkMicPermission(): MicPermissionStatus {
  if (process.platform === "darwin" || process.platform === "win32") {
    return systemPreferences.getMediaAccessStatus("microphone") as MicPermissionStatus;
  }
  // Linux doesn't have a system-level media access API
  return "unknown";
}

async function requestMicPermission(): Promise<boolean> {
  if (process.platform === "darwin") {
    return systemPreferences.askForMediaAccess("microphone");
  }
  // On Windows/Linux, permission is requested via getUserMedia in the renderer
  return false;
}

function openMicSettings(): void {
  if (process.platform === "darwin") {
    void shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
    );
  } else if (process.platform === "win32") {
    void shell.openExternal("ms-settings:privacy-microphone");
  } else {
    // Linux: try gnome-control-center, fall back silently
    try {
      spawn("gnome-control-center", ["sound"], { detached: true, stdio: "ignore" }).unref();
    } catch (err) {
      logDebug("[VoiceInput] Failed to open mic settings", {
        error: (err as Error)?.message ?? String(err),
      });
    }
  }
}

async function validateOpenAIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey.trim()) {
    return { valid: false, error: "API key is required" };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: "Invalid API key" };
    }

    if (response.status === 429) {
      return { valid: true };
    }

    return { valid: false, error: `API returned status ${response.status}` };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { valid: false, error: "Connection timed out" };
    }
    return { valid: false, error: "Failed to connect to OpenAI" };
  }
}

function getProjectInfo(): { name?: string; path?: string } {
  const currentProject = projectStore.getCurrentProject();
  if (!currentProject) return {};
  return { name: currentProject.name, path: currentProject.path };
}

export function registerVoiceInputHandlers(deps: HandlerDependencies): () => void {
  const handleGetSettings = async () => {
    return getVoiceSettings();
  };

  const handleSetSettings = async (patch: Partial<VoiceInputSettings>) => {
    if (!patch || typeof patch !== "object") return;
    for (const [field, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      store.set(`voiceInput.${field}`, value);
    }
  };

  const handleStart = async (ctx: IpcContext) => {
    const svc = getService();
    // Snapshot transcription settings at session start (model, language, API key).
    // Correction settings are read live from store per-event so mid-session changes apply.
    const settings = getVoiceSettings();

    // Clean up any existing subscription before starting a new session
    cleanupActiveSubscription();

    // Initialize the correction service for this session
    if (!correctionService) {
      correctionService = new VoiceCorrectionService();
    }

    sessionController = new AbortController();
    correctionService.setSessionSignal(sessionController.signal);

    // Capture project info at session start.
    sessionProjectInfo = getProjectInfo();

    // Assemble dynamic keyterms from project context (branch, terminal output, etc.)
    let sessionSettings = settings;
    try {
      const assembledKeyterms = await assembleKeyterms({
        customDictionary: settings.customDictionary,
        projectName: sessionProjectInfo.name,
        projectPath: sessionProjectInfo.path,
        ptyClient: deps.ptyClient,
      });
      sessionSettings = { ...settings, customDictionary: assembledKeyterms };
    } catch (err) {
      logWarn("[VoiceInput] Failed to assemble dynamic keyterms, using static dictionary", {
        error: (err as Error).message,
      });
    }

    const unsubscribe = svc.onEvent((voiceEvent) => {
      const win = deps.mainWindow;
      if (!win || win.isDestroyed()) return;

      if (voiceEvent.type === "delta") {
        getAppWebContents(win).send(CHANNELS.VOICE_INPUT_TRANSCRIPTION_DELTA, voiceEvent.text);
      } else if (voiceEvent.type === "complete") {
        const rawText = voiceEvent.text.trim();
        const liveSettings = getVoiceSettings();

        // OpenAI Realtime emits spoken dictation commands ("new paragraph",
        // "period", etc.) as literal text. Deepgram dictation mode rewrites
        // them upstream; here we reproduce that behavior post-hoc, gated on
        // the session-snapshotted paragraphing strategy (matches the
        // transcription-settings convention documented at handleStart).
        const processedText =
          settings.paragraphingStrategy === "spoken-command"
            ? applyDictationCommands(rawText)
            : rawText;

        // Split on \n\n and emit one complete event per non-empty part with a
        // paragraph_boundary between them — mirrors the Deepgram path in
        // VoiceTranscriptionService.emitCompleteWithParagraphDetection.
        // .filter(Boolean) ensures command-only utterances (e.g. "new paragraph"
        // alone produces "\n\n" → ["", ""]) emit nothing, consistent with Deepgram.
        const parts = processedText
          .split(/\n\n+/)
          .map((p) => p.trim())
          .filter(Boolean);
        for (let i = 0; i < parts.length; i++) {
          getAppWebContents(win).send(CHANNELS.VOICE_INPUT_TRANSCRIPTION_COMPLETE, {
            text: parts[i],
            willCorrect: false,
          });
          if (i < parts.length - 1) {
            getAppWebContents(win).send(CHANNELS.VOICE_INPUT_PARAGRAPH_BOUNDARY, {
              rawText: null,
              correctionId: null,
            });
          }
        }

        // File link detection: scan the complete utterance for file-reference voice commands.
        if (
          liveSettings.correctionEnabled &&
          liveSettings.resolveFileLinks &&
          correctionService &&
          rawText.length > 0
        ) {
          const projectPath = sessionProjectInfo.path;
          const apiKey = liveSettings.openaiApiKey;
          if (projectPath && apiKey) {
            // Capture signal + service synchronously so a new session's abort
            // and/or replacement service instance can't be used here.
            const signal = sessionController?.signal;
            const correctionSvc = correctionService;
            void (async () => {
              const tokens = await correctionSvc.detectFileLinkTokens(rawText, { apiKey });
              for (const { description } of tokens) {
                const resolved = await voiceFileLinkResolver.resolve({
                  cwd: projectPath,
                  description,
                  apiKey,
                  signal,
                });
                // Guard the IPC send: voiceFileLinkResolver may return on a
                // local-only match without ever consulting `signal`, so a session
                // stopped mid-resolution could otherwise leak FILE_TOKEN_RESOLVED
                // events into a new session's panel.
                if (signal?.aborted) return;
                const replacement = resolved ? `@${resolved}` : `@?${description}`;
                if (!win.isDestroyed()) {
                  getAppWebContents(win).send(CHANNELS.VOICE_INPUT_FILE_TOKEN_RESOLVED, {
                    description,
                    replacement,
                    resolved: !!resolved,
                  });
                }
              }
            })();
          }
        }
      } else if (voiceEvent.type === "paragraph_boundary") {
        getAppWebContents(win).send(CHANNELS.VOICE_INPUT_PARAGRAPH_BOUNDARY, {
          rawText: null,
        });
      } else if (voiceEvent.type === "error") {
        getAppWebContents(win).send(CHANNELS.VOICE_INPUT_ERROR, voiceEvent.message);
      } else if (voiceEvent.type === "status") {
        getAppWebContents(win).send(CHANNELS.VOICE_INPUT_STATUS, voiceEvent.status);
      }
    });

    activeEventUnsubscribe = unsubscribe;

    // Also clean up if the renderer is destroyed unexpectedly
    const onDestroyed = () => {
      if (activeEventUnsubscribe === unsubscribe) {
        activeEventUnsubscribe = null;
      }
      activeDestroyListener = null;
      unsubscribe();
      service?.stop();
    };
    ctx.event.sender.once("destroyed", onDestroyed);
    activeDestroyListener = { sender: ctx.event.sender, fn: onDestroyed };

    const result = await svc.start(sessionSettings);
    if (!result.ok) {
      // Failed to start — clean up subscription immediately
      if (activeEventUnsubscribe === unsubscribe) {
        activeEventUnsubscribe = null;
      }
      unsubscribe();
      ctx.event.sender.removeListener("destroyed", onDestroyed);
      activeDestroyListener = null;
      // Tear down the session controller so an orphaned signal isn't left
      // attached to correctionService for the next session.
      sessionController?.abort();
      correctionService?.setSessionSignal(null);
      sessionController = null;
    }
    return result;
  };

  const handleStop = async (): Promise<{ rawText: string | null }> => {
    // Snapshot the session controller so concurrent start/stop cannot cross-abort.
    const controller = sessionController;

    if (service) {
      // Drain Deepgram first (waits for pending transcriptions, fires remaining complete events).
      await service.stopGracefully();
    }

    // Abort any in-flight file-link detection / resolution.
    controller?.abort();

    if (sessionController === controller) {
      correctionService?.setSessionSignal(null);
      sessionController = null;
    }

    cleanupActiveSubscription();

    return { rawText: null };
  };

  const handleFlushParagraph = (): { rawText: string | null } => {
    if (service) {
      service.commitParagraphBoundary();
    }
    return { rawText: null };
  };

  const handleAudioChunk = (_event: Electron.IpcMainEvent, chunk: ArrayBuffer) => {
    service?.sendAudioChunk(chunk);
  };

  const handleCheckMicPermission = () => {
    return checkMicPermission();
  };

  const handleRequestMicPermission = async () => {
    return requestMicPermission();
  };

  const handleOpenMicSettings = () => {
    openMicSettings();
  };

  const handleValidateApiKey = async (apiKey: string) => {
    return validateOpenAIKey(apiKey);
  };

  const cleanups: Array<() => void> = [
    typedHandle(CHANNELS.VOICE_INPUT_GET_SETTINGS, handleGetSettings),
    typedHandle(CHANNELS.VOICE_INPUT_SET_SETTINGS, handleSetSettings),
    // @ts-expect-error: VoiceStartResult contains forbidden envelope key — pending migration to throw AppError. See #6020.
    typedHandleWithContext(CHANNELS.VOICE_INPUT_START, handleStart),
    typedHandle(CHANNELS.VOICE_INPUT_STOP, handleStop),
    typedHandle(CHANNELS.VOICE_INPUT_CHECK_MIC_PERMISSION, handleCheckMicPermission),
    typedHandle(CHANNELS.VOICE_INPUT_REQUEST_MIC_PERMISSION, handleRequestMicPermission),
    typedHandle(CHANNELS.VOICE_INPUT_OPEN_MIC_SETTINGS, handleOpenMicSettings),
    typedHandle(CHANNELS.VOICE_INPUT_VALIDATE_API_KEY, handleValidateApiKey),
    typedHandle(CHANNELS.VOICE_INPUT_FLUSH_PARAGRAPH, handleFlushParagraph),
  ];

  // Fire-and-forget audio-chunk stream stays on ipcMain.on.
  ipcMain.on(CHANNELS.VOICE_INPUT_AUDIO_CHUNK, handleAudioChunk);

  return () => {
    for (const cleanup of cleanups) cleanup();
    ipcMain.removeListener(CHANNELS.VOICE_INPUT_AUDIO_CHUNK, handleAudioChunk);
    cleanupActiveSubscription();
    service?.destroy();
    service = null;
    correctionService = null;
    sessionController = null;
  };
}
