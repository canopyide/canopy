/**
 * useFileTree Hook
 *
 * Manages file tree state for the file picker modal.
 * Handles lazy loading, tri-state selection, and search filtering.
 */

import { useState, useCallback, useMemo } from "react";
import type { FileTreeNode } from "@shared/types";

export interface FileTreeSelection {
  /** Map of path -> selection state (true = selected, false = unselected, undefined = indeterminate) */
  [path: string]: boolean | undefined;
}

export interface UseFileTreeOptions {
  /** Initial worktree ID */
  worktreeId: string;
  /** Initial selected paths (optional) */
  initialSelection?: string[];
}

export interface UseFileTreeResult {
  /** Root nodes of the file tree */
  nodes: FileTreeNode[];
  /** Currently expanded directories */
  expanded: Set<string>;
  /** Selection state for all nodes */
  selection: FileTreeSelection;
  /** Search query */
  searchQuery: string;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: string | null;

  /** Load the root tree */
  loadTree: () => Promise<void>;
  /** Toggle directory expansion */
  toggleExpand: (path: string) => Promise<void>;
  /** Toggle node selection (handles tri-state for directories) */
  toggleSelection: (node: FileTreeNode) => void;
  /** Set search query */
  setSearchQuery: (query: string) => void;
  /** Get all selected paths */
  getSelectedPaths: () => string[];
  /** Clear all selections */
  clearSelection: () => void;
}

/**
 * Hook to manage file tree state
 */
export function useFileTree(options: UseFileTreeOptions): UseFileTreeResult {
  const { worktreeId, initialSelection = [] } = options;

  const [nodes, setNodes] = useState<FileTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<FileTreeSelection>(() => {
    // Initialize selection from initialSelection
    const initial: FileTreeSelection = {};
    for (const path of initialSelection) {
      initial[path] = true;
    }
    return initial;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load tree for a given directory (defaults to root)
  const loadTreeForPath = useCallback(
    async (dirPath?: string): Promise<FileTreeNode[]> => {
      try {
        const result = await window.electron.copyTree.getFileTree(worktreeId, dirPath);
        return result;
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    },
    [worktreeId]
  );

  // Load root tree
  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rootNodes = await loadTreeForPath();
      setNodes(rootNodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadTreeForPath]);

  // Toggle directory expansion (lazy load children)
  const toggleExpand = useCallback(
    async (path: string) => {
      const isExpanded = expanded.has(path);

      if (isExpanded) {
        // Collapse
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      } else {
        // Expand - lazy load children if not already loaded
        setExpanded((prev) => new Set(prev).add(path));

        // Find the node and load children if not present
        const findAndLoadNode = (nodes: FileTreeNode[]): FileTreeNode[] => {
          return nodes.map((node) => {
            if (node.path === path && node.isDirectory && !node.children) {
              // Load children
              loadTreeForPath(node.path)
                .then((children) => {
                  // Update the node with children
                  setNodes((prevNodes) => {
                    const updateNode = (nodes: FileTreeNode[]): FileTreeNode[] => {
                      return nodes.map((n) => {
                        if (n.path === path) {
                          return { ...n, children };
                        }
                        if (n.children) {
                          return { ...n, children: updateNode(n.children) };
                        }
                        return n;
                      });
                    };
                    return updateNode(prevNodes);
                  });
                })
                .catch((err) => {
                  console.error(`Failed to load children for ${path}:`, err);
                });
            } else if (node.children) {
              return { ...node, children: findAndLoadNode(node.children) };
            }
            return node;
          });
        };

        setNodes(findAndLoadNode);
      }
    },
    [expanded, loadTreeForPath]
  );

  // Toggle selection with tri-state logic
  const toggleSelection = useCallback((node: FileTreeNode) => {
    setSelection((prev) => {
      const next = { ...prev };
      const currentState = prev[node.path];

      // Toggle: undefined/false -> true, true -> false
      const newState = currentState !== true;

      // Update this node
      next[node.path] = newState;

      // If it's a directory, recursively update all children
      if (node.isDirectory && node.children) {
        const updateChildren = (children: FileTreeNode[]) => {
          for (const child of children) {
            next[child.path] = newState;
            if (child.isDirectory && child.children) {
              updateChildren(child.children);
            }
          }
        };
        updateChildren(node.children);
      }

      return next;
    });
  }, []);

  // Get all selected paths (only return paths that are explicitly true)
  const getSelectedPaths = useCallback(() => {
    return Object.entries(selection)
      .filter(([, selected]) => selected === true)
      .map(([path]) => path);
  }, [selection]);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelection({});
  }, []);

  // Filtered nodes based on search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) {
      return nodes;
    }

    const query = searchQuery.toLowerCase();

    const filterTree = (nodes: FileTreeNode[]): FileTreeNode[] => {
      return nodes
        .map((node) => {
          const nameMatches = node.name.toLowerCase().includes(query);
          const childrenMatch = node.children ? filterTree(node.children) : [];

          // Include node if name matches or has matching children
          if (nameMatches || childrenMatch.length > 0) {
            return {
              ...node,
              children: childrenMatch.length > 0 ? childrenMatch : node.children,
            };
          }

          return null;
        })
        .filter((node): node is FileTreeNode => node !== null);
    };

    return filterTree(nodes);
  }, [nodes, searchQuery]);

  return {
    nodes: filteredNodes,
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
  };
}
