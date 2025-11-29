/**
 * Project Runners Component
 *
 * Displays both saved and auto-detected run commands in a collapsible footer.
 * Auto-detected commands are merged with saved commands and deduplicated.
 * Clicking a button spawns a terminal with that command.
 */

import { useState, useMemo } from "react";
import { Play, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { useProjectSettings } from "@/hooks/useProjectSettings";
import { useTerminalStore } from "@/store/terminalStore";
import { useProjectStore } from "@/store/projectStore";
import type { RunCommand } from "@/types";
import { cn } from "@/lib/utils";

interface ProjectRunnersProps {
  projectId: string;
}

export function ProjectRunners({ projectId }: ProjectRunnersProps) {
  const { settings, detectedRunners, isLoading } = useProjectSettings(projectId);
  const currentProject = useProjectStore((state) => state.currentProject);
  const addTerminal = useTerminalStore((state) => state.addTerminal);

  // State for expand/collapse
  const [isExpanded, setIsExpanded] = useState(true);

  // Merge saved commands and detected runners
  const allCommands = useMemo(() => {
    const saved = settings?.runCommands || [];

    // Create a Set of saved command strings to deduplicate
    const savedCmdStrings = new Set(saved.map((c) => c.command));

    // Only add detected runners that aren't already saved
    const uniqueDetected = detectedRunners.filter((d) => !savedCmdStrings.has(d.command));

    return [...saved, ...uniqueDetected];
  }, [settings?.runCommands, detectedRunners]);

  // Don't render if no commands exist at all
  if (isLoading || allCommands.length === 0) {
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
    <div className="border-t border-canopy-border bg-canopy-sidebar shrink-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="runners-panel"
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-canopy-text/60 hover:text-canopy-text hover:bg-canopy-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy-accent transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="uppercase tracking-wide truncate">Runners ({allCommands.length})</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
        )}
      </button>

      {isExpanded && (
        <div id="runners-panel" className="p-2 grid grid-cols-1 gap-1 max-h-[200px] overflow-y-auto">
          {allCommands.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => handleRun(cmd)}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded",
                "bg-canopy-bg/50 border border-canopy-border/50",
                "hover:border-canopy-accent/50 hover:bg-canopy-accent/5 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy-accent",
                "text-xs text-canopy-text text-left group w-full"
              )}
              title={cmd.description || cmd.command}
            >
              <Play className="h-3 w-3 text-green-400 group-hover:text-green-300 transition-colors flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{cmd.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
