import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs } from "@/components/ui/Tabs";
import { ProjectSwitcher, ProjectRunners, ProjectSettingsDialog } from "@/components/Project";
import { useProjectStore } from "@/store/projectStore";

export type SidebarTab = "worktrees" | "history";

interface SidebarProps {
  width: number;
  onResize: (width: number) => void;
  children?: ReactNode;
  historyContent?: ReactNode;
  className?: string;
  activeTab?: SidebarTab;
  onTabChange?: (tab: SidebarTab) => void;
}

const RESIZE_STEP = 10;

export function Sidebar({
  width,
  onResize,
  children,
  historyContent,
  className,
  activeTab = "worktrees",
  onTabChange,
}: SidebarProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [internalTab, setInternalTab] = useState<SidebarTab>(activeTab);
  const sidebarRef = useRef<HTMLElement>(null);
  const currentProject = useProjectStore((state) => state.currentProject);

  useEffect(() => {
    setInternalTab(activeTab);
  }, [activeTab]);

  const currentTab = onTabChange ? activeTab : internalTab;
  const handleTabChange = useCallback(
    (tab: SidebarTab) => {
      if (onTabChange) {
        onTabChange(tab);
      } else {
        setInternalTab(tab);
      }
    },
    [onTabChange]
  );

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onResize(width - RESIZE_STEP);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onResize(width + RESIZE_STEP);
      }
    },
    [width, onResize]
  );

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing && sidebarRef.current) {
        const newWidth = e.clientX - sidebarRef.current.getBoundingClientRect().left;
        onResize(newWidth);
      }
    },
    [isResizing, onResize]
  );

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", resize);
      document.addEventListener("mouseup", stopResizing);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", resize);
      document.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <>
      <aside
        ref={sidebarRef}
        className={cn(
          "relative border-r border-canopy-border bg-canopy-sidebar shrink-0 flex flex-col",
          className
        )}
        style={{ width }}
      >
        <div className="shrink-0 border-b border-canopy-border">
          <div className="flex items-center">
            <div className="flex-1">
              <ProjectSwitcher />
            </div>
            {currentProject && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 mr-1 text-gray-400 hover:text-canopy-text hover:bg-canopy-border/50 rounded transition-colors"
                title="Project Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <Tabs
          value={currentTab}
          onChange={(tab) => handleTabChange(tab as SidebarTab)}
          options={[
            { value: "worktrees", label: "Worktrees" },
            { value: "history", label: "History" },
          ]}
          fullWidth
          className="shrink-0"
          ariaLabel="Sidebar navigation"
        />

        <div className="flex-1 overflow-y-auto min-h-0">
          {currentTab === "worktrees" ? children : historyContent}
        </div>

        {currentProject && <ProjectRunners projectId={currentProject.id} />}

        <div
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuenow={width}
          tabIndex={0}
          className={cn(
            "absolute top-0 right-0 w-1 h-full cursor-col-resize",
            "hover:bg-canopy-accent/50 transition-colors focus:outline-none focus:bg-canopy-accent",
            isResizing && "bg-canopy-accent"
          )}
          onMouseDown={startResizing}
          onKeyDown={handleKeyDown}
        />
      </aside>

      {/* Project Settings Dialog - Only mount when open to avoid duplicate hook calls */}
      {currentProject && isSettingsOpen && (
        <ProjectSettingsDialog
          projectId={currentProject.id}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </>
  );
}
