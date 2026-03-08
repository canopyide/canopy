import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  Eye,
  EyeOff,
  Plus,
  X,
  Globe,
  BookText,
  Shield,
  Check,
  AlertCircle,
  Loader2,
  FlaskConical,
  ExternalLink,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "./SettingsSection";
import { SettingsSwitchCard } from "./SettingsSwitchCard";
import { dispatchVoiceInputSettingsChanged } from "@/lib/voiceInputSettingsEvents";
import { CORE_CORRECTION_PROMPT } from "@shared/config/voiceCorrection";
import type { VoiceInputSettings, MicPermissionStatus } from "@shared/types";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "ko", label: "Korean" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "ru", label: "Russian" },
];

const DEFAULT_SETTINGS: VoiceInputSettings = {
  enabled: false,
  googleCloudCredentialPath: "",
  geminiApiKey: "",
  language: "en",
  customDictionary: [],
  correctionEnabled: false,
  correctionCustomInstructions: "",
};

type LoadState = "loading" | "ready" | "error";
type ValidationState = "idle" | "testing" | "valid" | "invalid";

export function VoiceInputSettingsTab() {
  const [settings, setSettings] = useState<VoiceInputSettings>(DEFAULT_SETTINGS);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [credentialValidation, setCredentialValidation] = useState<ValidationState>("idle");
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [credentialInput, setCredentialInput] = useState("");
  const [micPermission, setMicPermission] = useState<MicPermissionStatus>("unknown");
  const [isRequestingMic, setIsRequestingMic] = useState(false);
  const [newDictionaryWord, setNewDictionaryWord] = useState("");
  const dictionaryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.electron?.voiceInput
      ?.getSettings()
      .then((s) => {
        setSettings(s);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));

    window.electron?.voiceInput
      ?.checkMicPermission()
      .then((status) => {
        if (status) setMicPermission(status);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (credentialValidation !== "valid" && credentialValidation !== "invalid") return;
    const timer = setTimeout(() => {
      setCredentialValidation("idle");
      setCredentialError(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [credentialValidation]);

  const update = (patch: Partial<VoiceInputSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      window.electron?.voiceInput
        ?.setSettings(patch)
        .then(() => dispatchVoiceInputSettingsChanged(next))
        .catch(() => setSettings(prev));
      return next;
    });
  };

  const handleTestCredential = useCallback(async () => {
    const path = credentialInput.trim() || settings.googleCloudCredentialPath;
    if (!path) return;
    setCredentialValidation("testing");
    setCredentialError(null);
    try {
      const result = await window.electron?.voiceInput?.validateCredential(path);
      if (result?.valid) {
        setCredentialValidation("valid");
      } else {
        setCredentialValidation("invalid");
        setCredentialError(result?.error || "Invalid credential file");
      }
    } catch {
      setCredentialValidation("invalid");
      setCredentialError("Failed to validate credential file");
    }
  }, [credentialInput, settings.googleCloudCredentialPath]);

  const handleSaveCredential = useCallback(async () => {
    const path = credentialInput.trim();
    if (!path) return;
    setCredentialValidation("testing");
    setCredentialError(null);
    try {
      const result = await window.electron?.voiceInput?.validateCredential(path);
      if (result?.valid) {
        update({ googleCloudCredentialPath: path });
        setCredentialInput("");
        setCredentialValidation("valid");
      } else {
        setCredentialValidation("invalid");
        setCredentialError(result?.error || "Invalid credential file");
      }
    } catch {
      setCredentialValidation("invalid");
      setCredentialError("Failed to validate credential file");
    }
  }, [credentialInput]);

  const handleClearCredential = useCallback(() => {
    update({ googleCloudCredentialPath: "" });
    setCredentialInput("");
    setCredentialValidation("idle");
    setCredentialError(null);
  }, []);

  const handleRequestMicPermission = useCallback(async () => {
    setIsRequestingMic(true);
    try {
      await window.electron?.voiceInput?.requestMicPermission();
      const status = await window.electron?.voiceInput?.checkMicPermission();
      if (status) setMicPermission(status);
    } catch {
      // ignore
    } finally {
      setIsRequestingMic(false);
    }
  }, []);

  const handleOpenMicSettings = useCallback(() => {
    window.electron?.voiceInput?.openMicSettings();
  }, []);

  const handleRefreshMicPermission = useCallback(async () => {
    const status = await window.electron?.voiceInput?.checkMicPermission();
    if (status) setMicPermission(status);
  }, []);

  const addDictionaryWord = () => {
    const word = newDictionaryWord.trim();
    if (!word || settings.customDictionary.includes(word)) return;
    const next = [...settings.customDictionary, word];
    update({ customDictionary: next });
    setNewDictionaryWord("");
    dictionaryInputRef.current?.focus();
  };

  const removeDictionaryWord = (word: string) => {
    update({ customDictionary: settings.customDictionary.filter((w) => w !== word) });
  };

  if (loadState === "loading") {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-canopy-text/60 text-sm">Loading voice input settings...</div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-3">
        <div className="text-status-error text-sm">Could not load voice input settings.</div>
        <p className="text-xs text-canopy-text/50">Restart Canopy and try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsSwitchCard
        icon={Mic}
        title="Voice Input"
        subtitle="Dictate commands using your microphone via Google Cloud Speech-to-Text (Chirp 3)"
        isEnabled={settings.enabled}
        onChange={() => update({ enabled: !settings.enabled })}
        ariaLabel="Toggle voice input"
      />

      {settings.enabled && (
        <>
          {/* Google Cloud Credential Section */}
          <SettingsSection
            icon={FolderOpen}
            title="Google Cloud Service Account"
            description="Required for transcription via Chirp 3 (Google Cloud Speech-to-Text v2). Provide the path to your service account JSON key file. Your credentials are stored locally and never shared."
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-canopy-text">
                  {settings.googleCloudCredentialPath ? (
                    <span className="flex items-center gap-1.5 text-status-success">
                      <Check className="w-3 h-3" />
                      Service account key configured
                    </span>
                  ) : (
                    <span className="text-canopy-text/50">No credential configured</span>
                  )}
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={credentialInput}
                  onChange={(e) => setCredentialInput(e.target.value)}
                  placeholder={
                    settings.googleCloudCredentialPath
                      ? "Enter new path to replace"
                      : "/path/to/service-account.json"
                  }
                  className="flex-1 bg-canopy-bg border border-canopy-border rounded-[var(--radius-md)] px-3 py-2 font-mono text-sm text-canopy-text placeholder:text-canopy-text/40 focus:outline-none focus:ring-1 focus:ring-canopy-accent"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={credentialValidation === "testing"}
                />
                <Button
                  onClick={handleTestCredential}
                  disabled={
                    credentialValidation === "testing" ||
                    (!credentialInput.trim() && !settings.googleCloudCredentialPath)
                  }
                  variant="outline"
                  size="sm"
                  className="min-w-[70px] text-canopy-text border-canopy-border hover:bg-canopy-border"
                >
                  {credentialValidation === "testing" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <>
                      <FlaskConical />
                      Test
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleSaveCredential}
                  disabled={credentialValidation === "testing" || !credentialInput.trim()}
                  size="sm"
                  className="min-w-[70px]"
                >
                  {credentialValidation === "testing" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
                {settings.googleCloudCredentialPath && (
                  <Button
                    onClick={handleClearCredential}
                    variant="outline"
                    size="sm"
                    className="text-status-error border-canopy-border hover:bg-status-error/10 hover:text-status-error/70 hover:border-status-error/20"
                  >
                    Clear
                  </Button>
                )}
              </div>

              {credentialValidation === "valid" && (
                <p className="text-xs text-status-success flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Service account key is valid
                </p>
              )}
              {credentialValidation === "invalid" && (
                <p className="text-xs text-status-error flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {credentialError || "Invalid credential file"}
                </p>
              )}
            </div>

            <div className="mt-4 space-y-3 rounded-[var(--radius-lg)] border border-canopy-border bg-surface p-4">
              <h4 className="text-sm font-medium text-canopy-text">Get a Service Account Key</h4>
              <p className="text-xs text-canopy-text/60">
                Create a service account in your Google Cloud project, grant it the{" "}
                <span className="font-mono">Cloud Speech Client</span> role, and download a JSON key
                file. Chirp 3 transcription costs ~$0.016/min (~$0.96/hr).
              </p>
              <Button
                onClick={() =>
                  window.electron?.system?.openExternal(
                    "https://console.cloud.google.com/iam-admin/serviceaccounts"
                  )
                }
                variant="outline"
                size="sm"
                className="text-canopy-text border-canopy-border hover:bg-canopy-border"
              >
                <ExternalLink />
                Open Google Cloud Console
              </Button>
            </div>
          </SettingsSection>

          {/* Microphone Permission */}
          <SettingsSection
            icon={Shield}
            title="Microphone Permission"
            description="Canopy needs microphone access to capture audio for transcription."
          >
            <MicPermissionCard
              status={micPermission}
              isRequesting={isRequestingMic}
              onRequest={handleRequestMicPermission}
              onOpenSettings={handleOpenMicSettings}
              onRefresh={handleRefreshMicPermission}
            />
          </SettingsSection>

          {/* Language */}
          <SettingsSection
            icon={Globe}
            title="Language"
            description="Select the primary language for transcription. Setting a language reduces latency and improves accuracy."
          >
            <select
              value={settings.language}
              onChange={(e) => update({ language: e.target.value })}
              className="w-full max-w-xs bg-canopy-bg border border-canopy-border rounded-[var(--radius-md)] px-3 py-2 text-sm text-canopy-text focus:outline-none focus:ring-1 focus:ring-canopy-accent"
            >
              {LANGUAGES.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </SettingsSection>

          {/* AI Text Correction */}
          <AiCorrectionSection settings={settings} update={update} />

          {/* Custom Dictionary */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-canopy-text mb-2 flex items-center gap-2">
                <BookText className="w-4 h-4 text-canopy-text/70" aria-hidden="true" />
                Custom Dictionary
              </h4>
              <p className="text-xs text-canopy-text/50 mb-4">
                Add domain-specific terms, project names, and technical abbreviations to improve
                transcription accuracy.
              </p>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-canopy-border bg-surface p-4 space-y-4">
              <div className="flex gap-2">
                <input
                  ref={dictionaryInputRef}
                  type="text"
                  value={newDictionaryWord}
                  onChange={(e) => setNewDictionaryWord(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDictionaryWord();
                    }
                  }}
                  placeholder="Add term…"
                  className="flex-1 bg-canopy-bg border border-canopy-border rounded-[var(--radius-md)] px-3 py-2 text-sm text-canopy-text placeholder:text-canopy-text/40 focus:outline-none focus:ring-1 focus:ring-canopy-accent"
                />
                <Button
                  onClick={addDictionaryWord}
                  disabled={!newDictionaryWord.trim()}
                  size="sm"
                  variant="outline"
                  className="text-canopy-text border-canopy-border hover:bg-canopy-border"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>

              {settings.customDictionary.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {settings.customDictionary.map((word) => (
                    <span
                      key={word}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-canopy-border bg-canopy-bg px-2.5 py-1 text-xs text-canopy-text"
                    >
                      {word}
                      <button
                        type="button"
                        onClick={() => removeDictionaryWord(word)}
                        className="text-canopy-text/40 hover:text-canopy-text/80 transition-colors"
                        aria-label={`Remove ${word}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-canopy-text/40">
                  No custom terms added. Terms like project names, framework abbreviations, or
                  domain-specific vocabulary help the transcription model understand your speech.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface AiCorrectionSectionProps {
  settings: VoiceInputSettings;
  update: (patch: Partial<VoiceInputSettings>) => void;
}

function AiCorrectionSection({ settings, update }: AiCorrectionSectionProps) {
  const [corePromptExpanded, setCorePromptExpanded] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [keyValidation, setKeyValidation] = useState<ValidationState>("idle");
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    if (keyValidation !== "valid" && keyValidation !== "invalid") return;
    const timer = setTimeout(() => {
      setKeyValidation("idle");
      setKeyError(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [keyValidation]);

  const handleTestKey = useCallback(async () => {
    const key = geminiKeyInput.trim() || settings.geminiApiKey;
    if (!key) return;
    setKeyValidation("testing");
    setKeyError(null);
    try {
      const result = await window.electron?.voiceInput?.validateGeminiKey(key);
      if (result?.valid) {
        setKeyValidation("valid");
      } else {
        setKeyValidation("invalid");
        setKeyError(result?.error || "Invalid API key");
      }
    } catch {
      setKeyValidation("invalid");
      setKeyError("Failed to validate API key");
    }
  }, [geminiKeyInput, settings.geminiApiKey]);

  const handleSaveKey = useCallback(async () => {
    const key = geminiKeyInput.trim();
    if (!key) return;
    setKeyValidation("testing");
    setKeyError(null);
    try {
      const result = await window.electron?.voiceInput?.validateGeminiKey(key);
      if (result?.valid) {
        update({ geminiApiKey: key });
        setGeminiKeyInput("");
        setKeyValidation("valid");
      } else {
        setKeyValidation("invalid");
        setKeyError(result?.error || "Invalid API key");
      }
    } catch {
      setKeyValidation("invalid");
      setKeyError("Failed to validate API key");
    }
  }, [geminiKeyInput, update]);

  const handleClearKey = useCallback(() => {
    update({ geminiApiKey: "" });
    setGeminiKeyInput("");
    setKeyValidation("idle");
    setKeyError(null);
  }, [update]);

  return (
    <>
      <SettingsSwitchCard
        icon={Sparkles}
        title="AI Text Correction"
        subtitle="Automatically clean up transcriptions — correcting mistranscribed words, fixing punctuation, and removing filler words"
        isEnabled={settings.correctionEnabled}
        onChange={() => update({ correctionEnabled: !settings.correctionEnabled })}
        ariaLabel="Toggle AI text correction"
      />

      {settings.correctionEnabled && (
        <SettingsSection
          icon={Sparkles}
          title="Correction Settings"
          description="Transcriptions are corrected using Gemini 3.1 Flash Lite with an optimized prompt. Project name, custom dictionary, and your instructions are included automatically."
        >
          <div className="space-y-4">
            {/* Gemini API Key */}
            <div className="rounded-[var(--radius-lg)] border border-canopy-border bg-surface p-4 space-y-3">
              <h4 className="text-sm font-medium text-canopy-text">Gemini API Key</h4>
              <p className="text-xs text-canopy-text/60">
                Required for AI correction. Get a free key from Google AI Studio.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-canopy-text">
                  {settings.geminiApiKey ? (
                    <span className="flex items-center gap-1.5 text-status-success">
                      <Check className="w-3 h-3" />
                      API key configured
                    </span>
                  ) : (
                    <span className="text-canopy-text/50">No API key set</span>
                  )}
                </span>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    placeholder={settings.geminiApiKey ? "Enter new key to replace" : "AIza..."}
                    className="w-full bg-canopy-bg border border-canopy-border rounded-[var(--radius-md)] px-3 py-2 pr-10 font-mono text-sm text-canopy-text placeholder:text-canopy-text/40 focus:outline-none focus:ring-1 focus:ring-canopy-accent"
                    autoComplete="new-password"
                    spellCheck={false}
                    disabled={keyValidation === "testing"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-canopy-text/40 hover:text-canopy-text/70"
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <Button
                  onClick={handleTestKey}
                  disabled={
                    keyValidation === "testing" ||
                    (!geminiKeyInput.trim() && !settings.geminiApiKey)
                  }
                  variant="outline"
                  size="sm"
                  className="min-w-[70px] text-canopy-text border-canopy-border hover:bg-canopy-border"
                >
                  {keyValidation === "testing" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <>
                      <FlaskConical />
                      Test
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleSaveKey}
                  disabled={keyValidation === "testing" || !geminiKeyInput.trim()}
                  size="sm"
                  className="min-w-[70px]"
                >
                  {keyValidation === "testing" ? <Loader2 className="animate-spin" /> : "Save"}
                </Button>
                {settings.geminiApiKey && (
                  <Button
                    onClick={handleClearKey}
                    variant="outline"
                    size="sm"
                    className="text-status-error border-canopy-border hover:bg-status-error/10 hover:text-status-error/70 hover:border-status-error/20"
                  >
                    Clear
                  </Button>
                )}
              </div>
              {keyValidation === "valid" && (
                <p className="text-xs text-status-success flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  API key is valid
                </p>
              )}
              {keyValidation === "invalid" && (
                <p className="text-xs text-status-error flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {keyError || "Invalid API key"}
                </p>
              )}
              <Button
                onClick={() =>
                  window.electron?.system?.openExternal("https://aistudio.google.com/apikey")
                }
                variant="outline"
                size="sm"
                className="text-canopy-text border-canopy-border hover:bg-canopy-border"
              >
                <ExternalLink />
                Open Google AI Studio
              </Button>
            </div>

            {/* Core prompt (read-only) */}
            <div className="rounded-[var(--radius-lg)] border border-canopy-border bg-surface p-4 space-y-3">
              <button
                type="button"
                onClick={() => setCorePromptExpanded((v) => !v)}
                className="flex items-center justify-between w-full text-left"
              >
                <h4 className="text-sm font-medium text-canopy-text">Core Prompt</h4>
                {corePromptExpanded ? (
                  <ChevronUp className="w-4 h-4 text-canopy-text/40" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-canopy-text/40" />
                )}
              </button>

              {corePromptExpanded ? (
                <pre className="w-full bg-canopy-bg border border-canopy-border rounded-[var(--radius-md)] px-3 py-2 text-xs font-mono text-canopy-text/60 whitespace-pre-wrap overflow-y-auto max-h-64">
                  {CORE_CORRECTION_PROMPT}
                </pre>
              ) : (
                <p className="text-xs text-canopy-text/40">
                  High-Fidelity Orthographic Auditor — corrects phonetic mistranscriptions,
                  punctuation, homophones, and filler words while preserving the speaker&apos;s
                  original language.
                </p>
              )}
            </div>

            {/* Custom instructions */}
            <div className="rounded-[var(--radius-lg)] border border-canopy-border bg-surface p-4 space-y-3">
              <h4 className="text-sm font-medium text-canopy-text">Custom Instructions</h4>
              <p className="text-xs text-canopy-text/40">
                Add project-specific rules or corrections. These are appended to the core prompt.
              </p>
              <textarea
                value={settings.correctionCustomInstructions}
                onChange={(e) => update({ correctionCustomInstructions: e.target.value })}
                rows={3}
                placeholder='e.g., "Always capitalize ProductName as one word" or "The acronym CMS refers to our Content Management System"'
                className="w-full bg-canopy-bg border border-canopy-border rounded-[var(--radius-md)] px-3 py-2 text-xs font-mono text-canopy-text placeholder:text-canopy-text/30 focus:outline-none focus:ring-1 focus:ring-canopy-accent resize-y"
                spellCheck={false}
              />
            </div>

            <p className="text-xs text-canopy-text/40">
              The system prompt also includes your project name and custom dictionary automatically.
            </p>
          </div>
        </SettingsSection>
      )}
    </>
  );
}

interface MicPermissionCardProps {
  status: MicPermissionStatus;
  isRequesting: boolean;
  onRequest: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
}

function MicPermissionCard({
  status,
  isRequesting,
  onRequest,
  onOpenSettings,
  onRefresh,
}: MicPermissionCardProps) {
  const ua = navigator.userAgent;
  const isMac = ua.includes("Mac OS X");
  const isWindows = ua.includes("Windows");
  const appName = process.env.NODE_ENV === "development" ? "Electron" : "Canopy";

  if (status === "granted") {
    return (
      <div className="flex items-center justify-between p-3 rounded-[var(--radius-md)] bg-status-success/10 border border-status-success/20">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-status-success" />
          <span className="text-sm text-canopy-text">Microphone access granted</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          className="text-canopy-text/50 hover:text-canopy-text"
        >
          Re-check
        </Button>
      </div>
    );
  }

  if (status === "denied" || status === "restricted") {
    const settingsPath = isMac
      ? `System Settings → Privacy & Security → Microphone → enable ${appName}`
      : isWindows
        ? "Windows Settings → Privacy & security → Microphone → allow desktop app access"
        : "your system audio settings";

    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 p-3 rounded-[var(--radius-md)] bg-status-error/10 border border-status-error/20">
          <AlertCircle className="w-4 h-4 text-status-error shrink-0 mt-0.5" />
          <div>
            <span className="text-sm text-canopy-text">
              Microphone access {status === "restricted" ? "restricted" : "denied"}
            </span>
            <p className="text-xs text-canopy-text/60 mt-0.5">
              Open {settingsPath} to grant access.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenSettings}
            className="text-canopy-text border-canopy-border hover:bg-canopy-border"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open {isMac ? "System Settings" : isWindows ? "Windows Settings" : "System Settings"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            className="text-canopy-text/50 hover:text-canopy-text"
          >
            Re-check
          </Button>
        </div>
      </div>
    );
  }

  if (status === "not-determined") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 p-3 rounded-[var(--radius-md)] bg-canopy-bg border border-canopy-border">
          <div className="w-2 h-2 rounded-full bg-status-warning" />
          <span className="text-sm text-canopy-text">Microphone permission not yet requested</span>
        </div>
        <div className="flex gap-2">
          {(isMac || isWindows) && (
            <Button size="sm" onClick={onRequest} disabled={isRequesting} className="min-w-[140px]">
              {isRequesting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  Request Permission
                </>
              )}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenSettings}
            className="text-canopy-text border-canopy-border hover:bg-canopy-border"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open {isMac ? "System Settings" : isWindows ? "Windows Settings" : "System Settings"}
          </Button>
        </div>
      </div>
    );
  }

  // unknown status (e.g. Linux, or failed to check)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-3 rounded-[var(--radius-md)] bg-canopy-bg border border-canopy-border">
        <div className="w-2 h-2 rounded-full bg-canopy-text/30" />
        <span className="text-sm text-canopy-text/70">
          Could not determine microphone permission status
        </span>
      </div>
      <p className="text-xs text-canopy-text/50">
        Microphone access will be requested when you start recording. If recording fails, check your
        system&apos;s audio settings to ensure microphone access is enabled.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onOpenSettings}
          className="text-canopy-text border-canopy-border hover:bg-canopy-border"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open System Settings
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          className="text-canopy-text/50 hover:text-canopy-text"
        >
          Re-check
        </Button>
      </div>
    </div>
  );
}
