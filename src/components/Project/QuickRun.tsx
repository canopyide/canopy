import { useState, useEffect, useMemo, useRef } from "react";
import { Play, ChevronDown, ChevronRight, Terminal, Clock, Dock, Zap } from "lucide-react";
import { useProjectSettings } from "@/hooks/useProjectSettings";
import { useTerminalStore } from "@/store/terminalStore";
import { useWorktreeSelectionStore } from "@/store/worktreeStore";
import { useWorktrees } from "@/hooks/useWorktrees";
import { cn } from "@/lib/utils";
import { detectTerminalTypeFromCommand } from "@/utils/terminalType";

interface QuickRunProps {
  projectId: string;
}

interface HistoryItem {
  command: string;
  timestamp: number;
}

const HISTORY_KEY_PREFIX = "canopy_cmd_history_";
const MAX_HISTORY = 5;

export function QuickRun({ projectId }: QuickRunProps) {
  const { detectedRunners } = useProjectSettings(projectId);
  const addTerminal = useTerminalStore((state) => state.addTerminal);
  const activeWorktreeId = useWorktreeSelectionStore((state) => state.activeWorktreeId);
  const { worktreeMap } = useWorktrees();

  const [isExpanded, setIsExpanded] = useState(true);
  const [input, setInput] = useState("");
  const [runAsDocked, setRunAsDocked] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(`${HISTORY_KEY_PREFIX}${projectId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (item) => typeof item === "object" && "command" in item && "timestamp" in item
          )
        ) {
          setHistory(parsed);
        } else {
          console.warn("Invalid history format, resetting");
          localStorage.removeItem(`${HISTORY_KEY_PREFIX}${projectId}`);
        }
      } catch (e) {
        console.error("Failed to parse command history", e);
        localStorage.removeItem(`${HISTORY_KEY_PREFIX}${projectId}`);
      }
    }
  }, [projectId]);

  const saveHistory = (cmd: string) => {
    setHistory((prev) => {
      const newItem = { command: cmd, timestamp: Date.now() };
      const newHistory = [newItem, ...prev.filter((h) => h.command !== cmd)].slice(0, MAX_HISTORY);
      localStorage.setItem(`${HISTORY_KEY_PREFIX}${projectId}`, JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const suggestions = useMemo(() => {
    const search = input.toLowerCase().trim();

    const scriptCommands = detectedRunners.map((r) => ({
      label: r.name,
      value: r.command,
      type: "script" as const,
    }));

    const allOptions = [
      ...history.map((h) => ({ label: h.command, value: h.command, type: "history" as const })),
      ...scriptCommands,
    ];

    if (!search) return history.length > 0 ? allOptions.slice(0, 5) : scriptCommands.slice(0, 5);

    return allOptions
      .filter(
        (opt) =>
          opt.value.toLowerCase().includes(search) || opt.label.toLowerCase().includes(search)
      )
      .filter((v, i, a) => a.findIndex((t) => t.value === v.value) === i)
      .slice(0, 5);
  }, [input, detectedRunners, history]);

  const handleRun = async (cmd: string) => {
    if (!cmd.trim()) return;

    const activeWorktree = activeWorktreeId ? worktreeMap.get(activeWorktreeId) : null;
    const cwd = activeWorktree?.path;

    if (!cwd) {
      return;
    }

    saveHistory(cmd);
    setShowSuggestions(false);
    setInput("");

    try {
      const terminalType = detectTerminalTypeFromCommand(cmd);

      await addTerminal({
        type: terminalType,
        title: cmd,
        cwd: cwd,
        command: cmd,
        location: runAsDocked ? "dock" : "grid",
        worktreeId: activeWorktreeId || undefined,
      });
    } catch (error) {
      console.error("Failed to spawn terminal:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRun(input);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="border-t border-canopy-border bg-canopy-sidebar/50 shrink-0 flex flex-col min-h-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-canopy-text/60 hover:text-canopy-text hover:bg-canopy-border/30 transition-colors focus:outline-none"
      >
        <div className="flex items-center gap-2">
          <Zap className="h-3 w-3" />
          <span className="uppercase tracking-wide">Quick Run</span>
        </div>
        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {isExpanded && (
        <div className="p-3 space-y-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={handleKeyDown}
              placeholder="npm run dev..."
              disabled={!activeWorktreeId}
              className={cn(
                "w-full bg-canopy-bg border border-canopy-border rounded px-3 py-2 text-sm text-canopy-text placeholder:text-canopy-text/30 focus:outline-none focus:border-canopy-accent focus:ring-1 focus:ring-canopy-accent font-mono",
                !activeWorktreeId && "opacity-50 cursor-not-allowed"
              )}
            />

            <button
              onClick={() => handleRun(input)}
              disabled={!activeWorktreeId}
              className={cn(
                "absolute right-1.5 top-1.5 p-1 text-canopy-text/50 hover:text-canopy-accent transition-colors",
                !activeWorktreeId && "opacity-50 cursor-not-allowed"
              )}
              title={activeWorktreeId ? "Run Command" : "No active worktree"}
            >
              <Play className="h-3.5 w-3.5 fill-current" />
            </button>

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-canopy-sidebar border border-canopy-border rounded-md shadow-xl overflow-hidden z-50">
                {suggestions.map((item) => (
                  <button
                    key={item.value}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-canopy-bg transition-colors group"
                    onClick={() => {
                      setInput(item.value);
                      handleRun(item.value);
                    }}
                  >
                    {item.type === "history" ? (
                      <Clock className="h-3 w-3 text-canopy-text/40" />
                    ) : (
                      <Terminal className="h-3 w-3 text-canopy-text/40" />
                    )}
                    <span className="font-mono text-canopy-text/80 group-hover:text-canopy-text truncate">
                      {item.value}
                    </span>
                    {item.type === "script" && item.label !== item.value && (
                      <span className="ml-auto text-[10px] text-canopy-text/30">{item.label}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div
                className={cn(
                  "w-3 h-3 border rounded flex items-center justify-center transition-colors",
                  runAsDocked
                    ? "bg-canopy-accent border-canopy-accent"
                    : "border-canopy-text/30 group-hover:border-canopy-text/50"
                )}
              >
                {runAsDocked && <Dock className="h-2 w-2 text-white" />}
              </div>
              <input
                type="checkbox"
                className="hidden"
                checked={runAsDocked}
                onChange={(e) => setRunAsDocked(e.target.checked)}
              />
              <span className="text-xs text-canopy-text/60 group-hover:text-canopy-text/80 select-none">
                Run in Dock
              </span>
            </label>

            <span className="text-[10px] text-canopy-text/30">
              Active: {worktreeMap.get(activeWorktreeId || "")?.name || "None"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
