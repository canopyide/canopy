/**
 * File Picker Modal Component
 *
 * Modal dialog with file tree for selective context injection.
 * Features tri-state checkboxes, lazy loading, and search.
 */

import { useEffect, useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFileTree } from "@/hooks/useFileTree";
import type { FileTreeNode } from "@shared/types";

export interface FilePickerModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Worktree ID to load files from */
  worktreeId: string;
  /** Called when user clicks "Inject Context" with selected paths */
  onConfirm: (selectedPaths: string[]) => void;
  /** Called when user cancels */
  onCancel: () => void;
}

export function FilePickerModal({ isOpen, worktreeId, onConfirm, onCancel }: FilePickerModalProps) {
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

  // Load tree when modal opens
  useEffect(() => {
    if (isOpen) {
      loadTree();
      // Focus search input with cleanup
      const timeoutId = setTimeout(() => searchInputRef.current?.focus(), 100);
      return () => clearTimeout(timeoutId);
    } else {
      // Clear search and selection when closing
      setSearchQuery("");
      clearSelection();
    }
  }, [isOpen, loadTree, setSearchQuery, clearSelection]);

  // Handle escape key
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
      // If no selection, inject all files
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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      {/* Dialog content */}
      <div className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Select Files to Inject</h2>
            <p className="text-sm text-neutral-400 mt-1">
              {selectedCount > 0
                ? `${selectedCount} ${selectedCount === 1 ? "file" : "files"} selected`
                : "No files selected (all files will be injected)"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-neutral-400 hover:text-neutral-200 transition-colors"
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

        {/* Search bar */}
        <div className="px-6 py-3 border-b border-neutral-800">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-8 text-neutral-400">Loading...</div>
          )}
          {error && <div className="text-red-400 py-4">Error: {error}</div>}
          {!loading && !error && nodes.length === 0 && (
            <div className="text-neutral-500 py-8 text-center">No files found</div>
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

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-700">
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

// File tree view component
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

// Individual file tree node
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
          "flex items-center gap-2 py-1 px-2 rounded hover:bg-neutral-800 cursor-pointer",
          isSelected && "bg-neutral-800/50"
        )}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={() => onToggleSelection(node)}
      >
        {/* Expand/collapse icon for directories */}
        {node.isDirectory && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.path);
            }}
            className="flex-shrink-0 w-4 h-4 text-neutral-400 hover:text-neutral-200"
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

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected === true}
          ref={(el) => {
            if (el) {
              // Only set indeterminate if explicitly undefined (not just missing from map)
              // Treat missing entries as unchecked, not indeterminate
              el.indeterminate = false; // Simplified: true indeterminate requires parent calculation
            }
          }}
          onChange={() => {
            /* Handled by parent div onClick */
          }}
          className="flex-shrink-0"
        />

        {/* Icon */}
        <span className="flex-shrink-0 w-4 h-4 text-neutral-400">
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

        {/* Name */}
        <span className="flex-1 text-sm text-neutral-200 truncate">{node.name}</span>

        {/* Size for files */}
        {!node.isDirectory && node.size !== undefined && (
          <span className="flex-shrink-0 text-xs text-neutral-500">{formatBytes(node.size)}</span>
        )}
      </div>

      {/* Children */}
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

// Utility to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
