import { useState, useCallback, useMemo } from "react";
import type { FileTreeNode } from "@shared/types";
import { copyTreeClient } from "@/clients";

export interface FileTreeSelection {
  [path: string]: boolean | undefined;
}

export interface UseFileTreeOptions {
  worktreeId: string;
  initialSelection?: string[];
}

export interface UseFileTreeResult {
  nodes: FileTreeNode[];
  expanded: Set<string>;
  selection: FileTreeSelection;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  loadTree: () => Promise<void>;
  toggleExpand: (path: string) => Promise<void>;
  toggleSelection: (node: FileTreeNode) => void;
  setSearchQuery: (query: string) => void;
  getSelectedPaths: () => string[];
  clearSelection: () => void;
}
export function useFileTree(options: UseFileTreeOptions): UseFileTreeResult {
  const { worktreeId, initialSelection = [] } = options;

  const [nodes, setNodes] = useState<FileTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<FileTreeSelection>(() => {
    const initial: FileTreeSelection = {};
    for (const path of initialSelection) {
      initial[path] = true;
    }
    return initial;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTreeForPath = useCallback(
    async (dirPath?: string): Promise<FileTreeNode[]> => {
      try {
        const result = await copyTreeClient.getFileTree(worktreeId, dirPath);
        return result;
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    },
    [worktreeId]
  );

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

  const toggleExpand = useCallback(
    async (path: string) => {
      const isExpanded = expanded.has(path);

      if (isExpanded) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      } else {
        setExpanded((prev) => new Set(prev).add(path));

        const findAndLoadNode = (nodes: FileTreeNode[]): FileTreeNode[] => {
          return nodes.map((node) => {
            if (node.path === path && node.isDirectory && !node.children) {
              loadTreeForPath(node.path)
                .then((children) => {
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

  const toggleSelection = useCallback((node: FileTreeNode) => {
    setSelection((prev) => {
      const next = { ...prev };
      const currentState = prev[node.path];

      const newState = currentState !== true;

      next[node.path] = newState;

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

  const getSelectedPaths = useCallback(() => {
    return Object.entries(selection)
      .filter(([, selected]) => selected === true)
      .map(([path]) => path);
  }, [selection]);

  const clearSelection = useCallback(() => {
    setSelection({});
  }, []);
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) {
      return nodes;
    }

    const query = searchQuery.toLowerCase();

    const filterTree = (nodeList: FileTreeNode[]): FileTreeNode[] => {
      const results: FileTreeNode[] = [];
      for (const node of nodeList) {
        const nameMatches = node.name.toLowerCase().includes(query);
        const childrenMatch = node.children ? filterTree(node.children) : [];

        if (nameMatches || childrenMatch.length > 0) {
          results.push({
            ...node,
            children: childrenMatch.length > 0 ? childrenMatch : node.children,
          });
        }
      }
      return results;
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
