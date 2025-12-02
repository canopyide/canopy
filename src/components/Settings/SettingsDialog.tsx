/**
 * Settings Dialog Component
 *
 * Modal UI for viewing and configuring application settings.
 * Contains a tabbed interface with navigation sidebar.
 * Tab-specific content is rendered by dedicated tab components.
 */

import { useState, useEffect } from "react";
import { useErrors } from "@/hooks";
import { useLogsStore } from "@/store";
import { X, Sparkles, Bot, Github } from "lucide-react";
import { cn } from "@/lib/utils";
import { appClient } from "@/clients";
import { AgentSettings } from "./AgentSettings";
import { GeneralTab } from "./GeneralTab";
import { AISettingsTab } from "./AISettingsTab";
import { GitHubSettingsTab } from "./GitHubSettingsTab";
import { TroubleshootingTab } from "./TroubleshootingTab";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: SettingsTab;
  /** Called when agent settings change (to refresh toolbar visibility) */
  onSettingsChange?: () => void;
}

type SettingsTab = "general" | "agents" | "ai" | "github" | "troubleshooting";

export function SettingsDialog({
  isOpen,
  onClose,
  defaultTab,
  onSettingsChange,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab ?? "ai");
  const { openLogs } = useErrors();
  const clearLogs = useLogsStore((state) => state.clearLogs);

  // App version state
  const [appVersion, setAppVersion] = useState<string>("Loading...");

  // Update active tab when defaultTab changes while dialog is open
  useEffect(() => {
    if (isOpen && defaultTab && defaultTab !== activeTab) {
      setActiveTab(defaultTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultTab]);

  // Load app version on mount
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
        {/* Sidebar */}
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
                : "text-gray-400 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab("agents")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
              activeTab === "agents"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-gray-400 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            <Bot className="w-4 h-4" />
            Agents
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
              activeTab === "ai"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-gray-400 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            <Sparkles className="w-4 h-4" />
            AI Features
          </button>
          <button
            onClick={() => setActiveTab("github")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
              activeTab === "github"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-gray-400 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            <Github className="w-4 h-4" />
            GitHub
          </button>
          <button
            onClick={() => setActiveTab("troubleshooting")}
            className={cn(
              "text-left px-3 py-2 rounded-md text-sm transition-colors",
              activeTab === "troubleshooting"
                ? "bg-canopy-accent/10 text-canopy-accent"
                : "text-gray-400 hover:bg-canopy-border hover:text-canopy-text"
            )}
          >
            Troubleshooting
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between p-6 border-b border-canopy-border">
            <h3 className="text-lg font-medium text-canopy-text capitalize">
              {activeTab === "ai"
                ? "AI Features"
                : activeTab === "agents"
                  ? "Agent Settings"
                  : activeTab === "github"
                    ? "GitHub Integration"
                    : activeTab}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-canopy-text transition-colors"
              aria-label="Close settings"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
            {/* Render all tabs but hide inactive ones to preserve state */}
            <div className={activeTab === "general" ? "" : "hidden"}>
              <GeneralTab appVersion={appVersion} />
            </div>

            <div className={activeTab === "agents" ? "" : "hidden"}>
              <AgentSettings onSettingsChange={onSettingsChange} />
            </div>

            <div className={activeTab === "ai" ? "" : "hidden"}>
              <AISettingsTab />
            </div>

            <div className={activeTab === "github" ? "" : "hidden"}>
              <GitHubSettingsTab />
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
