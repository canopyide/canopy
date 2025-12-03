import { useState, useEffect } from "react";
import { Plus, Trash2, X, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectSettings } from "@/hooks/useProjectSettings";
import { useProjectStore } from "@/store/projectStore";
import type { RunCommand } from "@/types";
import { cn } from "@/lib/utils";
import { getProjectGradient } from "@/lib/colorUtils";

interface ProjectSettingsDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectSettingsDialog({ projectId, isOpen, onClose }: ProjectSettingsDialogProps) {
  const { settings, detectedRunners, saveSettings, promoteToSaved, isLoading, error } =
    useProjectSettings(projectId);
  const { projects, regenerateIdentity } = useProjectStore();
  const currentProject = projects.find((p) => p.id === projectId);

  const [commands, setCommands] = useState<RunCommand[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [promotingIds, setPromotingIds] = useState<Set<string>>(new Set());
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    if (isOpen && settings?.runCommands) {
      setCommands([...settings.runCommands]);
    }
  }, [settings, isOpen]);

  const handleAddCommand = () => {
    setCommands([...commands, { id: crypto.randomUUID(), name: "", command: "" }]);
  };

  const handleChange = (id: string, field: keyof RunCommand, value: string) => {
    setCommands((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleRemove = (id: string) => {
    setCommands((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSave = async () => {
    if (!settings) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      await saveSettings({
        ...settings,
        runCommands: commands.filter((c) => c.name && c.command),
      });
      onClose();
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveError(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateIdentity = async () => {
    setIsRegenerating(true);
    try {
      await regenerateIdentity(projectId);
    } catch (error) {
      console.error("Failed to regenerate identity:", error);
      setSaveError(error instanceof Error ? error.message : "Failed to regenerate identity");
    } finally {
      setIsRegenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-canopy-sidebar border border-canopy-border rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-canopy-border">
          <h2 id="project-settings-title" className="text-lg font-semibold text-canopy-text">
            Project Settings
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-canopy-text transition-colors"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {isLoading && (
            <div className="text-sm text-gray-400 text-center py-8">Loading settings...</div>
          )}
          {error && (
            <div className="text-sm text-[var(--color-status-error)] bg-red-900/20 border border-red-900/30 rounded p-3 mb-4">
              Failed to load settings: {error}
            </div>
          )}
          {saveError && (
            <div className="text-sm text-[var(--color-status-error)] bg-red-900/20 border border-red-900/30 rounded p-3 mb-4">
              {saveError}
            </div>
          )}
          {!isLoading && !error && (
            <>
              {currentProject && (
                <div className="mb-6 pb-6 border-b border-canopy-border">
                  <h3 className="text-sm font-semibold text-canopy-text/80 mb-2">
                    Project Identity
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Customize how your project appears in Canopy, or regenerate with AI.
                  </p>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 rounded-md bg-canopy-bg border border-canopy-border">
                      <div
                        className="flex h-14 w-14 items-center justify-center rounded-xl shadow-inner shrink-0 bg-white/5"
                        style={{
                          background: getProjectGradient(currentProject.color),
                        }}
                      >
                        <span className="text-3xl select-none filter drop-shadow-sm">
                          {currentProject.emoji || "🌲"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-canopy-text truncate">
                          {currentProject.name}
                        </div>
                        {currentProject.aiGeneratedName && currentProject.aiGeneratedEmoji && (
                          <div className="text-xs text-gray-500 truncate">
                            AI suggested: {currentProject.aiGeneratedEmoji}{" "}
                            {currentProject.aiGeneratedName}
                          </div>
                        )}
                        {currentProject.color && (
                          <div className="text-xs text-gray-500 mt-1">
                            Color: {currentProject.color}
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={handleRegenerateIdentity}
                        variant="outline"
                        size="sm"
                        disabled={isRegenerating}
                        className="shrink-0"
                      >
                        <RefreshCw
                          className={cn("h-4 w-4 mr-2", isRegenerating && "animate-spin")}
                        />
                        {isRegenerating ? "Regenerating..." : "Regenerate"}
                      </Button>
                    </div>

                    {currentProject.aiGeneratedName && (
                      <div className="text-xs text-gray-400 italic">
                        Tip: Regenerate to get new AI suggestions based on your project name and
                        structure.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-canopy-text/80 mb-2">Run Commands</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Configure quick commands to run in terminals. These will appear as buttons in the
                  sidebar.
                </p>
                <div className="space-y-2">
                  {commands.map((cmd) => (
                    <div key={cmd.id} className="flex gap-2 items-center">
                      <input
                        className={cn(
                          "bg-canopy-bg border border-canopy-border rounded px-2 py-1.5 text-sm text-canopy-text w-1/3",
                          "focus:outline-none focus:border-canopy-accent focus:ring-1 focus:ring-canopy-accent/30"
                        )}
                        value={cmd.name}
                        onChange={(e) => handleChange(cmd.id, "name", e.target.value)}
                        placeholder="Name (e.g. Dev Server)"
                      />
                      <input
                        className={cn(
                          "bg-canopy-bg border border-canopy-border rounded px-2 py-1.5 text-sm text-canopy-text flex-1 font-mono",
                          "focus:outline-none focus:border-canopy-accent focus:ring-1 focus:ring-canopy-accent/30"
                        )}
                        value={cmd.command}
                        onChange={(e) => handleChange(cmd.id, "command", e.target.value)}
                        placeholder="Command (e.g. npm run dev)"
                      />
                      <Button
                        onClick={() => handleRemove(cmd.id)}
                        variant="ghost"
                        size="icon"
                        className="text-[var(--color-status-error)] hover:text-red-300 hover:bg-red-900/20 h-8 w-8"
                        title="Remove command"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  {commands.length === 0 && (
                    <div className="text-sm text-gray-500 text-center py-4 border border-dashed border-canopy-border rounded">
                      No run commands configured
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleAddCommand}
                  variant="outline"
                  className="mt-3 w-full border-dashed border-canopy-border text-gray-400 hover:text-canopy-text hover:border-canopy-accent/50"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Command
                </Button>
              </div>

              {detectedRunners.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-canopy-text/80 mb-2 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[var(--color-status-warning)]" />
                    Suggested Commands
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">
                    These commands were detected from your project files. Click + to add them to
                    your saved commands.
                  </p>
                  <div className="space-y-1.5">
                    {detectedRunners.map((cmd) => (
                      <div
                        key={cmd.id}
                        className="flex items-center gap-2 p-2 rounded bg-canopy-bg/50 border border-canopy-border/50 hover:border-canopy-border transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-canopy-text truncate">
                              {cmd.name}
                            </span>
                            {cmd.icon && (
                              <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-canopy-border/30 rounded">
                                {cmd.icon}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 font-mono truncate">
                            {cmd.command}
                          </div>
                          {cmd.description && (
                            <div className="text-xs text-gray-600 truncate mt-0.5">
                              {cmd.description}
                            </div>
                          )}
                        </div>
                        <Button
                          onClick={async () => {
                            setPromotingIds((prev) => new Set(prev).add(cmd.id));
                            setSaveError(null);
                            try {
                              await promoteToSaved(cmd);
                            } catch (err) {
                              const errorMsg =
                                err instanceof Error ? err.message : "Failed to add command";
                              setSaveError(errorMsg);
                            } finally {
                              setPromotingIds((prev) => {
                                const next = new Set(prev);
                                next.delete(cmd.id);
                                return next;
                              });
                            }
                          }}
                          variant="ghost"
                          size="icon"
                          disabled={promotingIds.has(cmd.id)}
                          className="text-[var(--color-status-success)] hover:text-green-300 hover:bg-green-900/20 h-8 w-8 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Add to saved commands"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-canopy-border">
          <Button
            onClick={onClose}
            variant="ghost"
            className="text-gray-400 hover:text-canopy-text"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading || !!error}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
