import { useState } from "react";
import { RefreshCw, Plus, Trash2, Globe, Check, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidecarStore } from "@/store/sidecarStore";
import { useLinkDiscovery } from "@/hooks/useLinkDiscovery";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import { LINK_TEMPLATES } from "@shared/types";

function ServiceIcon({ name, size = 16 }: { name: string; size?: number }) {
  const className = size === 16 ? "w-4 h-4" : size === 32 ? "w-8 h-8" : "w-4 h-4";

  switch (name) {
    case "claude":
      return <ClaudeIcon className={className} />;
    case "gemini":
      return <GeminiIcon className={className} />;
    case "openai":
      return <CodexIcon className={className} />;
    case "globe":
      return <Globe className={className} />;
    case "search":
      return <Search className={className} />;
    default:
      return <Globe className={className} />;
  }
}

function FaviconIcon({ url }: { url: string }) {
  const [hasError, setHasError] = useState(false);

  try {
    const domain = new URL(url).hostname;
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    if (hasError) {
      return <Globe className="w-4 h-4" />;
    }

    return <img src={faviconUrl} alt="" className="w-4 h-4" onError={() => setHasError(true)} />;
  } catch {
    return <Globe className="w-4 h-4" />;
  }
}

export function SidecarSettingsTab() {
  const links = useSidecarStore((s) => s.links);
  const toggleLink = useSidecarStore((s) => s.toggleLink);
  const addLink = useSidecarStore((s) => s.addLink);
  const removeLink = useSidecarStore((s) => s.removeLink);
  const updateLink = useSidecarStore((s) => s.updateLink);
  const { rescan, isScanning } = useLinkDiscovery();

  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");

  const discoveredLinks = links.filter((l) => l.type === "discovered");
  const userLinks = links.filter((l) => l.type === "user");
  const systemLinks = links.filter((l) => l.type === "system");

  const handleAddLink = () => {
    if (!newLinkName.trim() || !newLinkUrl.trim()) return;

    try {
      const url = new URL(newLinkUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        return;
      }
    } catch {
      return;
    }

    addLink({
      title: newLinkName,
      url: newLinkUrl,
      icon: "globe",
      type: "user",
      enabled: true,
    });

    setNewLinkName("");
    setNewLinkUrl("");
  };

  const handleStartEdit = (id: string, title: string, url: string) => {
    setEditingLinkId(id);
    setEditName(title);
    setEditUrl(url);
  };

  const handleSaveEdit = () => {
    if (!editingLinkId || !editName.trim() || !editUrl.trim()) return;

    try {
      const url = new URL(editUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        return;
      }
    } catch {
      return;
    }

    updateLink(editingLinkId, { title: editName, url: editUrl });
    setEditingLinkId(null);
    setEditName("");
    setEditUrl("");
  };

  const handleCancelEdit = () => {
    setEditingLinkId(null);
    setEditName("");
    setEditUrl("");
  };

  const knownServices = Object.entries(LINK_TEMPLATES).filter(
    ([_, template]) => template.cliDetector
  );

  return (
    <div className="space-y-6">
      <section>
        <h4 className="text-sm font-medium text-canopy-text mb-3">AI Services</h4>
        <div className="space-y-2">
          {knownServices.map(([key, template]) => {
            const link = discoveredLinks.find(
              (l) => l.id === `discovered-${key === "chatgpt" ? "chatgpt" : key}`
            );
            const isDetected = !!link;

            return (
              <div
                key={key}
                className="flex items-center justify-between p-3 rounded-lg bg-canopy-bg border border-canopy-border"
              >
                <div className="flex items-center gap-3">
                  <ServiceIcon name={template.icon} />
                  <span className="text-sm text-canopy-text">{template.title}</span>
                  <span
                    className={cn(
                      "text-xs flex items-center gap-1",
                      isDetected ? "text-green-500" : "text-zinc-500"
                    )}
                  >
                    {isDetected ? (
                      <>
                        <Check className="w-3 h-3" /> CLI detected
                      </>
                    ) : (
                      <>
                        <X className="w-3 h-3" /> Not detected
                      </>
                    )}
                  </span>
                </div>
                <button
                  onClick={() => link && toggleLink(link.id)}
                  disabled={!isDetected}
                  className={cn(
                    "w-10 h-5 rounded-full relative transition-colors",
                    !isDetected && "opacity-50 cursor-not-allowed",
                    link?.enabled ? "bg-canopy-accent" : "bg-canopy-border"
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                      link?.enabled ? "translate-x-5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
            );
          })}
        </div>
        <button
          onClick={rescan}
          disabled={isScanning}
          className="mt-3 flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-canopy-border hover:bg-canopy-border/50 transition-colors text-canopy-text/70"
        >
          <RefreshCw className={cn("w-3 h-3", isScanning && "animate-spin")} />
          {isScanning ? "Scanning..." : "Re-scan for tools"}
        </button>
      </section>

      <section className="pt-4 border-t border-canopy-border">
        <h4 className="text-sm font-medium text-canopy-text mb-3">System Links</h4>
        <div className="space-y-2">
          {systemLinks.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between p-3 rounded-lg bg-canopy-bg border border-canopy-border"
            >
              <div className="flex items-center gap-3">
                <ServiceIcon name={link.icon} />
                <span className="text-sm text-canopy-text">{link.title}</span>
                <span className="text-xs text-zinc-500">{link.url}</span>
              </div>
              <button
                onClick={() => toggleLink(link.id)}
                className={cn(
                  "w-10 h-5 rounded-full relative transition-colors",
                  link.enabled ? "bg-canopy-accent" : "bg-canopy-border"
                )}
              >
                <div
                  className={cn(
                    "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                    link.enabled ? "translate-x-5" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="pt-4 border-t border-canopy-border">
        <h4 className="text-sm font-medium text-canopy-text mb-3">Custom Links</h4>
        <div className="space-y-2">
          {userLinks.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between p-3 rounded-lg bg-canopy-bg border border-canopy-border"
            >
              {editingLinkId === link.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-canopy-bg border border-canopy-border rounded px-2 py-1 text-sm text-canopy-text w-32 focus:border-canopy-accent focus:outline-none"
                    placeholder="Name"
                  />
                  <input
                    type="text"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    className="bg-canopy-bg border border-canopy-border rounded px-2 py-1 text-sm text-canopy-text flex-1 focus:border-canopy-accent focus:outline-none"
                    placeholder="URL"
                  />
                  <button
                    onClick={handleSaveEdit}
                    className="p-1.5 rounded hover:bg-canopy-border text-green-500"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="p-1.5 rounded hover:bg-canopy-border text-zinc-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <FaviconIcon url={link.url} />
                    <span className="text-sm text-canopy-text">{link.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEdit(link.id, link.title, link.url)}
                      className="text-xs text-zinc-500 hover:text-canopy-text px-2 py-1 rounded hover:bg-canopy-border"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleLink(link.id)}
                      disabled={link.alwaysEnabled}
                      className={cn(
                        "w-10 h-5 rounded-full relative transition-colors",
                        link.alwaysEnabled && "opacity-50 cursor-not-allowed",
                        link.enabled ? "bg-canopy-accent" : "bg-canopy-border"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                          link.enabled ? "translate-x-5" : "translate-x-0.5"
                        )}
                      />
                    </button>
                    <button
                      onClick={() => removeLink(link.id)}
                      disabled={link.alwaysEnabled}
                      className={cn(
                        "p-1.5 rounded hover:bg-canopy-border text-zinc-500 hover:text-red-500",
                        link.alwaysEnabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <input
            type="text"
            placeholder="Name"
            value={newLinkName}
            onChange={(e) => setNewLinkName(e.target.value)}
            className="bg-canopy-bg border border-canopy-border rounded px-3 py-2 text-sm text-canopy-text w-32 focus:border-canopy-accent focus:outline-none"
          />
          <input
            type="text"
            placeholder="https://..."
            value={newLinkUrl}
            onChange={(e) => setNewLinkUrl(e.target.value)}
            className="bg-canopy-bg border border-canopy-border rounded px-3 py-2 text-sm text-canopy-text flex-1 focus:border-canopy-accent focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddLink();
            }}
          />
          <button
            onClick={handleAddLink}
            disabled={!newLinkName.trim() || !newLinkUrl.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-canopy-accent text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-canopy-accent/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </section>

      <section className="pt-4 border-t border-canopy-border">
        <p className="text-xs text-canopy-text/50">
          Enabled links appear as tabs in the Sidecar browser panel. AI service links are
          auto-detected based on installed CLI tools.
        </p>
      </section>
    </div>
  );
}
