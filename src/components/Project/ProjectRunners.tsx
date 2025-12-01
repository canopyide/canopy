/**
 * Project Runners Component
 *
 * Displays both saved and auto-detected run commands in a collapsible footer.
 * Auto-detected commands are merged with saved commands and deduplicated.
 * Clicking a button spawns a terminal with that command.
 */

import { useState, useMemo } from "react";
import {
  Play,
  ChevronDown,
  ChevronRight,
  Zap,
  Package,
  FlaskConical,
  Terminal,
  RefreshCw,
  Layers,
} from "lucide-react";
import { useProjectSettings } from "@/hooks/useProjectSettings";
import { useTerminalStore } from "@/store/terminalStore";
import { useProjectStore } from "@/store/projectStore";
import type { RunCommand } from "@/types";
import { cn } from "@/lib/utils";

interface ProjectRunnersProps {
  projectId: string;
}

type CommandCategory = "Development" | "Build" | "Quality" | "Maintenance" | "Scripts";

/**
 * Determines the category, icon, and color scheme for a command based on its name.
 * Uses heuristics to infer the purpose of npm scripts.
 * Prioritizes specific keywords (test, lint, build) over generic ones (dev, watch).
 */
function getCommandMeta(name: string) {
  const n = name.toLowerCase();

  // Check most specific categories first (test, lint, build) before generic (dev, watch)
  if (n.includes("test") || n.includes("lint") || n.includes("check") || n.includes("format")) {
    return {
      category: "Quality" as CommandCategory,
      icon: FlaskConical,
      color: "text-purple-400",
      bg: "group-hover:bg-purple-400/10 group-hover:border-purple-400/20",
    };
  }
  if (n.includes("build") || n.includes("compile") || n.includes("pack")) {
    return {
      category: "Build" as CommandCategory,
      icon: Package,
      color: "text-blue-400",
      bg: "group-hover:bg-blue-400/10 group-hover:border-blue-400/20",
    };
  }
  if (n.includes("clean") || n.includes("reset") || n.includes("rebuild")) {
    return {
      category: "Maintenance" as CommandCategory,
      icon: RefreshCw,
      color: "text-orange-400",
      bg: "group-hover:bg-orange-400/10 group-hover:border-orange-400/20",
    };
  }
  if (n.includes("dev") || n.includes("start") || n.includes("serve") || n.includes("watch")) {
    return {
      category: "Development" as CommandCategory,
      icon: Zap,
      color: "text-yellow-400",
      bg: "group-hover:bg-yellow-400/10 group-hover:border-yellow-400/20",
    };
  }

  return {
    category: "Scripts" as CommandCategory,
    icon: Terminal,
    color: "text-gray-400",
    bg: "group-hover:bg-gray-400/10 group-hover:border-gray-400/20",
  };
}

export function ProjectRunners({ projectId }: ProjectRunnersProps) {
  const { settings, detectedRunners, isLoading } = useProjectSettings(projectId);
  const currentProject = useProjectStore((state) => state.currentProject);
  const addTerminal = useTerminalStore((state) => state.addTerminal);

  // State for expand/collapse
  const [isExpanded, setIsExpanded] = useState(true);

  // Merge and group commands by category
  const groupedCommands = useMemo(() => {
    const saved = settings?.runCommands || [];
    const savedCmdStrings = new Set(saved.map((c) => c.command));
    const uniqueDetected = (detectedRunners ?? []).filter((d) => !savedCmdStrings.has(d.command));
    const all = [...saved, ...uniqueDetected];

    // Group by category with type-safe keys
    const groups: Record<CommandCategory, RunCommand[]> = {
      Development: [],
      Build: [],
      Quality: [],
      Maintenance: [],
      Scripts: [],
    };

    all.forEach((cmd) => {
      const meta = getCommandMeta(cmd.name);
      groups[meta.category].push(cmd);
    });

    // Remove empty groups and return as array of [category, commands]
    return Object.entries(groups).filter(([, cmds]) => cmds.length > 0);
  }, [settings?.runCommands, detectedRunners]);

  // Don't render if no commands exist at all
  if (isLoading || groupedCommands.length === 0) {
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

  // Calculate total command count for header
  const totalCommands = groupedCommands.reduce((sum, [, cmds]) => sum + cmds.length, 0);

  return (
    <div className="border-t border-canopy-border bg-canopy-sidebar/50 shrink-0 flex flex-col min-h-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="runners-panel"
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-canopy-text/60 hover:text-canopy-text hover:bg-canopy-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy-accent transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="uppercase tracking-wide truncate">Runners ({totalCommands})</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
        )}
      </button>

      {isExpanded && (
        <div
          id="runners-panel"
          className="overflow-y-auto max-h-[300px] p-2 space-y-3 custom-scrollbar"
        >
          {groupedCommands.map(([category, commands]) => (
            <div key={category}>
              {/* Subtle Section Header - only show if multiple categories */}
              {groupedCommands.length > 1 && (
                <div className="px-2 mb-1 text-[10px] font-bold text-canopy-text/30 uppercase tracking-wider">
                  {category}
                </div>
              )}

              <div className="space-y-0.5">
                {commands.map((cmd) => {
                  const meta = getCommandMeta(cmd.name);
                  const Icon = meta.icon;

                  return (
                    <button
                      key={cmd.id}
                      onClick={() => handleRun(cmd)}
                      className={cn(
                        "group w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-left transition-all duration-200",
                        "hover:bg-canopy-bg border border-transparent",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy-accent",
                        meta.bg
                      )}
                      title={cmd.description || cmd.command}
                    >
                      {/* Semantic Icon */}
                      <Icon
                        className={cn("h-3.5 w-3.5 shrink-0 transition-colors", meta.color)}
                        aria-hidden="true"
                      />

                      {/* Name & Command Preview */}
                      <div className="flex-1 min-w-0 flex items-baseline justify-between gap-2">
                        <span className="text-xs text-canopy-text/90 font-medium truncate group-hover:text-canopy-text">
                          {cmd.name}
                        </span>
                        {/* Show actual command on hover */}
                        <span className="text-[10px] text-canopy-text/30 font-mono truncate hidden group-hover:block max-w-[120px]">
                          {cmd.command.startsWith("npm run ")
                            ? cmd.command.slice("npm run ".length)
                            : cmd.command}
                        </span>
                      </div>

                      {/* Slide-in Play Action on Hover */}
                      <Play
                        className="h-2.5 w-2.5 text-canopy-text/40 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
