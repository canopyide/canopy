import { ipcMain, systemPreferences, shell } from "electron";
import { spawn } from "child_process";
import { existsSync } from "node:fs";
import { CHANNELS } from "../channels.js";
import { store } from "../../store.js";
import { VoiceTranscriptionService } from "../../services/VoiceTranscriptionService.js";
import { VoiceCorrectionService } from "../../services/VoiceCorrectionService.js";
import type { HandlerDependencies } from "../types.js";
import type { VoiceInputSettings } from "../../../shared/types/ipc/api.js";

let service: VoiceTranscriptionService | null = null;
let activeEventUnsubscribe: (() => void) | null = null;
let correctionService: VoiceCorrectionService | null = null;

/** Utterances accumulated since the last paragraph boundary. */
let paragraphBuffer: string[] = [];
/** Project info captured at session start for correction prompts. */
let sessionProjectInfo: { name?: string; path?: string } = {};

const VOICE_INPUT_DEFAULTS: VoiceInputSettings = {
  enabled: false,
  googleCloudCredentialPath: "",
  geminiApiKey: "",
  language: "en",
  customDictionary: [],
  correctionEnabled: false,
  correctionCustomInstructions: "",
};

/** Read voiceInput settings with defaults for fields added after initial store creation. */
function getVoiceSettings(): VoiceInputSettings {
  const stored = store.get("voiceInput") as Partial<VoiceInputSettings> | undefined;
  return { ...VOICE_INPUT_DEFAULTS, ...stored };
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
  return "unknown";
}

async function requestMicPermission(): Promise<boolean> {
  if (process.platform === "darwin") {
    return systemPreferences.askForMediaAccess("microphone");
  }
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
    try {
      spawn("gnome-control-center", ["sound"], { detached: true, stdio: "ignore" }).unref();
    } catch {
      // No standard way to open mic settings on Linux
    }
  }
}

async function validateGoogleCloudCredential(
  credentialPath: string
): Promise<{ valid: boolean; error?: string }> {
  if (!credentialPath.trim()) {
    return { valid: false, error: "Service account key path is required" };
  }

  if (!existsSync(credentialPath.trim())) {
    return { valid: false, error: "File not found at the specified path" };
  }

  try {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(credentialPath.trim(), "utf8");
    const parsed = JSON.parse(content) as Record<string, unknown>;

    if (parsed.type !== "service_account") {
      return {
        valid: false,
        error: "File does not appear to be a service account key (missing type: service_account)",
      };
    }
    if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
      return { valid: false, error: "Service account key is missing required fields" };
    }

    return { valid: true };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { valid: false, error: "File is not valid JSON" };
    }
    return { valid: false, error: "Could not read credential file" };
  }
}

async function validateGeminiApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey.trim()) {
    return { valid: false, error: "Gemini API key is required" };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1`,
      {
        method: "GET",
        headers: { "x-goog-api-key": apiKey.trim() },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (response.ok) {
      return { valid: true };
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return { valid: false, error: "Invalid Gemini API key" };
    }
    return { valid: false, error: `API returned status ${response.status}` };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { valid: false, error: "Connection timed out" };
    }
    return { valid: false, error: "Failed to connect to Gemini API" };
  }
}

function getProjectInfo(): { name?: string; path?: string } {
  const projects = store.get("projects");
  const currentId = projects?.currentProjectId;
  if (!currentId) return {};
  const project = projects?.list?.find((p) => p.id === currentId);
  return { name: project?.name, path: project?.path };
}

/**
 * Join the paragraph buffer into a single raw text string and clear it.
 * If correction is enabled, fires an async correction call and sends
 * VOICE_INPUT_CORRECTION_REPLACE when it resolves.
 */
function flushParagraphBuffer(win: Electron.BrowserWindow | null): { rawText: string | null } {
  if (paragraphBuffer.length === 0) return { rawText: null };

  const rawText = paragraphBuffer.join(" ");
  paragraphBuffer = [];

  const liveSettings = getVoiceSettings();
  const willCorrect = !!(liveSettings.correctionEnabled && liveSettings.geminiApiKey);

  if (willCorrect && correctionService && win && !win.isDestroyed()) {
    void correctionService
      .correct(rawText, {
        geminiApiKey: liveSettings.geminiApiKey,
        customDictionary: liveSettings.customDictionary,
        customInstructions: liveSettings.correctionCustomInstructions,
        projectName: sessionProjectInfo.name,
        projectPath: sessionProjectInfo.path,
      })
      .then((correctedText) => {
        if (!win.isDestroyed()) {
          win.webContents.send(CHANNELS.VOICE_INPUT_CORRECTION_REPLACE, {
            rawText,
            correctedText,
          });
        }
      })
      .catch(() => {});
  }

  return { rawText };
}

export function registerVoiceInputHandlers(deps: HandlerDependencies): () => void {
  const handleGetSettings = async () => {
    return getVoiceSettings();
  };

  const handleSetSettings = async (
    _event: Electron.IpcMainInvokeEvent,
    patch: Partial<VoiceInputSettings>
  ) => {
    const current = getVoiceSettings();
    store.set("voiceInput", { ...current, ...patch });
  };

  const handleStart = async (event: Electron.IpcMainInvokeEvent) => {
    const svc = getService();
    const settings = getVoiceSettings();

    cleanupActiveSubscription();

    if (!correctionService) {
      correctionService = new VoiceCorrectionService();
    }
    correctionService.resetHistory();

    sessionProjectInfo = getProjectInfo();
    paragraphBuffer = [];

    const unsubscribe = svc.onEvent((voiceEvent) => {
      const win = deps.mainWindow;
      if (!win || win.isDestroyed()) return;

      if (voiceEvent.type === "delta") {
        win.webContents.send(CHANNELS.VOICE_INPUT_TRANSCRIPTION_DELTA, voiceEvent.text);
      } else if (voiceEvent.type === "complete") {
        const rawText = voiceEvent.text.trim();
        if (rawText) {
          paragraphBuffer.push(rawText);
        }
        win.webContents.send(CHANNELS.VOICE_INPUT_TRANSCRIPTION_COMPLETE, {
          text: rawText,
          willCorrect: false,
        });
      } else if (voiceEvent.type === "error") {
        win.webContents.send(CHANNELS.VOICE_INPUT_ERROR, voiceEvent.message);
      } else if (voiceEvent.type === "status") {
        win.webContents.send(CHANNELS.VOICE_INPUT_STATUS, voiceEvent.status);
      }
    });

    activeEventUnsubscribe = unsubscribe;

    const onDestroyed = () => {
      if (activeEventUnsubscribe === unsubscribe) {
        activeEventUnsubscribe = null;
      }
      unsubscribe();
      service?.stop();
    };
    event.sender.once("destroyed", onDestroyed);

    const result = await svc.start(settings);
    if (!result.ok) {
      if (activeEventUnsubscribe === unsubscribe) {
        activeEventUnsubscribe = null;
      }
      unsubscribe();
      event.sender.removeListener("destroyed", onDestroyed);
    }
    return result;
  };

  const handleStop = async (): Promise<{ rawText: string | null }> => {
    if (service) {
      await service.stopGracefully();
    }
    cleanupActiveSubscription();
    return flushParagraphBuffer(deps.mainWindow);
  };

  const handleFlushParagraph = (): { rawText: string | null } => {
    return flushParagraphBuffer(deps.mainWindow);
  };

  const handleAudioChunk = (_event: Electron.IpcMainInvokeEvent, chunk: ArrayBuffer) => {
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

  const handleValidateCredential = async (
    _event: Electron.IpcMainInvokeEvent,
    credentialPath: string
  ) => {
    return validateGoogleCloudCredential(credentialPath);
  };

  const handleValidateGeminiKey = async (_event: Electron.IpcMainInvokeEvent, apiKey: string) => {
    return validateGeminiApiKey(apiKey);
  };

  ipcMain.handle(CHANNELS.VOICE_INPUT_GET_SETTINGS, handleGetSettings);
  ipcMain.handle(CHANNELS.VOICE_INPUT_SET_SETTINGS, handleSetSettings);
  ipcMain.handle(CHANNELS.VOICE_INPUT_START, handleStart);
  ipcMain.handle(CHANNELS.VOICE_INPUT_STOP, handleStop);
  ipcMain.on(CHANNELS.VOICE_INPUT_AUDIO_CHUNK, handleAudioChunk);
  ipcMain.handle(CHANNELS.VOICE_INPUT_CHECK_MIC_PERMISSION, handleCheckMicPermission);
  ipcMain.handle(CHANNELS.VOICE_INPUT_REQUEST_MIC_PERMISSION, handleRequestMicPermission);
  ipcMain.handle(CHANNELS.VOICE_INPUT_OPEN_MIC_SETTINGS, handleOpenMicSettings);
  ipcMain.handle(CHANNELS.VOICE_INPUT_VALIDATE_API_KEY, handleValidateCredential);
  ipcMain.handle(CHANNELS.VOICE_INPUT_VALIDATE_GEMINI_KEY, handleValidateGeminiKey);
  ipcMain.handle(CHANNELS.VOICE_INPUT_FLUSH_PARAGRAPH, handleFlushParagraph);

  return () => {
    ipcMain.removeHandler(CHANNELS.VOICE_INPUT_GET_SETTINGS);
    ipcMain.removeHandler(CHANNELS.VOICE_INPUT_SET_SETTINGS);
    ipcMain.removeHandler(CHANNELS.VOICE_INPUT_START);
    ipcMain.removeHandler(CHANNELS.VOICE_INPUT_STOP);
    ipcMain.removeListener(CHANNELS.VOICE_INPUT_AUDIO_CHUNK, handleAudioChunk);
    ipcMain.removeHandler(CHANNELS.VOICE_INPUT_CHECK_MIC_PERMISSION);
    ipcMain.removeHandler(CHANNELS.VOICE_INPUT_REQUEST_MIC_PERMISSION);
    ipcMain.removeHandler(CHANNELS.VOICE_INPUT_OPEN_MIC_SETTINGS);
    ipcMain.removeHandler(CHANNELS.VOICE_INPUT_VALIDATE_API_KEY);
    ipcMain.removeHandler(CHANNELS.VOICE_INPUT_VALIDATE_GEMINI_KEY);
    ipcMain.removeHandler(CHANNELS.VOICE_INPUT_FLUSH_PARAGRAPH);
    cleanupActiveSubscription();
    service?.destroy();
    service = null;
    correctionService = null;
    paragraphBuffer = [];
  };
}
