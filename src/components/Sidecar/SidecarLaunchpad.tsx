import { useState } from "react";
import { Globe, Search } from "lucide-react";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import type { SidecarLink } from "@shared/types";
import { getBrandColorHex } from "@/lib/colorUtils";

function LinkIcon({ link, size = 32 }: { link: SidecarLink; size?: number }) {
  const [showFallback, setShowFallback] = useState(false);
  const iconClass = size === 32 ? "w-8 h-8" : "w-4 h-4";

  if (showFallback || link.icon === "globe") {
    return <Globe className={iconClass} />;
  }

  switch (link.icon) {
    case "claude":
      return <ClaudeIcon className={iconClass} brandColor={getBrandColorHex("claude")} />;
    case "gemini":
      return <GeminiIcon className={iconClass} brandColor={getBrandColorHex("gemini")} />;
    case "openai":
      return <CodexIcon className={iconClass} brandColor={getBrandColorHex("codex")} />;
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
  links: SidecarLink[];
  onOpenUrl: (url: string, title: string) => void;
}

export function SidecarLaunchpad({ links, onOpenUrl }: SidecarLaunchpadProps) {
  if (links.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-6">
        <Globe className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm">No AI agents configured</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h2 className="text-lg font-medium mb-6 text-zinc-200 text-center">New Chat</h2>
        <div className="grid grid-cols-1 gap-4">
          {links.map((link) => (
            <button
              key={link.id}
              onClick={() => onOpenUrl(link.url, link.title)}
              className="flex items-center gap-4 p-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 hover:border-zinc-600 transition-all group focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              <div className="w-8 h-8 flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors">
                <LinkIcon link={link} size={32} />
              </div>
              <div className="text-left">
                <div className="font-medium text-zinc-200 group-hover:text-white transition-colors">
                  {link.title}
                </div>
                <div className="text-xs text-zinc-500">Open web client</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
