import { useState, useMemo, useEffect, useRef } from "react";
import Fuse, { type IFuseOptions } from "fuse.js";
import { AppDialog } from "@/components/ui/AppDialog";
import { useOverlayState } from "@/hooks";
import { keybindingService } from "../../services/KeybindingService";
import type { KeybindingConfig } from "../../services/KeybindingService";

interface ShortcutReferenceDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutSearchItem extends KeybindingConfig {
  effectiveCombo: string;
  displayCombo: string;
  normalizedCombo: string;
  keywords?: string[];
}

const MODIFIER_MAP: Record<string, string> = {
  cmd: "cmd",
  command: "cmd",
  meta: "cmd",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
  "⌘": "cmd",
  "⌃": "ctrl",
  "⌥": "alt",
  "⇧": "shift",
};

function normalizeChordQuery(query: string): string {
  let normalized = query.toLowerCase().trim();
  normalized = normalized.replace(/\s*\+\s*/g, "+").replace(/\s+/g, "+");

  // Replace unicode symbols with text equivalents
  for (const [symbol, text] of Object.entries(MODIFIER_MAP)) {
    if (symbol !== text) {
      normalized = normalized.replace(new RegExp(symbol, "g"), text);
    }
  }

  return normalized;
}

function isChordPrefix(query: string): boolean {
  const normalized = normalizeChordQuery(query);

  // Check if it starts with a modifier symbol or text
  const modifierMatch = Object.values(MODIFIER_MAP).find((m) => normalized.startsWith(m));
  if (!modifierMatch) return false;

  // Must have more than just the modifier
  if (normalized.length <= modifierMatch.length) return false;

  // Split by + and check we have at least 2 parts
  const parts = normalized.split("+").filter(Boolean);
  if (parts.length >= 2) {
    // All parts should be valid: either a modifier or a non-empty key
    return parts.every((p) => Object.values(MODIFIER_MAP).includes(p) || p.length > 0);
  }

  // Handle cases without separator (e.g., "cmdk" or "⌘k")
  // If there's content after the modifier, it's a valid prefix query
  const remaining = normalized.slice(modifierMatch.length);
  return remaining.length > 0;
}

export function ShortcutReferenceDialog({ isOpen, onClose }: ShortcutReferenceDialogProps) {
  useOverlayState(isOpen);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const allBindings = useMemo(() => keybindingService.getAllBindingsWithEffectiveCombos(), []);

  const searchItems = useMemo<ShortcutSearchItem[]>(() => {
    return allBindings.map((binding) => {
      const displayCombo = keybindingService.getDisplayCombo(binding.actionId);
      let normalizedCombo = displayCombo.toLowerCase().replace(/[\s+]+/g, "");
      for (const [symbol, text] of Object.entries(MODIFIER_MAP)) {
        normalizedCombo = normalizedCombo.replace(new RegExp(symbol, "g"), text);
      }
      return {
        ...binding,
        effectiveCombo: binding.effectiveCombo,
        displayCombo,
        normalizedCombo,
        keywords: [],
      };
    });
  }, [allBindings]);

  const fuseOptions: IFuseOptions<ShortcutSearchItem> = useMemo(
    () => ({
      keys: [
        { name: "description", weight: 2.0 },
        { name: "keywords", weight: 1.5 },
        { name: "actionId", weight: 1.0 },
        { name: "category", weight: 0.5 },
        { name: "normalizedCombo", weight: 0.3 },
      ],
      threshold: 0.4,
      includeScore: true,
      ignoreLocation: true,
    }),
    []
  );

  const fuse = useMemo(() => new Fuse(searchItems, fuseOptions), [searchItems, fuseOptions]);

  const filteredBindings = useMemo(() => {
    if (!searchQuery.trim()) {
      return searchItems;
    }

    const normalizedQuery = normalizeChordQuery(searchQuery);

    if (isChordPrefix(searchQuery)) {
      const queryPrefix = normalizedQuery.replace(/\+/g, "");
      return searchItems.filter((item) => {
        return item.normalizedCombo.startsWith(queryPrefix);
      });
    }

    const results = fuse.search(normalizedQuery);
    return results.map((result) => result.item);
  }, [searchItems, fuse, searchQuery]);

  const groupedBindings = useMemo(() => {
    const groups: Record<string, ShortcutSearchItem[]> = {};

    filteredBindings.forEach((binding) => {
      const category = binding.category || "Other";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(binding);
    });

    return groups;
  }, [filteredBindings]);

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
    const categories = Object.keys(groupedBindings);
    return categories.sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a);
      const bIndex = categoryOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [groupedBindings]);

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <AppDialog isOpen={isOpen} onClose={onClose} size="lg">
      <AppDialog.Header className="flex-col items-stretch gap-4">
        <div className="flex items-center justify-between">
          <AppDialog.Title className="text-2xl">Keyboard Shortcuts</AppDialog.Title>
          <AppDialog.CloseButton />
        </div>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search shortcuts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 bg-daintree-bg border border-daintree-border rounded-[var(--radius-md)] text-daintree-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-daintree-accent"
        />
      </AppDialog.Header>

      <AppDialog.Body>
        {sortedCategories.length === 0 ? (
          <div className="text-center text-daintree-text/60 py-8">
            No shortcuts found matching "{searchQuery}"
          </div>
        ) : (
          <div className="space-y-8">
            {sortedCategories.map((category) => (
              <div key={category}>
                <h3 className="text-lg font-semibold text-daintree-text mb-3 pb-2 border-b border-daintree-border">
                  {category}
                </h3>
                <div className="space-y-2">
                  {groupedBindings[category]!.map((binding) => (
                    <div
                      key={binding.actionId}
                      className="flex items-center justify-between py-2 px-3 rounded hover:bg-daintree-border/50"
                    >
                      <div className="flex-1">
                        <div className="text-daintree-text font-medium">{binding.description}</div>
                        {binding.scope !== "global" && (
                          <div className="text-xs text-daintree-text/60 mt-1">
                            Scope: {binding.scope}
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <kbd className="px-3 py-1.5 bg-daintree-bg border border-daintree-border rounded text-sm font-mono text-daintree-text shadow-[var(--theme-shadow-ambient)]">
                          {binding.displayCombo}
                        </kbd>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </AppDialog.Body>

      <AppDialog.Footer className="justify-center bg-daintree-bg/50">
        <div className="text-sm text-daintree-text/60">
          Press <kbd className="px-2 py-1 bg-daintree-border rounded text-xs">Esc</kbd> to close
        </div>
      </AppDialog.Footer>
    </AppDialog>
  );
}
