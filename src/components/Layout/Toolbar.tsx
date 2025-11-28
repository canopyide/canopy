import { Button } from '@/components/ui/button'
import { RefreshCw, Settings, Terminal, Bot, Sparkles, Plus } from 'lucide-react'

interface ToolbarProps {
  onLaunchAgent: (type: 'claude' | 'gemini' | 'shell') => void
  onRefresh: () => void
  onSettings: () => void
}

export function Toolbar({ onLaunchAgent, onRefresh, onSettings }: ToolbarProps) {
  return (
    <header className="h-12 flex items-center px-4 border-b border-canopy-border bg-canopy-sidebar drag-region shrink-0">
      {/* Space for traffic lights on macOS */}
      <div className="w-20 shrink-0" />

      {/* Agent launcher buttons */}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onLaunchAgent('claude')}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent"
        >
          <Bot className="h-4 w-4" />
          <span>Claude</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onLaunchAgent('gemini')}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent"
        >
          <Sparkles className="h-4 w-4" />
          <span>Gemini</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onLaunchAgent('shell')}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent"
        >
          <Terminal className="h-4 w-4" />
          <span>Shell</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
          aria-label="Add new terminal"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Title - centered */}
      <div className="flex-1 flex justify-center">
        <span className="text-canopy-text font-semibold text-sm">
          Canopy Command Center
        </span>
      </div>

      {/* Right side actions */}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettings}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
          aria-label="Open settings"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          className="text-canopy-text hover:bg-canopy-border hover:text-canopy-accent h-8 w-8"
          aria-label="Refresh worktrees"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </header>
  )
}
