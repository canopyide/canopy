import { useEffect, useState } from "react";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getProjectGradient } from "@/lib/colorUtils";
import { useProjectStore } from "@/store/projectStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function ProjectSwitcher() {
  const {
    projects,
    currentProject,
    isLoading,
    loadProjects,
    getCurrentProject,
    switchProject,
    addProject,
  } = useProjectStore();

  const [isOpen, setIsOpen] = useState(false);

  // Initial load
  useEffect(() => {
    loadProjects();
    getCurrentProject();

    // Listen for switch events from menu/system
    const cleanup = window.electron.project.onSwitch(() => {
      getCurrentProject();
      loadProjects();
    });

    return cleanup;
  }, [loadProjects, getCurrentProject]);

  // If no project is selected yet
  if (!currentProject) {
    // If projects exist, show dropdown to select one
    if (projects.length > 0) {
      return (
        <div className="p-2">
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-muted-foreground"
                disabled={isLoading}
              >
                <ChevronsUpDown className="mr-2 h-4 w-4" />
                Select Project...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64" align="start">
              <DropdownMenuLabel className="text-xs text-canopy-text/60">
                Projects
              </DropdownMenuLabel>

              {projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => switchProject(project.id)}
                  className="gap-2 p-2"
                >
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-canopy-border"
                    style={{
                      background: getProjectGradient(project.color),
                      backgroundColor: !getProjectGradient(project.color)
                        ? "var(--canopy-bg)"
                        : undefined,
                    }}
                  >
                    <span className="text-sm">{project.emoji || "🌲"}</span>
                  </div>
                  <span className="flex-1 truncate">{project.name}</span>
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={addProject} className="gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-canopy-text/30">
                  <Plus className="h-4 w-4" />
                </div>
                Add Project...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }

    // No projects at all - show "Open Project" button
    return (
      <div className="p-2">
        <Button
          variant="outline"
          className="w-full justify-start text-muted-foreground"
          onClick={addProject}
          disabled={isLoading}
        >
          <Plus className="mr-2 h-4 w-4" />
          Open Project...
        </Button>
      </div>
    );
  }

  return (
    <div className="p-2">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between px-2 hover:bg-canopy-border/50 h-12"
            disabled={isLoading}
          >
            <div className="flex items-center gap-2 text-left min-w-0">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-md border"
                style={{
                  background: getProjectGradient(currentProject.color),
                  backgroundColor: !getProjectGradient(currentProject.color)
                    ? "rgba(var(--canopy-accent-rgb), 0.1)"
                    : undefined,
                  borderColor: !getProjectGradient(currentProject.color)
                    ? "rgba(var(--canopy-accent-rgb), 0.2)"
                    : "transparent",
                }}
              >
                <span className="text-lg leading-none">{currentProject.emoji || "🌲"}</span>
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-canopy-text">
                  {currentProject.name}
                </span>
                <span className="truncate text-xs text-canopy-text/60">
                  {currentProject.path.split(/[/\\]/).pop()}
                </span>
              </div>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="start">
          <DropdownMenuLabel className="text-xs text-canopy-text/60">Projects</DropdownMenuLabel>

          {projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() => {
                if (project.id !== currentProject.id && !isLoading) {
                  switchProject(project.id);
                }
              }}
              disabled={isLoading}
              className={cn("gap-2 p-2", project.id === currentProject.id && "bg-canopy-border/30")}
            >
              <div
                className="flex h-6 w-6 items-center justify-center rounded-md border border-canopy-border"
                style={{
                  background: getProjectGradient(project.color),
                  backgroundColor: !getProjectGradient(project.color)
                    ? "var(--canopy-bg)"
                    : undefined,
                }}
              >
                <span className="text-sm">{project.emoji || "🌲"}</span>
              </div>
              <span className="flex-1 truncate">{project.name}</span>
              {currentProject.id === project.id && <Check className="h-4 w-4 text-canopy-accent" />}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={addProject} className="gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-canopy-text/30">
              <Plus className="h-4 w-4" />
            </div>
            Add Project...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
