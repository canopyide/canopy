import { Terminal, Command } from "lucide-react";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import { getBrandColorHex } from "@/lib/colorUtils";
import type { TerminalType } from "@/types";

export interface LaunchOption {
  id: string;
  type: TerminalType;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export function getLaunchOptions(): LaunchOption[] {
  return [
    {
      id: "claude",
      type: "claude",
      label: "Claude Code",
      description: "Deep, focused refactoring and architecture tasks.",
      icon: <ClaudeIcon className="w-4 h-4" brandColor={getBrandColorHex("claude")} />,
    },
    {
      id: "gemini",
      type: "gemini",
      label: "Gemini CLI",
      description: "Fast exploration and quick coding questions.",
      icon: <GeminiIcon className="w-4 h-4" brandColor={getBrandColorHex("gemini")} />,
    },
    {
      id: "codex",
      type: "codex",
      label: "Codex CLI",
      description: "OpenAI-powered methodical execution.",
      icon: <CodexIcon className="w-4 h-4" brandColor={getBrandColorHex("codex")} />,
    },
    {
      id: "shell",
      type: "shell",
      label: "Terminal",
      description: "Standard system shell (zsh/bash/powershell).",
      icon: <Terminal className="w-4 h-4" />,
    },
    {
      id: "custom",
      type: "custom",
      label: "Custom Command",
      description: "Run a specific command or script.",
      icon: <Command className="w-4 h-4" />,
    },
  ];
}
