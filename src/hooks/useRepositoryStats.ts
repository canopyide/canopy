/**
 * useRepositoryStats Hook
 *
 * Provides GitHub repository statistics with adaptive polling.
 * - Active polling (30s) when window is visible
 * - Idle polling (5min) when window is hidden
 * - Immediate refresh on file changes
 *
 * Migrated from: /Users/gpriday/Projects/CopyTree/canopy/src/hooks/useRepositoryStats.ts
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { RepositoryStats } from "../types";
import { githubClient, projectClient } from "@/clients";

// Polling intervals
const ACTIVE_POLL_INTERVAL = 30 * 1000; // 30 seconds when active
const IDLE_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes when idle
const ERROR_BACKOFF_INTERVAL = 2 * 60 * 1000; // 2 minutes on error

export interface UseRepositoryStatsReturn {
  /** Repository statistics */
  stats: RepositoryStats | null;
  /** Whether stats are currently loading */
  loading: boolean;
  /** Error message if stats failed to load */
  error: string | null;
  /** Manual refresh trigger */
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching and polling GitHub repository stats
 *
 * @example
 * ```tsx
 * function Toolbar() {
 *   const { stats, loading, error, refresh } = useRepositoryStats();
 *
 *   if (loading && !stats) return <LoadingSpinner />;
 *   if (error && !stats) return <ErrorMessage error={error} onRetry={refresh} />;
 *
 *   return (
 *     <div>
 *       <StatsBadge label="Commits" count={stats?.commitCount ?? 0} />
 *       <StatsBadge label="Issues" count={stats?.issueCount ?? 0} />
 *       <StatsBadge label="PRs" count={stats?.prCount ?? 0} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useRepositoryStats(): UseRepositoryStatsReturn {
  const [stats, setStats] = useState<RepositoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isVisibleRef = useRef(!document.hidden); // Initialize from current visibility
  const mountedRef = useRef(true);
  const lastErrorRef = useRef<string | null>(null); // Track latest error for backoff
  const inFlightRef = useRef(false); // Prevent concurrent fetches

  /**
   * Fetch repository stats from the current project
   */
  const fetchStats = useCallback(async () => {
    // Prevent concurrent fetches
    if (inFlightRef.current) {
      return;
    }

    try {
      inFlightRef.current = true;

      // Get current project to determine cwd
      const project = await projectClient.getCurrent();
      if (!project) {
        // No project open, clear stats
        if (mountedRef.current) {
          setStats(null);
          setError(null);
          lastErrorRef.current = null;
        }
        return;
      }

      setLoading(true);
      setError(null);

      const repoStats = await githubClient.getRepoStats(project.path);

      if (mountedRef.current) {
        setStats(repoStats);
        if (repoStats.ghError) {
          setError(repoStats.ghError);
          lastErrorRef.current = repoStats.ghError;
        } else {
          lastErrorRef.current = null;
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch repository stats";
        setError(errorMessage);
        lastErrorRef.current = errorMessage;
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
      inFlightRef.current = false;
    }
  }, []);

  /**
   * Manual refresh trigger
   */
  const refresh = useCallback(async () => {
    // Clear existing timer to avoid overlap
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    await fetchStats();
  }, [fetchStats]);

  /**
   * Schedule next poll with adaptive interval
   */
  const scheduleNextPoll = useCallback(() => {
    // Clear existing timer
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
    }

    // Determine interval based on visibility and error state (using refs for latest values)
    let interval = isVisibleRef.current ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;
    if (lastErrorRef.current) {
      interval = ERROR_BACKOFF_INTERVAL;
    }

    pollTimerRef.current = setTimeout(() => {
      fetchStats().then(() => {
        if (mountedRef.current) {
          scheduleNextPoll();
        }
      });
    }, interval);
  }, [fetchStats]);

  /**
   * Handle visibility change
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;

      // Clear any existing timer to prevent overlap
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      // If window became visible, trigger immediate refresh
      if (isVisibleRef.current) {
        fetchStats().then(() => {
          if (mountedRef.current) {
            scheduleNextPoll();
          }
        });
      } else {
        // Window hidden, reschedule with idle interval
        scheduleNextPoll();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchStats, scheduleNextPoll]);

  /**
   * Mount/unmount cleanup - stable effect with no deps
   */
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  /**
   * Initial fetch and start polling - stable effect
   */
  useEffect(() => {
    // Initial fetch
    fetchStats().then(() => {
      if (mountedRef.current) {
        scheduleNextPoll();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Listen for project switches to refresh stats
   */
  useEffect(() => {
    const cleanup = projectClient.onSwitch(() => {
      // Clear existing timer to prevent overlap
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      // Project switched, fetch new stats immediately
      fetchStats().then(() => {
        if (mountedRef.current) {
          scheduleNextPoll();
        }
      });
    });

    return cleanup;
  }, [fetchStats, scheduleNextPoll]);

  return {
    stats,
    loading,
    error,
    refresh,
  };
}
