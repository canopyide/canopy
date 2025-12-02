/**
 * GitHubResourceList Component
 *
 * A generic list container for displaying GitHub issues or pull requests.
 * Handles data fetching, search, pagination, and filtering by state.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, ExternalLink, RefreshCw, AlertCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { githubClient } from "@/clients/githubClient";
import { GitHubListItem } from "./GitHubListItem";
import type { GitHubIssue, GitHubPR } from "@shared/types/github";

interface GitHubResourceListProps {
  type: "issue" | "pr";
  projectPath: string;
  onClose?: () => void;
}

type IssueStateFilter = "open" | "closed" | "all";
type PRStateFilter = "open" | "closed" | "merged" | "all";
type StateFilter = IssueStateFilter | PRStateFilter;

/**
 * Debounce a function call.
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function GitHubResourceList({ type, projectPath, onClose }: GitHubResourceListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterState, setFilterState] = useState<StateFilter>("open");
  const [data, setData] = useState<(GitHubIssue | GitHubPR)[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Debounce search query
  const debouncedSearch = useDebounce(searchQuery, 300);

  // State filter tabs
  const stateTabs = useMemo(() => {
    if (type === "pr") {
      return [
        { id: "open", label: "Open" },
        { id: "closed", label: "Closed" },
        { id: "merged", label: "Merged" },
      ];
    }
    return [
      { id: "open", label: "Open" },
      { id: "closed", label: "Closed" },
    ];
  }, [type]);

  // Fetch data function
  // Note: currentCursor is passed as a parameter (not read from state) to avoid
  // dependency cycle where updating cursor would recreate this callback
  const fetchData = useCallback(
    async (
      currentCursor: string | null | undefined,
      append: boolean = false,
      abortSignal?: AbortSignal
    ) => {
      if (!projectPath) return;

      if (append) {
        setLoadingMore(true);
        setLoadMoreError(null);
      } else {
        setLoading(true);
        setError(null);
        setLoadMoreError(null);
      }

      try {
        const options = {
          cwd: projectPath,
          search: debouncedSearch || undefined,
          state: filterState as "open" | "closed" | "merged" | "all",
          cursor: currentCursor || undefined,
        };

        const result =
          type === "issue"
            ? await githubClient.listIssues(
                options as Parameters<typeof githubClient.listIssues>[0]
              )
            : await githubClient.listPullRequests(
                options as Parameters<typeof githubClient.listPullRequests>[0]
              );

        // Check if aborted before updating state
        if (abortSignal?.aborted) return;

        if (append) {
          setData((prev) => [...prev, ...result.items]);
        } else {
          setData(result.items);
        }
        setCursor(result.pageInfo.endCursor);
        setHasMore(result.pageInfo.hasNextPage);
      } catch (err) {
        if (abortSignal?.aborted) return;
        const message = err instanceof Error ? err.message : "Failed to fetch data";
        if (append) {
          setLoadMoreError(message);
        } else {
          setError(message);
        }
      } finally {
        if (!abortSignal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [projectPath, debouncedSearch, filterState, type]
  );

  // Fetch on mount and when search/filter changes
  useEffect(() => {
    const abortController = new AbortController();

    // Reset pagination when search or filter changes
    setCursor(null);
    setHasMore(false);
    fetchData(null, false, abortController.signal);

    return () => abortController.abort();
  }, [debouncedSearch, filterState, projectPath, type, fetchData]);

  // Load more handler
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchData(cursor, true, undefined);
    }
  };

  // Open in GitHub handler
  const handleOpenInGitHub = () => {
    if (type === "issue") {
      githubClient.openIssues(projectPath);
    } else {
      githubClient.openPRs(projectPath);
    }
    onClose?.();
  };

  // Create new handler
  const handleCreateNew = () => {
    // Use openIssues/openPRs with /new path would require a new IPC
    // For now, just open the GitHub page
    handleOpenInGitHub();
  };

  // Retry handler for errors
  const handleRetry = () => {
    setCursor(null);
    fetchData(null, false, undefined);
  };

  // Render loading skeleton
  // Calculate skeleton count to fill max-h-[500px] container:
  // - Container: 500px max - header (~80px) - footer (~48px) = ~372px available
  // - Each item: ~44px (16px icon + 16px title + 12px metadata + spacing)
  // - 372px / 44px ≈ 8 items to prevent layout shift
  const renderSkeleton = () => (
    <div className="space-y-3 p-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 animate-pulse">
          <div className="w-4 h-4 rounded-full bg-muted mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );

  // Render error state
  const renderError = () => (
    <div className="p-4 m-3 rounded-md bg-red-500/10 border border-red-500/20">
      <div className="flex items-center gap-2 text-red-500">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm font-medium">Error</span>
      </div>
      <p className="text-sm text-red-400 mt-1">{error}</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRetry}
        className="mt-2 text-red-400 hover:text-red-300"
      >
        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
        Retry
      </Button>
    </div>
  );

  // Render empty state
  const renderEmpty = () => (
    <div className="p-8 text-center text-muted-foreground">
      <p className="text-sm">
        No {type === "issue" ? "issues" : "pull requests"} found
        {debouncedSearch && ` for "${debouncedSearch}"`}
      </p>
    </div>
  );

  return (
    <div className="w-[450px] flex flex-col max-h-[500px]">
      {/* Header with search and filters */}
      <div className="p-3 border-b border-canopy-border space-y-3 shrink-0">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={`Search ${type === "issue" ? "issues" : "pull requests"}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={`Search ${type === "issue" ? "issues" : "pull requests"}`}
            className={cn(
              "w-full h-8 pl-8 pr-3 rounded-md text-sm",
              "bg-canopy-bg border border-canopy-border",
              "text-canopy-text placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-1 focus:ring-canopy-accent focus:border-canopy-accent",
              "transition-colors"
            )}
          />
        </div>

        {/* State filter tabs */}
        <div
          className="flex p-0.5 bg-black/20 rounded-md"
          role="group"
          aria-label="Filter by state"
        >
          {stateTabs.map((tab) => {
            const isActive = filterState === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterState(tab.id as StateFilter)}
                aria-pressed={isActive}
                className={cn(
                  "flex-1 px-3 py-1 text-xs font-medium rounded transition-colors",
                  isActive
                    ? "bg-canopy-accent/10 text-canopy-accent"
                    : "text-muted-foreground hover:text-canopy-text"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable list */}
      <div className="overflow-y-auto flex-1 min-h-0">
        {loading && !data.length ? (
          renderSkeleton()
        ) : error ? (
          renderError()
        ) : data.length === 0 ? (
          renderEmpty()
        ) : (
          <>
            <div className="divide-y divide-canopy-border">
              {data.map((item) => (
                <GitHubListItem key={item.number} item={item} type={type} />
              ))}
            </div>

            {/* Load more section with inline error handling */}
            {hasMore && (
              <div className="p-3 space-y-2">
                {loadMoreError && (
                  <div className="p-2 rounded-md bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-400">{loadMoreError}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLoadMore}
                      className="mt-1 text-red-400 hover:text-red-300 h-6 text-xs"
                    >
                      Retry
                    </Button>
                  </div>
                )}
                <Button
                  variant="ghost"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full text-muted-foreground hover:text-canopy-text"
                >
                  {loadingMore ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load More"
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-canopy-border flex items-center justify-between shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpenInGitHub}
          className="text-muted-foreground hover:text-canopy-text gap-1.5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View on GitHub
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCreateNew}
          className="text-muted-foreground hover:text-canopy-text gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>
    </div>
  );
}
