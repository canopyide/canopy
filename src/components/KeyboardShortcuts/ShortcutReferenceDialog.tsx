import { useState, useMemo, useEffect, useRef } from "react";
import { keybindingService } from "../../services/KeybindingService";
import type { KeybindingConfig } from "../../services/KeybindingService";

interface ShortcutReferenceDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutReferenceDialog({ isOpen, onClose }: ShortcutReferenceDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const allBindings = useMemo(() => keybindingService.getAllBindings(), []);

  const groupedBindings = useMemo(() => {
    const groups: Record<string, KeybindingConfig[]> = {};

    allBindings.forEach((binding) => {
      const category = binding.category || "Other";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(binding);
    });

    return groups;
  }, [allBindings]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedBindings;

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, KeybindingConfig[]> = {};

    Object.entries(groupedBindings).forEach(([category, bindings]) => {
      const matchingBindings = bindings.filter((binding) => {
        const displayCombo = keybindingService.getDisplayCombo(binding.actionId).toLowerCase();
        return (
          binding.description?.toLowerCase().includes(query) ||
          binding.actionId.toLowerCase().includes(query) ||
          binding.combo.toLowerCase().includes(query) ||
          displayCombo.includes(query)
        );
      });

      if (matchingBindings.length > 0) {
        filtered[category] = matchingBindings;
      }
    });

    return filtered;
  }, [groupedBindings, searchQuery]);

  const categoryOrder = [
    "Terminal",
    "Agents",
    "Worktrees",
    "Panels",
    "Navigation",
    "Help",
    "System",
    "Other",
  ];

  const sortedCategories = useMemo(() => {
    const categories = Object.keys(filteredGroups);
    return categories.sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a);
      const bIndex = categoryOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [filteredGroups]);

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-dialog-title"
        className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 id="shortcuts-dialog-title" className="text-2xl font-semibold text-gray-100">
              Keyboard Shortcuts
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {sortedCategories.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No shortcuts found matching "{searchQuery}"
            </div>
          ) : (
            <div className="space-y-8">
              {sortedCategories.map((category) => (
                <div key={category}>
                  <h3 className="text-lg font-semibold text-gray-300 mb-3 pb-2 border-b border-gray-700">
                    {category}
                  </h3>
                  <div className="space-y-2">
                    {filteredGroups[category].map((binding) => (
                      <div
                        key={binding.actionId}
                        className="flex items-center justify-between py-2 px-3 rounded hover:bg-gray-800/50"
                      >
                        <div className="flex-1">
                          <div className="text-gray-200 font-medium">{binding.description}</div>
                          {binding.scope !== "global" && (
                            <div className="text-xs text-gray-500 mt-1">
                              Scope: {binding.scope}
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <kbd className="px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm font-mono text-gray-300 shadow-sm">
                            {keybindingService.getDisplayCombo(binding.actionId)}
                          </kbd>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700 bg-gray-800/50">
          <div className="text-sm text-gray-400 text-center">
            Press <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">Esc</kbd> to close
          </div>
        </div>
      </div>
    </div>
  );
}
