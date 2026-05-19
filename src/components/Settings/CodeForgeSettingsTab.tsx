import { useEffect, useState, useMemo, type ComponentType, type ReactNode } from "react";
import { GitBranch, Github } from "lucide-react";
import type { ForgeProviderEntry } from "@shared/types";
import {
  ForgeProviderSelectorDropdown,
  type ForgeProviderOption,
} from "./ForgeProviderSelectorDropdown";
import { GitHubSettingsTab } from "./GitHubSettingsTab";
import { ForgeIntegrationsTab } from "./ForgeIntegrationsTab";
import { useSettingsTabValidation } from "./SettingsValidationRegistry";
import { logError } from "@/utils/logger";

type ForgeIcon = ComponentType<{ className?: string; size?: number; "aria-hidden"?: boolean }>;

function getForgeIcon(id: string): ForgeIcon {
  return id === "github" ? Github : GitBranch;
}

const GENERAL_ID = "general";
const GITHUB_ID = "github";

interface CodeForgeSettingsTabProps {
  activeSubtab: string | null;
  onSubtabChange: (id: string) => void;
}

export function CodeForgeSettingsTab({ activeSubtab, onSubtabChange }: CodeForgeSettingsTabProps) {
  const [providers, setProviders] = useState<ForgeProviderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadTimedOut(false);
    const timer = setTimeout(() => {
      if (!cancelled) setLoadTimedOut(true);
    }, 10_000);

    window.electron.forge
      .getProviders()
      .then((loaded) => {
        if (cancelled) return;
        setProviders(loaded);
        setLoadTimedOut(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError("Couldn't load forge providers");
        logError("Failed to load forge providers for CodeForgeSettingsTab", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const providerOptions = useMemo<ForgeProviderOption[]>(
    () =>
      providers.map((entry) => ({
        id: entry.contribution.id,
        name: entry.contribution.name,
        pluginId: entry.pluginId,
      })),
    [providers]
  );

  const effectiveSubtab =
    activeSubtab &&
    (activeSubtab === GENERAL_ID || providerOptions.some((p) => p.id === activeSubtab))
      ? activeSubtab
      : GITHUB_ID;

  useSettingsTabValidation("code-forge", Boolean(loadError) || loadTimedOut);

  if (loading) {
    if (loadTimedOut) {
      return (
        <div className="flex flex-col items-center justify-center h-32 gap-3">
          <div className="text-status-error text-sm">Settings load timed out</div>
          <button
            onClick={() => window.location.reload()}
            className="text-xs px-3 py-1.5 border border-daintree-border text-daintree-text/70 hover:text-daintree-text hover:bg-overlay-soft rounded transition-colors"
          >
            Reload Application
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-daintree-text/60 text-sm">Loading forge settings...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-3">
        <div className="text-status-error text-sm">{loadError}</div>
        <button
          onClick={() => window.location.reload()}
          className="text-xs px-3 py-1.5 border border-daintree-border text-daintree-text/70 hover:text-daintree-text hover:bg-overlay-soft rounded transition-colors"
        >
          Reload Application
        </button>
      </div>
    );
  }

  const isGeneral = effectiveSubtab === GENERAL_ID;
  const isGitHub = effectiveSubtab === GITHUB_ID;
  const selectedEntry = !isGeneral
    ? providers.find((p) => p.contribution.id === effectiveSubtab)
    : null;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium mb-1">Code Forge</h4>
          <p className="text-xs text-daintree-text/50 select-text">
            Configure forge providers and authentication
          </p>
        </div>

        <ForgeProviderSelectorDropdown
          providerOptions={providerOptions}
          activeSubtab={effectiveSubtab}
          onSubtabChange={onSubtabChange}
        />

        {isGeneral && <ForgeIntegrationsTab />}

        {isGitHub && (
          <ForgeProviderCard name="GitHub" Icon={Github}>
            <GitHubSettingsTab />
          </ForgeProviderCard>
        )}

        {!isGeneral && !isGitHub && selectedEntry && (
          <ForgeProviderCard
            name={selectedEntry.contribution.name}
            Icon={getForgeIcon(selectedEntry.contribution.id)}
          >
            <ProviderSettingsBody
              pluginId={selectedEntry.pluginId}
              capabilities={selectedEntry.contribution.capabilities}
            />
          </ForgeProviderCard>
        )}
      </div>
    </div>
  );
}

interface ForgeProviderCardProps {
  name: string;
  Icon: ForgeIcon;
  children: ReactNode;
}

function ForgeProviderCard({ name, Icon, children }: ForgeProviderCardProps) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-daintree-border bg-surface p-4 space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-daintree-border">
        <Icon className="w-6 h-6 text-daintree-text" aria-hidden={true} />
        <div>
          <h4 className="text-sm font-medium text-daintree-text">{name} settings</h4>
          <p className="text-xs text-daintree-text/50 select-text">
            Configure {name} authentication and integrations
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

interface ProviderSettingsBodyProps {
  pluginId: string;
  capabilities?: string[];
}

function ProviderSettingsBody({ pluginId, capabilities }: ProviderSettingsBodyProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-daintree-text/50 font-mono">{pluginId}</p>
      {capabilities && capabilities.length > 0 && (
        <div>
          <p className="text-xs font-medium text-daintree-text/70 mb-1">Capabilities</p>
          <ul className="text-xs text-daintree-text/50 space-y-0.5">
            {capabilities.map((cap) => (
              <li key={cap} className="list-disc list-inside">
                {cap}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-daintree-text/50">No configuration needed</p>
    </div>
  );
}
