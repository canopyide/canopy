import { useState, useEffect, useRef } from "react";
import type { ProjectHealthData } from "../types";
import { githubClient, projectClient } from "@/clients";
import { formatErrorMessage } from "@shared/utils/errorMessage";
import { usePollingLifecycle } from "@/hooks/usePollingLifecycle";

const ACTIVE_POLL_INTERVAL = 30 * 1000;
const IDLE_POLL_INTERVAL = 5 * 60 * 1000;
const ERROR_BACKOFF_INTERVAL = 2 * 60 * 1000;

export interface UseProjectHealthReturn {
  health: ProjectHealthData | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  refresh: (options?: { force?: boolean }) => Promise<void>;
}

export function useProjectHealth(): UseProjectHealthReturn {
  const [health, setHealth] = useState<ProjectHealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const lastErrorRef = useRef<string | null>(null);
  const projectPathRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const polling = usePollingLifecycle({
    fetchFn: async ({ force, isInvalidated }) => {
      const project = await projectClient.getCurrent();
      if (!project) {
        if (mountedRef.current) {
          setHealth(null);
          setError(null);
          setLastUpdated(null);
          lastErrorRef.current = null;
          projectPathRef.current = null;
        }
        return;
      }

      if (mountedRef.current) setLoading(true);

      try {
        const result = await githubClient.getProjectHealth(project.path, force);

        if (!mountedRef.current) return;
        if (isInvalidated()) return;
        if (projectPathRef.current !== null && projectPathRef.current !== project.path) return;

        projectPathRef.current = project.path;

        setHealth(result);
        setLastUpdated(result.lastUpdated ?? null);

        if (result.error) {
          setError(result.error);
          lastErrorRef.current = result.error;
        } else {
          setError(null);
          lastErrorRef.current = null;
        }
      } catch (err) {
        if (mountedRef.current) {
          const errorMessage = formatErrorMessage(err, "Failed to fetch project health");
          setError(errorMessage);
          lastErrorRef.current = errorMessage;
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    calculateNextInterval: ({ isVisible }) => {
      if (lastErrorRef.current) return ERROR_BACKOFF_INTERVAL;
      return isVisible ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;
    },
    onProjectSwitch: () => {
      if (!mountedRef.current) return;
      projectPathRef.current = null;
      setHealth(null);
      setLastUpdated(null);
    },
  });

  return {
    health,
    loading,
    error,
    lastUpdated,
    refresh: polling.refresh,
  };
}
