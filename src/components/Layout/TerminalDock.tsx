import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Plus, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBrandColorHex } from "@/lib/colorUtils";
import { useTerminalStore, useProjectStore } from "@/store";
import type { AddTerminalOptions } from "@/store/terminalStore";
import { DockedTerminalItem } from "./DockedTerminalItem";
import { TrashContainer } from "./TrashContainer";
import { SortableDockItem } from "@/components/DragDrop";
import { ClaudeIcon, GeminiIcon, CodexIcon } from "@/components/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAgentLauncher } from "@/hooks/useAgentLauncher";
import { useWorktrees } from "@/hooks/useWorktrees";
import { generateClaudeFlags, generateGeminiFlags, generateCodexFlags } from "@shared/types";
import type { TerminalType } from "@/types";

type AgentOptionType = "claude" | "gemini" | "codex" | "shell";

const AGENT_OPTIONS = [
  { type: "claude" as const, label: "Claude", Icon: ClaudeIcon },
  { type: "gemini" as const, label: "Gemini", Icon: GeminiIcon },
  { type: "codex" as const, label: "Codex", Icon: CodexIcon },
  { type: "shell" as const, label: "Shell", Icon: Terminal },
];

const LAST_DOCKED_TYPE_KEY = "canopy_last_docked_type";

function AddDockedButton() {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [lastType, setLastType] = useState<AgentOptionType>(() => {
    try {
      if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(LAST_DOCKED_TYPE_KEY) as AgentOptionType | null;
        if (stored && ["claude", "gemini", "codex", "shell"].includes(stored)) {
          return stored;
        }
      }
    } catch (error) {
      console.warn("Failed to read from localStorage:", error);
    }
    return "claude";
  });

  const { availability, agentSettings } = useAgentLauncher();
  const { worktreeMap, activeId } = useWorktrees();
  const currentProject = useProjectStore((state) => state.currentProject);
  const addTerminal = useTerminalStore((state) => state.addTerminal);

  const visibleOptions = AGENT_OPTIONS.filter((opt) => {
    if (opt.type === "shell") return true;
    if (!availability[opt.type]) return false;
    if (agentSettings?.[opt.type]?.enabled === false) return false;
    return true;
  });

  const launch = useCallback(
    async (type: AgentOptionType) => {
      try {
        const activeWorktree = activeId ? worktreeMap.get(activeId) : null;
        const cwd = activeWorktree?.path || currentProject?.path || "";

        let command: string | undefined;
        if (type !== "shell" && agentSettings) {
          let flags: string[] = [];
          switch (type) {
            case "claude":
              command = "claude";
              flags = generateClaudeFlags(agentSettings.claude);
              break;
            case "gemini":
              command = "gemini";
              flags = generateGeminiFlags(agentSettings.gemini);
              break;
            case "codex":
              command = "codex";
              flags = generateCodexFlags(agentSettings.codex);
              break;
          }
          if (flags.length > 0) {
            command = `${command} ${flags.join(" ")}`;
          }
        }

        const title = type === "shell" ? "Shell" : type.charAt(0).toUpperCase() + type.slice(1);

        const options: AddTerminalOptions = {
          type: type as TerminalType,
          title,
          cwd,
          worktreeId: activeId || undefined,
          command,
          location: "dock",
        };

        await addTerminal(options);

        setLastType(type);
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem(LAST_DOCKED_TYPE_KEY, type);
          }
        } catch (error) {
          console.warn("Failed to save last terminal type to localStorage:", error);
        }

        setIsOpen(false);
      } catch (error) {
        console.error(`Failed to launch ${type} terminal:`, error);
      }
    },
    [activeId, worktreeMap, currentProject, agentSettings, addTerminal]
  );

  const handleMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const handlePrimaryClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const typeToLaunch =
        lastType === "shell" || availability[lastType as keyof typeof availability]
          ? lastType
          : "shell";
      await launch(typeToLaunch);
    },
    [lastType, availability, launch]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " ") {
      e.preventDefault();
      setIsOpen(true);
    }
  }, []);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={handlePrimaryClick}
          onKeyDown={handleKeyDown}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={cn(
            "flex items-center justify-center w-7 h-7 rounded border transition-all",
            "text-canopy-text/60 hover:text-canopy-text",
            "hover:bg-canopy-accent/10 border-canopy-border hover:border-canopy-accent/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canopy-bg"
          )}
          title="Add docked terminal (Click to add last used, Arrow/Space to choose)"
          aria-label="Add docked terminal"
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-1 border-canopy-border bg-canopy-bg shadow-xl"
        side="top"
        sideOffset={8}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex flex-col gap-0.5">
          {visibleOptions.map((opt) => {
            const brandColor = opt.type !== "shell" ? getBrandColorHex(opt.type) : undefined;
            const isDefault = opt.type === lastType;

            return (
              <button
                key={opt.type}
                onClick={() => launch(opt.type)}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded transition-colors",
                  "text-[11px] text-canopy-text/80 hover:text-canopy-text hover:bg-white/10",
                  isDefault && "bg-white/5"
                )}
              >
                {opt.type === "shell" ? (
                  <Terminal className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <opt.Icon className="w-3 h-3" brandColor={brandColor} aria-hidden="true" />
                )}
                <span>{opt.label}</span>
                {isDefault && (
                  <span className="ml-auto text-[9px] text-canopy-text/40">default</span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TerminalDock() {
  const dockTerminals = useTerminalStore(
    useShallow((state) => state.terminals.filter((t) => t.location === "dock"))
  );

  const trashedTerminals = useTerminalStore(useShallow((state) => state.trashedTerminals));
  const terminals = useTerminalStore((state) => state.terminals);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Make the dock terminals area droppable
  const { setNodeRef: setDockDropRef, isOver } = useDroppable({
    id: "dock-container",
    data: { container: "dock" },
  });

  const handleScroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const trashedItems = Array.from(trashedTerminals.values())
    .map((trashed) => ({
      terminal: terminals.find((t) => t.id === trashed.id),
      trashedInfo: trashed,
    }))
    .filter((item) => item.terminal !== undefined) as {
    terminal: (typeof terminals)[0];
    trashedInfo: typeof trashedTerminals extends Map<string, infer V> ? V : never;
  }[];

  const activeDockTerminals = dockTerminals;

  // Terminal IDs for SortableContext
  const terminalIds = useMemo(() => activeDockTerminals.map((t) => t.id), [activeDockTerminals]);

  return (
    <div
      className={cn(
        "bg-canopy-bg/95 backdrop-blur-sm border-t-2 border-canopy-border/60 shadow-[0_-4px_12px_rgba(0,0,0,0.3)]",
        "flex items-center px-2 py-2 gap-2",
        "z-40 shrink-0"
      )}
      role="list"
    >
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {/* Left Scroll Chevron */}
        <button
          onClick={() => handleScroll("left")}
          disabled={activeDockTerminals.length === 0}
          className="p-1 text-canopy-text/40 hover:text-canopy-text hover:bg-white/10 rounded transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-canopy-text/40 disabled:hover:bg-transparent"
          aria-label="Scroll left"
          title="Scroll left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Scrollable Container */}
        <div
          ref={(node) => {
            scrollContainerRef.current = node;
            setDockDropRef(node);
          }}
          className={cn(
            "flex items-center gap-2 overflow-x-auto flex-1 no-scrollbar scroll-smooth px-1",
            isOver && "bg-white/[0.03] ring-2 ring-canopy-accent/30 ring-inset rounded"
          )}
        >
          <SortableContext
            id="dock-container"
            items={terminalIds}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex items-center gap-2">
              {activeDockTerminals.map((terminal, index) => (
                <SortableDockItem key={terminal.id} terminal={terminal} sourceIndex={index}>
                  <DockedTerminalItem terminal={terminal} />
                </SortableDockItem>
              ))}
            </div>
          </SortableContext>

          {/* Add Docked Terminal Button */}
          <AddDockedButton />
        </div>

        {/* Right Scroll Chevron */}
        <button
          onClick={() => handleScroll("right")}
          disabled={activeDockTerminals.length === 0}
          className="p-1 text-canopy-text/40 hover:text-canopy-text hover:bg-white/10 rounded transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-canopy-text/40 disabled:hover:bg-transparent"
          aria-label="Scroll right"
          title="Scroll right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Separator between sections - only show if both have content */}
      {activeDockTerminals.length > 0 && trashedItems.length > 0 && (
        <div className="w-px h-5 bg-canopy-border mx-1 shrink-0" />
      )}

      <div className="shrink-0 pl-1">
        <TrashContainer trashedTerminals={trashedItems} />
      </div>
    </div>
  );
}
