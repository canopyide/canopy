/**
 * Project Runners Component
 *
 * Displays configured run commands as buttons in the sidebar.
 * Clicking a button spawns a terminal with that command.
 */

import { Play } from "lucide-react";
import { useProjectSettings } from "@/hooks/useProjectSettings";
import { useTerminalStore } from "@/store/terminalStore";
import { useProjectStore } from "@/store/projectStore";
import type { RunCommand } from "@/types";
import { cn } from "@/lib/utils";

interface ProjectRunnersProps {
  projectId: string;
}

export function ProjectRunners({ projectId }: ProjectRunnersProps) {
  const { settings, isLoading } = useProjectSettings(projectId);
  const currentProject = useProjectStore((state) => state.currentProject);
  const addTerminal = useTerminalStore((state) => state.addTerminal);

  // Don't render if no commands configured
  if (isLoading || !settings?.runCommands?.length) {
    return null;
  }

  const handleRun = async (cmd: RunCommand) => {
    if (!currentProject?.path) {
      console.warn("Cannot run command: no project path");
      return;
    }

    try {
      await addTerminal({
        type: "custom",
        title: cmd.name,
        cwd: currentProject.path,
        command: cmd.command,
      });
    } catch (error) {
      console.error("Failed to spawn terminal for command:", error);
    }
  };

  return (
    <div className="p-3 border-b border-canopy-border">
      <div className="text-xs font-semibold text-canopy-text/60 mb-2 uppercase tracking-wide">
        Quick Actions
      </div>
      <div className="grid grid-cols-2 gap-2">
        {settings.runCommands.map((cmd) => (
          <button
            key={cmd.id}
            onClick={() => handleRun(cmd)}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 bg-canopy-bg border border-canopy-border rounded",
              "hover:border-canopy-accent/50 hover:bg-canopy-accent/5 transition-colors",
              "text-xs text-canopy-text text-left group"
            )}
            title={cmd.command}
          >
            <Play className="h-2.5 w-2.5 text-[var(--color-status-success)] group-hover:text-green-300 transition-colors flex-shrink-0" />
            <span className="truncate">{cmd.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
