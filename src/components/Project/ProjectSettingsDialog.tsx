/**
 * Project Settings Dialog Component
 *
 * Modal UI for editing project-level settings including run commands.
 */

import { useState, useEffect } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectSettings } from "@/hooks/useProjectSettings";
import type { RunCommand } from "@/types";
import { cn } from "@/lib/utils";

interface ProjectSettingsDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectSettingsDialog({ projectId, isOpen, onClose }: ProjectSettingsDialogProps) {
  const { settings, saveSettings, isLoading, error } = useProjectSettings(projectId);
  const [commands, setCommands] = useState<RunCommand[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync local state when settings load OR when dialog opens (reset unsaved changes)
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
        runCommands: commands.filter((c) => c.name && c.command), // Only save valid commands
      });
      onClose();
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveError(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
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
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-canopy-border">
          <h2 id="project-settings-title" className="text-lg font-semibold text-canopy-text">
            Project Settings
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-canopy-text transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {isLoading && (
            <div className="text-sm text-gray-400 text-center py-8">Loading settings...</div>
          )}
          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded p-3 mb-4">
              Failed to load settings: {error}
            </div>
          )}
          {saveError && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded p-3 mb-4">
              {saveError}
            </div>
          )}
          {!isLoading && !error && (
            <div className="mb-4">
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
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-8 w-8"
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
          )}
        </div>

        {/* Footer */}
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
