import type React from "react";
import {
  SquareTerminal,
  Globe,
  MonitorPlay,
  Mic,
  GitPullRequest,
  Bell,
  Settings,
  AlertCircle,
  Plug,
} from "lucide-react";
import { Folders } from "@/components/icons";
import { BUILT_IN_AGENT_IDS, type BuiltInAgentId } from "@shared/config/agentIds";
import type { AnyToolbarButtonId } from "@/../../shared/types/toolbar";
import { getAgentConfig } from "@/config/agents";

export type ToolbarButtonIcon = React.ComponentType<{ className?: string }>;

export interface ToolbarButtonMetadata {
  label: string;
  icon: ToolbarButtonIcon;
  description: string;
}

const STATIC_METADATA: Partial<Record<AnyToolbarButtonId, ToolbarButtonMetadata>> = {
  "agent-tray": {
    label: "Agent Tray",
    icon: Plug,
    description: "Dropdown for launching any agent and jumping into setup",
  },
  terminal: {
    label: "Terminal",
    icon: SquareTerminal,
    description: "Open new terminal",
  },
  browser: {
    label: "Browser",
    icon: Globe,
    description: "Open browser panel",
  },
  "dev-server": {
    label: "Dev Preview",
    icon: MonitorPlay,
    description: "Open dev preview panel",
  },
  "voice-recording": {
    label: "Voice Recording",
    icon: Mic,
    description: "Persistent dictation indicator shown while recording is active",
  },
  "github-stats": {
    label: "GitHub Stats",
    icon: GitPullRequest,
    description: "GitHub issues, PRs, and commits",
  },
  "notification-center": {
    label: "Notifications",
    icon: Bell,
    description: "Notification history dropdown",
  },
  "copy-tree": {
    label: "Copy Context",
    icon: Folders,
    description: "Copy project context to clipboard",
  },
  settings: {
    label: "Settings",
    icon: Settings,
    description: "Open settings dialog",
  },
  problems: {
    label: "Problems",
    icon: AlertCircle,
    description: "Show problems panel",
  },
};

const AGENT_METADATA: Partial<Record<BuiltInAgentId, ToolbarButtonMetadata>> = {};
for (const id of BUILT_IN_AGENT_IDS) {
  const cfg = getAgentConfig(id);
  const name = cfg?.name ?? id;
  AGENT_METADATA[id] = {
    label: `${name} Agent`,
    icon: (cfg?.icon as ToolbarButtonIcon | undefined) ?? SquareTerminal,
    description: `Launch ${name} AI agent`,
  };
}

export const TOOLBAR_BUTTON_METADATA: Partial<Record<AnyToolbarButtonId, ToolbarButtonMetadata>> = {
  ...AGENT_METADATA,
  ...STATIC_METADATA,
};
