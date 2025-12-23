import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Fuse, { type IFuseOptions } from "fuse.js";
import { useTerminalStore } from "@/store";
import { useWorktrees } from "./useWorktrees";
import {
  getRegisteredPanelKinds,
  hasPanelComponent,
} from "@/registry/panelComponentRegistry";
import {
  getPanelKindConfig,
  panelKindHasPty,
  getDefaultPanelTitle,
} from "@shared/config/panelKindRegistry";
import type { PanelKind } from "@/types";

export interface PanelKindOption {
  kind: PanelKind;
  name: string;
  iconId: string;
  color: string;
  description?: string;
}

export interface UsePanelPaletteReturn {
  isOpen: boolean;
  query: string;
  results: PanelKindOption[];
  selectedIndex: number;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  selectPrevious: () => void;
  selectNext: () => void;
  launchPanel: (kind: PanelKind) => void;
  confirmSelection: () => void;
}

const FUSE_OPTIONS: IFuseOptions<PanelKindOption> = {
  keys: [
    { name: "name", weight: 2 },
    { name: "kind", weight: 1 },
    { name: "description", weight: 0.5 },
  ],
  threshold: 0.4,
  includeScore: true,
};

const MAX_RESULTS = 8;
const DEBOUNCE_MS = 150;

export function usePanelPalette(): UsePanelPaletteReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const addTerminal = useTerminalStore((state) => state.addTerminal);
  const { activeWorktree } = useWorktrees();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const availablePanelKinds = useMemo<PanelKindOption[]>(() => {
    const registeredKinds = getRegisteredPanelKinds();

    return registeredKinds
      .filter((kind) => {
        if (!hasPanelComponent(kind)) return false;
        if (panelKindHasPty(kind)) return false;
        return true;
      })
      .map((kind) => {
        const config = getPanelKindConfig(kind);
        return {
          kind,
          name: config?.name ?? getDefaultPanelTitle(kind),
          iconId: config?.iconId ?? "square",
          color: config?.color ?? "#6b7280",
          description: kind === "notes" ? "Markdown scratchpad" : kind === "git-activity" ? "Commit timeline" : undefined,
        };
      });
  }, []);

  const fuse = useMemo(() => {
    return new Fuse(availablePanelKinds, FUSE_OPTIONS);
  }, [availablePanelKinds]);

  const results = useMemo<PanelKindOption[]>(() => {
    if (!debouncedQuery.trim()) {
      return availablePanelKinds.slice(0, MAX_RESULTS);
    }

    const fuseResults = fuse.search(debouncedQuery);
    return fuseResults.slice(0, MAX_RESULTS).map((r) => r.item);
  }, [debouncedQuery, availablePanelKinds, fuse]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const open = useCallback(() => {
    setIsOpen(true);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  const selectPrevious = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
  }, [results.length]);

  const selectNext = useCallback(() => {
    setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
  }, [results.length]);

  const launchPanel = useCallback(
    (kind: PanelKind) => {
      const cwd = activeWorktree?.path ?? process.cwd();
      const worktreeId = activeWorktree?.id;

      addTerminal({
        kind,
        cwd,
        worktreeId,
        location: "grid",
      });

      close();
    },
    [activeWorktree, addTerminal, close]
  );

  const confirmSelection = useCallback(() => {
    if (results[selectedIndex]) {
      launchPanel(results[selectedIndex].kind);
    }
  }, [results, selectedIndex, launchPanel]);

  return {
    isOpen,
    query,
    results,
    selectedIndex,
    open,
    close,
    toggle,
    setQuery,
    selectPrevious,
    selectNext,
    launchPanel,
    confirmSelection,
  };
}
