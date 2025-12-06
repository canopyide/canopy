import { useState, useEffect } from "react";
import { useErrors, useOverlayState } from "@/hooks";
import { useLogsStore, useSidecarStore } from "@/store";
import { X, Bot, Github, LayoutGrid, PanelRight, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { appClient } from "@/clients";
import { AgentSettings } from "./AgentSettings";
import { GeneralTab } from "./GeneralTab";
import { TerminalSettingsTab } from "./TerminalSettingsTab";
import { GitHubSettingsTab } from "./GitHubSettingsTab";
import { TroubleshootingTab } from "./TroubleshootingTab";
import { SidecarSettingsTab } from "./SidecarSettingsTab";
import { KeyboardShortcutsTab } from "./KeyboardShortcutsTab";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: SettingsTab;
  onSettingsChange?: () => void;
}

type SettingsTab =
  | "general"
  | "keyboard"
  | "terminal"
  | "agents"
  | "github"
  | "sidecar"
  | "troubleshooting";

export function SettingsDialog({
  isOpen,
  onClose,
  defaultTab,
  onSettingsChange,
}: SettingsDialogProps) {
  useOverlayState(isOpen);

  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab ?? "general");
  const setSidecarOpen = useSidecarStore((state) => state.setOpen);

  // Close sidecar when settings opens to prevent z-index conflicts
  useEffect(() => {
    if (isOpen) {
      setSidecarOpen(false);
    }
  }, [isOpen, setSidecarOpen]);
  const { openLogs } = useErrors();
  const clearLogs = useLogsStore((state) => state.clearLogs);

  const [appVersion, setAppVersion] = useState<string>("Loading...");

  useEffect(() => {
    if (isOpen && defaultTab && defaultTab !== activeTab) {
      setActiveTab(defaultTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultTab]);

  useEffect(() => {
    if (isOpen) {
      appClient
        .getVersion()
        .then(setAppVersion)
        .catch((error) => {
          console.error("Failed to fetch app version:", error);
          setAppVersion("Unavailable");
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-canopy-sidebar border border-canopy-border rounded-lg shadow-xl w-full max-w-2xl h-[550px] flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="w-48 border-r border-canopy-border bg-canopy-bg/50 p-4 flex flex-col gap-2">
          <h2 id="settings-title" className="text-sm font-semibold text-canopy-text mb-4 px-2">
            Settings
          </h2>
          <button
            onClick={() => setActiveTab("general")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors",
              activeTab === "general"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-canopy-text/60 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab("keyboard")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
              activeTab === "keyboard"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-canopy-text/60 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            <Keyboard className="w-4 h-4" />
            Keyboard
          </button>
          <button
            onClick={() => setActiveTab("terminal")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
              activeTab === "terminal"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-canopy-text/60 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            <LayoutGrid className="w-4 h-4" />
            Terminal
          </button>
          <button
            onClick={() => setActiveTab("agents")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
              activeTab === "agents"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-canopy-text/60 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            <Bot className="w-4 h-4" />
            Agents
          </button>
          <button
            onClick={() => setActiveTab("github")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
              activeTab === "github"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-canopy-text/60 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            <Github className="w-4 h-4" />
            GitHub
          </button>
          <button
            onClick={() => setActiveTab("sidecar")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
              activeTab === "sidecar"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-canopy-text/60 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            <PanelRight className="w-4 h-4" />
            Sidecar
          </button>
          <button
            onClick={() => setActiveTab("troubleshooting")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors",
              activeTab === "troubleshooting"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-canopy-text/60 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            Troubleshooting
          </button>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between p-6 border-b border-canopy-border">
            <h3 className="text-lg font-medium text-canopy-text capitalize">
              {activeTab === "agents"
                ? "Agent Settings"
                : activeTab === "github"
                  ? "GitHub Integration"
                  : activeTab === "terminal"
                    ? "Terminal Grid"
                    : activeTab === "sidecar"
                      ? "Sidecar Links"
                      : activeTab === "keyboard"
                        ? "Keyboard Shortcuts"
                        : activeTab}
            </h3>
            <button
              onClick={onClose}
              className="text-canopy-text/60 hover:text-canopy-text transition-colors"
              aria-label="Close settings"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
            <div className={activeTab === "general" ? "" : "hidden"}>
              <GeneralTab appVersion={appVersion} onNavigateToAgents={() => setActiveTab("agents")} />
            </div>

            <div className={activeTab === "keyboard" ? "" : "hidden"}>
              <KeyboardShortcutsTab />
            </div>

            <div className={activeTab === "terminal" ? "" : "hidden"}>
              <TerminalSettingsTab />
            </div>

            <div className={activeTab === "agents" ? "" : "hidden"}>
              <AgentSettings onSettingsChange={onSettingsChange} />
            </div>

            <div className={activeTab === "github" ? "" : "hidden"}>
              <GitHubSettingsTab />
            </div>

            <div className={activeTab === "sidecar" ? "" : "hidden"}>
              <SidecarSettingsTab />
            </div>

            <div className={activeTab === "troubleshooting" ? "" : "hidden"}>
              <TroubleshootingTab openLogs={openLogs} clearLogs={clearLogs} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
