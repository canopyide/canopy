import { Button } from "@/components/ui/button";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { getBrandColorHex } from "@/lib/colorUtils";
import type { ComponentType } from "react";

type AgentType = "claude" | "gemini" | "codex";

interface IconProps {
  className?: string;
  brandColor?: string;
}

interface AgentMeta {
  name: string;
  Icon: ComponentType<IconProps>;
  shortcut: string | null;
  tooltip: string;
}

const AGENT_META: Record<AgentType, AgentMeta> = {
  claude: {
    name: "Claude",
    Icon: ClaudeIcon,
    shortcut: "Cmd/Ctrl+Alt+C",
    tooltip: "deep, focused work",
  },
  gemini: {
    name: "Gemini",
    Icon: GeminiIcon,
    shortcut: "Cmd/Ctrl+Alt+G",
    tooltip: "quick exploration",
  },
  codex: {
    name: "Codex",
    Icon: CodexIcon,
    shortcut: "Cmd/Ctrl+Alt+X",
    tooltip: "careful, methodical runs",
  },
};

interface AgentButtonProps {
  type: AgentType;
  availability?: boolean;
  isEnabled: boolean;
  onLaunch: () => void;
  onOpenSettings: () => void;
}

export function AgentButton({
  type,
  availability,
  isEnabled,
  onLaunch,
  onOpenSettings,
}: AgentButtonProps) {
  if (!isEnabled) return null;

  const meta = AGENT_META[type];
  const isLoading = availability === undefined;
  const isAvailable = availability ?? false;

  const tooltip = isLoading
    ? `Checking ${meta.name} CLI availability...`
    : isAvailable
      ? `Start ${meta.name} — ${meta.tooltip}${meta.shortcut ? ` (${meta.shortcut})` : ""}`
      : `${meta.name} CLI not found. Click to install.`;

  const ariaLabel = isLoading
    ? `Checking ${meta.name} availability`
    : isAvailable
      ? `Start ${meta.name} Agent`
      : `${meta.name} CLI not installed`;

  const handleClick = () => {
    if (isAvailable) {
      onLaunch();
    } else {
      onOpenSettings();
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        "text-canopy-text hover:bg-canopy-border h-8 w-8 transition-colors",
        isAvailable && "hover:text-canopy-accent focus-visible:text-canopy-accent",
        !isAvailable && !isLoading && "opacity-60"
      )}
      title={tooltip}
      aria-label={ariaLabel}
    >
      <div className="relative">
        <meta.Icon className="h-4 w-4" brandColor={getBrandColorHex(type)} />
        {!isAvailable && !isLoading && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />
        )}
      </div>
    </Button>
  );
}
