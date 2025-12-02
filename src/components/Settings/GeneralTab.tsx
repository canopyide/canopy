import { useState } from "react";
import { ChevronDown, ChevronRight, TreePine } from "lucide-react";

interface GeneralTabProps {
  appVersion: string;
}

const KEYBOARD_SHORTCUTS = [
  {
    category: "Agents",
    shortcuts: [
      { key: "Ctrl+Shift+C", description: "Start Claude agent" },
      { key: "Ctrl+Shift+G", description: "Start Gemini agent" },
      { key: "Ctrl+Shift+I", description: "Inject context to agent" },
      { key: "Cmd+T", description: "Open agent palette" },
    ],
  },
  {
    category: "Navigation",
    shortcuts: [
      { key: "Ctrl+Tab", description: "Focus next agent or shell" },
      { key: "Ctrl+Shift+Tab", description: "Focus previous agent or shell" },
      { key: "Ctrl+Shift+F", description: "Toggle maximize focused tile" },
    ],
  },
  {
    category: "Panels",
    shortcuts: [
      { key: "Ctrl+Shift+L", description: "Toggle logs panel" },
      { key: "Ctrl+Shift+E", description: "Toggle event inspector" },
    ],
  },
  {
    category: "Other",
    shortcuts: [
      { key: "Cmd+K Z", description: "Toggle focus mode (chord: press Cmd+K, release, then Z)" },
    ],
  },
];

const formatKey = (key: string): string => {
  const isMac = window.navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  if (isMac) {
    return key
      .replace(/Cmd\+/g, "⌘")
      .replace(/Ctrl\+/g, "⌃")
      .replace(/Shift\+/g, "⇧")
      .replace(/Alt\+/g, "⌥");
  }

  return key.replace(/Cmd\+/g, "Ctrl+");
};

export function GeneralTab({ appVersion }: GeneralTabProps) {
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-canopy-text">About</h4>
        <div className="bg-canopy-bg border border-canopy-border rounded-md p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 bg-canopy-accent/20 rounded-lg flex items-center justify-center">
              <TreePine className="w-6 h-6 text-canopy-accent" />
            </div>
            <div>
              <div className="font-semibold text-canopy-text text-lg">Canopy</div>
              <div className="text-sm text-gray-400">Command Center</div>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Version</span>
              <span className="font-mono text-canopy-text">{appVersion}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-canopy-text">Description</h4>
        <p className="text-sm text-gray-400">
          An orchestration board for AI coding agents. Start agents on worktrees, monitor their
          progress, and inject context to help them understand your codebase.
        </p>
      </div>

      <div className="border border-canopy-border rounded-md">
        <button
          type="button"
          onClick={() => setIsShortcutsOpen(!isShortcutsOpen)}
          aria-expanded={isShortcutsOpen}
          aria-controls="keyboard-shortcuts-content"
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-canopy-text transition-colors"
        >
          {isShortcutsOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span>Keyboard Shortcuts</span>
        </button>

        {isShortcutsOpen && (
          <div
            id="keyboard-shortcuts-content"
            className="px-3 pb-3 space-y-4 border-t border-canopy-border pt-3"
          >
            {KEYBOARD_SHORTCUTS.map((category) => (
              <div key={category.category} className="space-y-2">
                <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  {category.category}
                </h5>
                <dl className="space-y-1">
                  {category.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.key}
                      className="flex items-center justify-between text-sm py-1"
                    >
                      <dt className="text-gray-300">{shortcut.description}</dt>
                      <dd>
                        <kbd className="px-2 py-1 bg-canopy-bg border border-canopy-border rounded text-xs font-mono text-canopy-text">
                          {formatKey(shortcut.key)}
                        </kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
