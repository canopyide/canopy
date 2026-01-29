import { useCallback } from "react";
import { Settings, Bot, Sparkles, FileCode, GitBranch, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { actionService } from "@/services/ActionService";

interface EmptyStateProps {
  className?: string;
  onSendMessage?: (message: string) => void;
}

const SUGGESTED_PROMPTS = [
  {
    id: "codebase-structure",
    icon: FileCode,
    text: "Explain this codebase structure",
    message: "Can you help me understand the structure of this codebase?",
  },
  {
    id: "review-changes",
    icon: GitBranch,
    text: "Review my recent changes",
    message: "Can you review my recent code changes and provide feedback?",
  },
  {
    id: "debug-terminal",
    icon: Terminal,
    text: "Debug this terminal output",
    message: "I'm seeing an error in my terminal. Can you help me debug it?",
  },
  {
    id: "suggest-improvements",
    icon: Sparkles,
    text: "Suggest improvements",
    message: "What improvements would you suggest for my current code?",
  },
];

export function EmptyState({ className, onSendMessage }: EmptyStateProps) {
  const handleOpenSettings = useCallback(async () => {
    try {
      await actionService.dispatch("app.settings.openTab", { tab: "assistant" });
    } catch (error) {
      console.error("Failed to open settings:", error);
    }
  }, []);

  const handlePromptClick = useCallback(
    (message: string) => {
      onSendMessage?.(message);
    },
    [onSendMessage]
  );

  return (
    <div className={cn("flex-1 flex items-center justify-center p-8", className)}>
      <div className="text-center max-w-lg">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-canopy-accent/20 to-blue-500/20 mb-6">
          <Bot className="w-8 h-8 text-canopy-accent" />
        </div>

        <h3 className="text-xl font-semibold text-canopy-text mb-2">Configure Canopy Assistant</h3>

        <p className="text-sm text-canopy-text/60 mb-8 leading-relaxed">
          Set up your Fireworks API key to start chatting with Canopy Assistant. Get help with
          coding questions, project navigation, debugging, and more.
        </p>

        <button
          type="button"
          onClick={handleOpenSettings}
          className={cn(
            "inline-flex items-center gap-2 px-5 py-2.5",
            "bg-canopy-accent text-white text-sm font-medium",
            "rounded-lg",
            "hover:bg-canopy-accent/90 transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-canopy-accent/50 focus:ring-offset-2 focus:ring-offset-canopy-bg",
            "shadow-lg shadow-canopy-accent/20"
          )}
        >
          <Settings className="w-4 h-4" />
          Open Settings
        </button>

        {onSendMessage && (
          <div className="mt-8 pt-8 border-t border-canopy-border/50">
            <p className="text-xs text-canopy-text/50 mb-4 uppercase tracking-wide font-semibold">
              Try asking about
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTED_PROMPTS.map((prompt) => {
                const Icon = prompt.icon;
                return (
                  <button
                    key={prompt.id}
                    type="button"
                    onClick={() => handlePromptClick(prompt.message)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 text-left",
                      "bg-canopy-sidebar/30 border border-canopy-border/50 rounded-lg",
                      "text-xs text-canopy-text/70",
                      "hover:bg-canopy-sidebar/50 hover:border-canopy-accent/30 hover:text-canopy-text",
                      "transition-all duration-150",
                      "focus:outline-none focus:ring-2 focus:ring-canopy-accent/50"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 text-canopy-accent/70 shrink-0" />
                    <span className="leading-tight">{prompt.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs text-canopy-text/40 mt-6">
          Press{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-canopy-sidebar/60 font-mono border border-canopy-border/40">
            ⌘⇧K
          </kbd>{" "}
          to focus this panel
        </p>
      </div>
    </div>
  );
}
