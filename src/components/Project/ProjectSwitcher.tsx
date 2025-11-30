import { useEffect, useState } from "react";
import { ChevronsUpDown, Plus, Check, Sparkles, Loader2 } from "lucide-react";
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
import { projectClient } from "@/clients";

export function ProjectSwitcher() {
  const {
    projects,
    currentProject,
    isLoading,
    loadProjects,
    getCurrentProject,
    switchProject,
    addProject,
    regenerateIdentity,
  } = useProjectStore();

  const [isOpen, setIsOpen] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const handleRegenerate = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setRegeneratingId(projectId);
    try {
      await regenerateIdentity(projectId);
    } finally {
      setRegeneratingId(null);
    }
  };

  // Initial load
  useEffect(() => {
    loadProjects();
    getCurrentProject();

    // Listen for switch events from menu/system
    const cleanup = projectClient.onSwitch(() => {
      getCurrentProject();
      loadProjects();
    });

    return cleanup;
  }, [loadProjects, getCurrentProject]);

  // Helper to render the project icon
  const renderIcon = (emoji: string, color?: string, sizeClass = "h-8 w-8 text-lg") => (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border shadow-sm transition-all shrink-0",
        sizeClass
      )}
      style={{
        background: getProjectGradient(color),
        backgroundColor: !getProjectGradient(color)
          ? "rgba(var(--canopy-accent-rgb), 0.05)"
          : undefined,
        borderColor: !getProjectGradient(color) ? "var(--canopy-border)" : "rgba(255,255,255,0.1)", // Subtle inner highlight for gradients
      }}
    >
      <span className="leading-none drop-shadow-sm filter">{emoji}</span>
    </div>
  );

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
                className="w-full justify-between text-muted-foreground border-dashed active:scale-100"
                disabled={isLoading}
              >
                <span>Select Project...</span>
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 max-h-[300px] overflow-y-auto p-1" align="start">
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider px-2 py-1.5">
                Projects
              </DropdownMenuLabel>

              {projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => switchProject(project.id)}
                  className="gap-3 p-2 group cursor-pointer focus:bg-canopy-accent/10"
                >
                  {renderIcon(project.emoji || "🌲", project.color, "h-8 w-8 text-base")}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-medium truncate">{project.name}</span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {project.path.split(/[/\\]/).pop()}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={addProject}
                className="gap-3 p-2 cursor-pointer text-muted-foreground focus:text-foreground"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20">
                  <Plus className="h-4 w-4" />
                </div>
                <span className="font-medium">Add Project...</span>
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
          className="w-full justify-start text-muted-foreground border-dashed h-10 active:scale-100"
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
            // active:scale-100 prevents the "loud shift" (shrink animation) on click
            className="w-full justify-between px-2 h-14 hover:bg-canopy-bg/50 group transition-all duration-200 active:scale-100"
            disabled={isLoading}
          >
            <div className="flex items-center gap-3 text-left min-w-0">
              {renderIcon(
                currentProject.emoji || "🌲",
                currentProject.color,
                "h-9 w-9 text-xl shadow-md"
              )}

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

        {/* Added max-h and overflow to prevent layout jumps if list is long */}
        <DropdownMenuContent
          className="w-[260px] max-h-[60vh] overflow-y-auto p-1"
          align="start"
          sideOffset={8}
        >
          <DropdownMenuLabel className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest px-2 py-1.5">
            Switch Project
          </DropdownMenuLabel>

          {projects.map((project) => {
            const isActive = project.id === currentProject.id;
            return (
              <DropdownMenuItem
                key={project.id}
                onClick={() => {
                  if (!isActive && !isLoading) {
                    switchProject(project.id);
                  }
                }}
                disabled={isLoading}
                className={cn(
                  "gap-3 p-2 cursor-pointer mb-0.5 rounded-md transition-colors",
                  isActive ? "bg-accent/50" : "focus:bg-accent/30"
                )}
              >
                {renderIcon(project.emoji || "🌲", project.color, "h-8 w-8 text-base")}

                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className={cn(
                      "truncate text-sm font-medium",
                      isActive ? "text-foreground" : "text-foreground/80"
                    )}
                  >
                    {project.name}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground/70">
                    {project.path.split(/[/\\]/).pop()}
                  </span>
                </div>

                {project.isFallbackIdentity ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-canopy-accent hover:bg-canopy-accent/10"
                    onClick={(e) => handleRegenerate(e, project.id)}
                    disabled={regeneratingId === project.id}
                    title="Regenerate Icon & Name"
                  >
                    {regeneratingId === project.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                  </Button>
                ) : (
                  isActive && <Check className="h-4 w-4 text-canopy-accent ml-2" />
                )}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator className="my-1 bg-border/40" />

          <DropdownMenuItem
            onClick={addProject}
            className="gap-3 p-2 cursor-pointer focus:bg-accent/30"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 text-muted-foreground">
              <Plus className="h-4 w-4" />
            </div>
            <span className="font-medium text-sm text-muted-foreground">Add Project...</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
