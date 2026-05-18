import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitBranch } from "lucide-react";
import type { ForgeProviderEntry } from "@shared/types";
import { SettingsSection } from "./SettingsSection";
import { SettingsSelect, type SettingsSelectOption } from "./SettingsSelect";
import { formatErrorMessage } from "@shared/utils/errorMessage";
import { logError } from "@/utils/logger";

// Non-empty sentinel because Radix's `SelectItem` rejects an empty string value
// (it reserves `""` to clear the selection and show the placeholder). Mapped
// to `null` at the IPC boundary in `handleChange`.
const AUTO_DETECT_VALUE = "__auto-detect__";
const AUTO_DETECT_LABEL = "No global default (auto-detect from hostname)";

interface ForgeSettings {
  defaultProviderId: string | null;
}

const DEFAULT_SETTINGS: ForgeSettings = { defaultProviderId: null };

export function ForgeIntegrationsTab() {
  const [settings, setSettings] = useState<ForgeSettings>(DEFAULT_SETTINGS);
  const [providers, setProviders] = useState<ForgeProviderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const writeSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([window.electron.forge.getSettings(), window.electron.forge.getProviders()])
      .then(([loadedSettings, loadedProviders]) => {
        if (cancelled) return;
        setSettings(loadedSettings);
        setProviders(loadedProviders);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(formatErrorMessage(err, "Couldn't load forge integrations"));
        logError("Failed to load forge integration settings", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectValue = settings.defaultProviderId ?? AUTO_DETECT_VALUE;

  const options = useMemo<SettingsSelectOption[]>(() => {
    const base: SettingsSelectOption[] = [
      {
        value: AUTO_DETECT_VALUE,
        label: AUTO_DETECT_LABEL,
        description:
          "Pick the first installed provider whose hostname matches the project's git remote.",
      },
      ...providers.map((entry) => {
        const matches = entry.contribution.matches.join(", ");
        return {
          value: entry.contribution.id,
          label: entry.contribution.name,
          description: matches ? `Matches: ${matches}` : undefined,
        };
      }),
    ];
    const storedId = settings.defaultProviderId;
    if (
      storedId !== null &&
      storedId.length > 0 &&
      !providers.some((entry) => entry.contribution.id === storedId)
    ) {
      base.push({
        value: storedId,
        label: `Unknown provider (${storedId})`,
        description: "The plugin that registered this provider is not currently loaded.",
        disabled: true,
      });
    }
    return base;
  }, [providers, settings.defaultProviderId]);

  const handleChange = useCallback(async (value: string) => {
    const next = value === AUTO_DETECT_VALUE ? null : value;
    const seq = ++writeSeqRef.current;
    let previous: ForgeSettings | undefined;
    setSettings((current) => {
      previous = current;
      return { defaultProviderId: next };
    });
    setError(null);
    try {
      const result = await window.electron.forge.setDefaultProvider(next);
      if (seq !== writeSeqRef.current) return;
      setSettings({ defaultProviderId: result.defaultProviderId });
    } catch (err) {
      if (seq !== writeSeqRef.current) return;
      if (previous) setSettings(previous);
      setError(formatErrorMessage(err, "Couldn't save forge integrations"));
      logError("Failed to save default forge provider", err);
    }
  }, []);

  return (
    <div className="space-y-8">
      <SettingsSection
        icon={GitBranch}
        title="Default forge provider"
        description="Pick the forge provider used for newly opened projects. The per-project setting still wins when set; otherwise the resolver falls back to hostname auto-match."
        id="forge-default-provider"
      >
        <SettingsSelect
          label="Default provider"
          description={
            providers.length === 0 && !loading
              ? "No forge plugins are installed yet. Install a plugin that contributes a forge provider to choose a default."
              : undefined
          }
          scope="global"
          value={selectValue}
          onValueChange={(value) => {
            void handleChange(value);
          }}
          options={options}
          disabled={loading}
          placeholder={loading ? "Loading…" : AUTO_DETECT_LABEL}
          error={error ?? undefined}
        />
      </SettingsSection>
    </div>
  );
}
