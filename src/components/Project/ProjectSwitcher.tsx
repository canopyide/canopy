import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { ChevronsUpDown, Plus, Circle, StopCircle } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { getProjectGradient } from "@/lib/colorUtils";
import { useProjectStore } from "@/store/projectStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useTerminalStore } from "@/store/terminalStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { projectClient, terminalClient } from "@/clients";
import { panelKindHasPty } from "@shared/config/panelKindRegistry";
import type { Project, ProjectStats } from "@shared/types";
import { isAgentTerminal } from "@/utils/terminalType";
import { groupProjects } from "./projectGrouping";
import { ProjectActionRow } from "./ProjectActionRow";

interface ProjectTerminalCounts {
  activeAgentCount: number;
  waitingAgentCount: number;
  terminalCount: number;
}

export function ProjectSwitcher() {
  const {
    projects,
    currentProject,
    isLoading,
    loadProjects,
    getCurrentProject,
    switchProject,
    addProject,
    closeProject,
    reopenProject,
  } = useProjectStore();

  const activeProjectTerminalCounts = useTerminalStore(
    useShallow((state) => {
      let activeAgentCount = 0;
      let waitingAgentCount = 0;
      let terminalCount = 0;

      for (const terminal of state.terminals) {
        if (!panelKindHasPty(terminal.kind ?? "terminal")) continue;
        if (terminal.kind === "dev-preview") continue;

        const agentState = terminal.agentState;
        const isAgent = isAgentTerminal(terminal.kind ?? terminal.type, terminal.agentId);

        if (isAgent) {
          if (agentState === "waiting") {
            waitingAgentCount += 1;
          } else if (agentState === "working" || agentState === "running" || agentState == null) {
            activeAgentCount += 1;
          }
        } else {
          terminalCount += 1;
        }
      }

      return { activeAgentCount, waitingAgentCount, terminalCount };
    })
  );

  const { addNotification } = useNotificationStore();
  const [isOpen, setIsOpen] = useState(false);
  const [projectStats, setProjectStats] = useState<Map<string, ProjectStats>>(new Map());
  const [terminalCounts, setTerminalCounts] = useState<Map<string, ProjectTerminalCounts>>(
    new Map()
  );
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isLoadingTerminalCounts, setIsLoadingTerminalCounts] = useState(false);
  const switchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleProjectSwitch = (projectId: string) => {
    if (switchTimeoutRef.current) {
      clearTimeout(switchTimeoutRef.current);
    }

    addNotification({
      type: "info",
      title: "Switching projects",
      message: "Resetting state for clean project isolation",
      duration: 1500,
    });

    switchTimeoutRef.current = setTimeout(() => {
      switchProject(projectId);
    }, 1500);
  };

  const fetchProjectStats = useCallback(async (projectsToFetch: Project[]) => {
    setIsLoadingStats(true);
    const stats = new Map<string, ProjectStats>();

    const isVerbose =
      typeof process !== "undefined" &&
      typeof process.env !== "undefined" &&
      Boolean(process.env.CANOPY_VERBOSE);

    try {
      const results = await Promise.allSettled(
        projectsToFetch.map((project) => projectClient.getStats(project.id))
      );

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          stats.set(projectsToFetch[index].id, result.value);
          // Debug: log stats for each project
          if (isVerbose) {
            console.log(
              `[ProjectSwitcher] Stats for "${projectsToFetch[index].name}":`,
              result.value
            );
          }
        } else {
          console.warn(`Failed to fetch stats for ${projectsToFetch[index].id}:`, result.reason);
        }
      });

      setProjectStats(stats);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const fetchProjectTerminalCounts = useCallback(async (projectsToFetch: Project[]) => {
    setIsLoadingTerminalCounts(true);
    const nextCounts = new Map<string, ProjectTerminalCounts>();

    try {
      const results = await Promise.allSettled(
        projectsToFetch.map((project) => terminalClient.getForProject(project.id))
      );

      results.forEach((result, index) => {
        if (result.status !== "fulfilled") {
          console.warn(
            `Failed to fetch terminals for ${projectsToFetch[index].id}:`,
            result.reason
          );
          return;
        }

        let activeAgentCount = 0;
        let waitingAgentCount = 0;
        let terminalCount = 0;

        for (const terminal of result.value) {
          if (!panelKindHasPty(terminal.kind ?? "terminal")) continue;
          if (terminal.kind === "dev-preview") continue;

          const agentState = terminal.agentState;
          const isAgent = isAgentTerminal(terminal.kind ?? terminal.type, terminal.agentId);

          if (isAgent) {
            if (agentState === "waiting") {
              waitingAgentCount += 1;
            } else if (agentState === "working" || agentState === "running" || agentState == null) {
              activeAgentCount += 1;
            }
          } else {
            terminalCount += 1;
          }
        }

        nextCounts.set(projectsToFetch[index].id, {
          activeAgentCount,
          waitingAgentCount,
          terminalCount,
        });
      });

      setTerminalCounts(nextCounts);
    } finally {
      setIsLoadingTerminalCounts(false);
    }
  }, []);

  const handleCloseProject = async (
    projectId: string,
    e: React.MouseEvent,
    killTerminals: boolean = false
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const stats = projectStats.get(projectId);
    const project = projects.find((p) => p.id === projectId);

    if (killTerminals) {
      // Kill mode: confirm before killing processes
      const processCount = stats?.processCount;

      const name = project?.name ?? "this project";
      const confirmMessage =
        processCount && processCount > 0
          ? `Stop "${name}"?\n\n` +
            `This will terminate ${processCount} process(es):\n` +
            `- ${stats?.terminalCount ?? 0} terminal(s)\n\n` +
            "Terminals cannot be recovered after this."
          : `Stop "${name}"?\n\n` +
            "This will terminate all terminals for this project.\n\n" +
            "Terminals cannot be recovered after this.";

      const confirmed = window.confirm(confirmMessage);

      if (!confirmed) return;
    }

    try {
      const result = await closeProject(projectId, { killTerminals });

      if (killTerminals) {
        setProjectStats((prev) => {
          const next = new Map(prev);
          next.set(projectId, {
            processCount: 0,
            terminalCount: 0,
            estimatedMemoryMB: 0,
            terminalTypes: {},
            processIds: [],
          });
          return next;
        });
        setTerminalCounts((prev) => {
          const next = new Map(prev);
          next.set(projectId, { activeAgentCount: 0, waitingAgentCount: 0, terminalCount: 0 });
          return next;
        });

        addNotification({
          type: "success",
          title: "Project stopped",
          message: `Terminated ${result.processesKilled} process(es)`,
          duration: 3000,
        });
      } else {
        addNotification({
          type: "info",
          title: "Project backgrounded",
          message: "Terminals are still running in the background",
          duration: 3000,
        });
      }

      // Refresh stats after close
      const updatedProjects = await projectClient.getAll();
      await Promise.all([
        fetchProjectStats(updatedProjects),
        fetchProjectTerminalCounts(updatedProjects),
      ]);
    } catch (error) {
      addNotification({
        type: "error",
        title: "Failed to close project",
        message: error instanceof Error ? error.message : "Unknown error",
        duration: 5000,
      });
    }
  };

  const handleReopenProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    addNotification({
      type: "info",
      title: "Reopening project",
      message: "Reconnecting to background terminals...",
      duration: 1500,
    });

    try {
      await reopenProject(projectId);
    } catch (error) {
      addNotification({
        type: "error",
        title: "Failed to reopen project",
        message: error instanceof Error ? error.message : "Unknown error",
        duration: 5000,
      });
    }
  };

  useEffect(() => {
    loadProjects();
    getCurrentProject();

    const cleanup = projectClient.onSwitch(() => {
      getCurrentProject();
      loadProjects();
    });

    return () => {
      cleanup();
      if (switchTimeoutRef.current) {
        clearTimeout(switchTimeoutRef.current);
      }
    };
  }, [loadProjects, getCurrentProject]);

  // Refresh projects and fetch stats when dropdown opens
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let inFlight = false;

    const runFetch = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;

      try {
        // Refresh project list to get latest statuses, then fetch stats
        await loadProjects();
        const freshProjects = await projectClient.getAll();
        if (!cancelled && freshProjects.length > 0) {
          await Promise.all([
            fetchProjectStats(freshProjects),
            fetchProjectTerminalCounts(freshProjects),
          ]);
        }
      } finally {
        inFlight = false;
      }
    };

    void runFetch(); // Initial fetch
    const interval = setInterval(() => void runFetch(), 10000); // Poll every 10s (reduced from 5s)

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isOpen, fetchProjectStats, fetchProjectTerminalCounts, loadProjects]);

  const renderIcon = (emoji: string, color?: string, sizeClass = "h-9 w-9 text-lg") => (
    <div
      className={cn(
        "flex items-center justify-center rounded-[var(--radius-xl)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] shrink-0 transition-all duration-200",
        sizeClass
      )}
      style={{
        background: `linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.2)), ${getProjectGradient(color)}`,
      }}
    >
      <span className="leading-none select-none filter drop-shadow-sm">{emoji}</span>
    </div>
  );

  const groupedProjects = useMemo(
    () => groupProjects(projects, currentProject?.id || null, projectStats),
    [projects, currentProject?.id, projectStats]
  );

  const renderProjectItem = (project: Project, isActive: boolean) => {
    const stats = projectStats.get(project.id);
    const isBackground = project.status === "background";
    const isCurrentProject = currentProject?.id === project.id;
    const counts = terminalCounts.get(project.id);
    const activeAgentCount = isCurrentProject
      ? activeProjectTerminalCounts.activeAgentCount
      : counts
        ? counts.activeAgentCount
        : null;
    const waitingAgentCount = isCurrentProject
      ? activeProjectTerminalCounts.waitingAgentCount
      : counts
        ? counts.waitingAgentCount
        : null;
    const terminalCount = isCurrentProject
      ? activeProjectTerminalCounts.terminalCount
      : counts
        ? counts.terminalCount
        : null;
    const hasProcesses = Boolean(stats && stats.processCount > 0);
    const showStop =
      project.status === "active" || project.status === "background" || isActive || hasProcesses;

    return (
      <DropdownMenuItem
        key={project.id}
        onClick={(e) => {
          if (isLoading) return;
          if (isActive && currentProject) return;

          if (isBackground) {
            handleReopenProject(project.id, e);
          } else {
            handleProjectSwitch(project.id);
          }
        }}
        disabled={isLoading}
        className={cn(
          "p-2 cursor-pointer mb-1 rounded-[var(--radius-lg)] items-start transition-colors",
          showStop && "pr-9",
          isActive ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"
        )}
      >
        {showStop && (
          <button
            type="button"
            onClick={(e) => void handleCloseProject(project.id, e, true)}
            className={cn(
              "absolute top-2 right-2 p-1 rounded transition-colors",
              "text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy-accent"
            )}
            title="Stop project"
            aria-label="Stop project"
          >
            <StopCircle className="w-4 h-4" aria-hidden="true" />
          </button>
        )}

        <div className="flex items-start gap-3 w-full min-w-0">
          {renderIcon(project.emoji || "🌲", project.color, "h-8 w-8 text-base")}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  "truncate text-sm font-semibold",
                  isActive ? "text-foreground" : "text-foreground/85"
                )}
              >
                {project.name}
              </span>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate flex-1 text-[11px] font-mono text-muted-foreground/65">
                {project.path.split(/[/\\]/).pop()}
              </span>

              <ProjectActionRow
                activeAgentCount={activeAgentCount}
                waitingAgentCount={waitingAgentCount}
                terminalCount={terminalCount}
              />
            </div>
          </div>
        </div>
      </DropdownMenuItem>
    );
  };

  const renderGroupedProjects = () => {
    const sections: React.ReactNode[] = [];

    // Active Project Section
    if (groupedProjects.active.length > 0) {
      sections.push(
        <div key="active">
          <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-widest px-2 py-1.5">
            Active
          </DropdownMenuLabel>
          {groupedProjects.active.map((project) => renderProjectItem(project, true))}
        </div>
      );
    }

    // Background Projects Section
    if (groupedProjects.background.length > 0) {
      sections.push(
        <div key="background">
          {sections.length > 0 && <DropdownMenuSeparator className="my-1 bg-border/40" />}
          <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-widest px-2 py-1.5 flex items-center gap-2">
            <Circle
              className={cn(
                "h-2 w-2 fill-green-500 text-green-500",
                (isLoadingStats || isLoadingTerminalCounts) && "animate-pulse"
              )}
            />
            Background ({groupedProjects.background.length})
          </DropdownMenuLabel>
          {groupedProjects.background.map((project) => renderProjectItem(project, false))}
        </div>
      );
    }

    // Recent Projects Section
    if (groupedProjects.recent.length > 0) {
      sections.push(
        <div key="recent">
          {sections.length > 0 && <DropdownMenuSeparator className="my-1 bg-border/40" />}
          <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-widest px-2 py-1.5">
            Recent
          </DropdownMenuLabel>
          {groupedProjects.recent.map((project) => renderProjectItem(project, false))}
        </div>
      );
    }

    return sections;
  };

  if (!currentProject) {
    if (projects.length > 0) {
      return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between text-muted-foreground border-dashed h-12 active:scale-100"
              disabled={isLoading}
            >
              <span>Select Project...</span>
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[440px] max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto p-2"
            align="start"
          >
            {renderGroupedProjects()}

            <DropdownMenuSeparator className="my-1 bg-border/40" />

            <DropdownMenuItem onClick={addProject} className="gap-3 p-2 cursor-pointer">
              <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-muted-foreground/30 bg-muted/20">
                <Plus className="h-4 w-4" />
              </div>
              <span className="font-medium text-sm text-muted-foreground">Add Project...</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    return (
      <Button
        variant="outline"
        className="w-full justify-start text-muted-foreground border-dashed h-12 active:scale-100"
        onClick={addProject}
        disabled={isLoading}
      >
        <Plus className="mr-2 h-4 w-4" />
        Open Project...
      </Button>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-between h-12 px-2.5",
            "rounded-[var(--radius-lg)]",
            "border border-white/[0.06]",
            "bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
            "hover:bg-white/[0.04] transition-colors",
            "active:scale-100"
          )}
          disabled={isLoading}
        >
          <div className="flex items-center gap-3 text-left min-w-0">
            {renderIcon(currentProject.emoji || "🌲", currentProject.color, "h-9 w-9 text-xl")}

            <div className="flex flex-col min-w-0 gap-0.5">
              <span className="truncate font-semibold text-canopy-text text-sm leading-none">
                {currentProject.name}
              </span>
              <span className="truncate text-xs text-muted-foreground/60 font-mono">
                {currentProject.path.split(/[/\\]/).pop()}
              </span>
            </div>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[440px] max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto p-2"
        align="start"
        sideOffset={8}
      >
        {renderGroupedProjects()}

        <DropdownMenuSeparator className="my-1 bg-border/40" />

        <DropdownMenuItem onClick={addProject} className="gap-3 p-2 cursor-pointer">
          <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-muted-foreground/30 bg-muted/20 text-muted-foreground">
            <Plus className="h-4 w-4" />
          </div>
          <span className="font-medium text-sm text-muted-foreground">Add Project...</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
