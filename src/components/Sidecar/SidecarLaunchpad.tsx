import { useState } from "react";
import { Globe, Search, Settings } from "lucide-react";
import { useSidecarStore } from "@/store/sidecarStore";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import type { SidecarLink } from "@shared/types";

function LinkIcon({ link, size = 32 }: { link: SidecarLink; size?: number }) {
  const [showFallback, setShowFallback] = useState(false);
  const iconClass = size === 32 ? "w-8 h-8" : "w-4 h-4";

  if (showFallback || link.icon === "globe") {
    return <Globe className={iconClass} />;
  }

  switch (link.icon) {
    case "claude":
      return <ClaudeIcon className={iconClass} />;
    case "gemini":
      return <GeminiIcon className={iconClass} />;
    case "openai":
      return <CodexIcon className={iconClass} />;
    case "search":
      return <Search className={iconClass} />;
    default:
      if (link.type === "user") {
        try {
          const domain = new URL(link.url).hostname;
          const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
          return (
            <img
              src={faviconUrl}
              alt=""
              className={iconClass}
              onError={() => setShowFallback(true)}
            />
          );
        } catch {
          return <Globe className={iconClass} />;
        }
      }
      return <Globe className={iconClass} />;
  }
}

interface SidecarLaunchpadProps {
  onSelectLink: (linkId: string) => void;
  onOpenSettings?: () => void;
}

export function SidecarLaunchpad({ onSelectLink, onOpenSettings }: SidecarLaunchpadProps) {
  const links = useSidecarStore((s) => s.links);
  const enabledLinks = links.filter((l) => l.enabled).sort((a, b) => a.order - b.order);

  if (enabledLinks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-6">
        <Globe className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm mb-4">No links configured</p>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors text-zinc-300 text-sm"
          >
            <Settings className="w-4 h-4" />
            Add links in Settings
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-sm font-medium mb-4 text-zinc-400">Quick Links</h2>
      <div className="grid grid-cols-2 gap-3">
        {enabledLinks.map((link) => (
          <button
            key={link.id}
            onClick={() => onSelectLink(link.id)}
            className="flex flex-col items-center gap-2 p-4 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 hover:border-zinc-600 transition-all group"
          >
            <div className="w-8 h-8 flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors">
              <LinkIcon link={link} size={32} />
            </div>
            <span className="text-sm text-zinc-400 group-hover:text-zinc-200 transition-colors truncate max-w-full">
              {link.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
