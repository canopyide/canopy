import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Search, X, Bot, Sparkles, Terminal } from "lucide-react";
import type { AgentSession } from "@shared/types";

const AGENT_TYPE_OPTIONS: Array<{
  type: AgentSession["agentType"];
  label: string;
  color: string;
  icon: typeof Bot;
}> = [
  {
    type: "claude",
    label: "Claude",
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    icon: Bot,
  },
  {
    type: "gemini",
    label: "Gemini",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: Sparkles,
  },
  {
    type: "codex",
    label: "Codex",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    icon: Terminal,
  },
  {
    type: "custom",
    label: "Custom",
    color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    icon: Bot,
  },
];

interface SessionFiltersProps {
  searchQuery: string;
  agentType?: AgentSession["agentType"];
  onSearchChange: (query: string) => void;
  onAgentTypeChange: (type: AgentSession["agentType"] | undefined) => void;
  className?: string;
}

export function SessionFilters({
  searchQuery,
  agentType,
  onSearchChange,
  onAgentTypeChange,
  className,
}: SessionFiltersProps) {
  const [searchInput, setSearchInput] = useState(searchQuery);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    onSearchChange(value);
  };

  const clearSearch = () => {
    setSearchInput("");
    onSearchChange("");
  };

  const toggleAgentType = (type: AgentSession["agentType"]) => {
    onAgentTypeChange(agentType === type ? undefined : type);
  };

  return (
    <div className={cn("flex-shrink-0 border-b bg-background", className)}>
      <div className="p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search transcripts..."
            className={cn(
              "w-full pl-9 pr-9 py-2 text-sm rounded-md",
              "bg-muted/50 border border-transparent",
              "focus:bg-background focus:border-primary focus:outline-none",
              "placeholder:text-muted-foreground"
            )}
          />
          {searchInput && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={clearSearch}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {AGENT_TYPE_OPTIONS.map((option) => {
            const isActive = agentType === option.type;
            const Icon = option.icon;

            return (
              <Button
                key={option.type}
                variant="outline"
                size="xs"
                onClick={() => toggleAgentType(option.type)}
                className={cn(
                  "gap-1",
                  isActive
                    ? option.color
                    : "bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/50"
                )}
              >
                <Icon className="w-3 h-3" />
                <span>{option.label}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
