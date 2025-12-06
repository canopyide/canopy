import { useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/formatBytes";
import { useFileTree } from "@/hooks/useFileTree";
import { useOverlayState } from "@/hooks";
import type { FileTreeNode } from "@shared/types";

export interface FilePickerModalProps {
  isOpen: boolean;
  worktreeId: string;
  onConfirm: (selectedPaths: string[]) => void;
  onCancel: () => void;
}

export function FilePickerModal({ isOpen, worktreeId, onConfirm, onCancel }: FilePickerModalProps) {
  useOverlayState(isOpen);

  const {
    nodes,
    expanded,
    selection,
    searchQuery,
    loading,
    error,
    loadTree,
    toggleExpand,
    toggleSelection,
    setSearchQuery,
    getSelectedPaths,
    clearSelection,
  } = useFileTree({ worktreeId });

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadTree();
      const timeoutId = setTimeout(() => searchInputRef.current?.focus(), 100);
      return () => clearTimeout(timeoutId);
    } else {
      setSearchQuery("");
      clearSelection();
      return undefined;
    }
  }, [isOpen, loadTree, setSearchQuery, clearSelection]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [onCancel]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const handleConfirm = () => {
    const paths = getSelectedPaths();
    if (paths.length === 0) {
      onConfirm([]);
    } else {
      onConfirm(paths);
    }
  };

  if (!isOpen) return null;

  const selectedCount = getSelectedPaths().length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col bg-canopy-bg border border-canopy-border rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-canopy-border">
          <div>
            <h2 className="text-lg font-semibold text-canopy-text">Select Files to Inject</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedCount > 0
                ? `${selectedCount} ${selectedCount === 1 ? "file" : "files"} selected`
                : "No files selected (all files will be injected)"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:text-canopy-text transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-3 border-b border-canopy-border">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-canopy-sidebar border border-canopy-border rounded text-canopy-text placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-canopy-accent"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading...
            </div>
          )}
          {error && <div className="text-[var(--color-status-error)] py-4">Error: {error}</div>}
          {!loading && !error && nodes.length === 0 && (
            <div className="text-muted-foreground py-8 text-center">No files found</div>
          )}
          {!loading && !error && nodes.length > 0 && (
            <FileTreeView
              nodes={nodes}
              expanded={expanded}
              selection={selection}
              onToggleExpand={toggleExpand}
              onToggleSelection={toggleSelection}
            />
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-canopy-border">
          <Button onClick={clearSelection} variant="ghost" size="sm" disabled={selectedCount === 0}>
            Clear Selection
          </Button>
          <div className="flex gap-2">
            <Button onClick={onCancel} variant="ghost">
              Cancel
            </Button>
            <Button onClick={handleConfirm} variant="default">
              Inject Context
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FileTreeViewProps {
  nodes: FileTreeNode[];
  expanded: Set<string>;
  selection: Record<string, boolean | undefined>;
  onToggleExpand: (path: string) => void;
  onToggleSelection: (node: FileTreeNode) => void;
  level?: number;
}

function FileTreeView({
  nodes,
  expanded,
  selection,
  onToggleExpand,
  onToggleSelection,
  level = 0,
}: FileTreeViewProps) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          expanded={expanded}
          selection={selection}
          onToggleExpand={onToggleExpand}
          onToggleSelection={onToggleSelection}
          level={level}
        />
      ))}
    </div>
  );
}

interface FileTreeNodeProps {
  node: FileTreeNode;
  expanded: Set<string>;
  selection: Record<string, boolean | undefined>;
  onToggleExpand: (path: string) => void;
  onToggleSelection: (node: FileTreeNode) => void;
  level: number;
}

function FileTreeNode({
  node,
  expanded,
  selection,
  onToggleExpand,
  onToggleSelection,
  level,
}: FileTreeNodeProps) {
  const isExpanded = expanded.has(node.path);
  const isSelected = selection[node.path];
  const paddingLeft = level * 16 + 8;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-1 px-2 rounded hover:bg-canopy-sidebar cursor-pointer",
          isSelected && "bg-canopy-sidebar/50"
        )}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={() => onToggleSelection(node)}
      >
        {node.isDirectory && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.path);
            }}
            className="flex-shrink-0 w-4 h-4 text-muted-foreground hover:text-canopy-text"
          >
            <svg
              className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-90")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        {!node.isDirectory && <div className="w-4" />}

        <input
          type="checkbox"
          checked={isSelected === true}
          ref={(el) => {
            if (el) {
              el.indeterminate = false;
            }
          }}
          onChange={() => {}}
          className="flex-shrink-0"
        />

        <span className="flex-shrink-0 w-4 h-4 text-muted-foreground">
          {node.isDirectory ? (
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          ) : (
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          )}
        </span>

        <span className="flex-1 text-sm text-canopy-text truncate">{node.name}</span>

        {!node.isDirectory && node.size !== undefined && (
          <span className="flex-shrink-0 text-xs text-muted-foreground">
            {formatBytes(node.size)}
          </span>
        )}
      </div>

      {node.isDirectory && isExpanded && node.children && (
        <FileTreeView
          nodes={node.children}
          expanded={expanded}
          selection={selection}
          onToggleExpand={onToggleExpand}
          onToggleSelection={onToggleSelection}
          level={level + 1}
        />
      )}
    </div>
  );
}
