import { useEffect, useState, useCallback } from "react";
import { useGitActivityStateStore } from "@/store/gitActivityStateStore";
import { useTerminalStore } from "@/store/terminalStore";
import { useWorktrees } from "@/hooks/useWorktrees";
import { Loader2, AlertCircle, RefreshCw, GitBranch, FileText } from "lucide-react";
import type { PanelComponentProps } from "@/registry/panelComponentRegistry";
import type { ProjectPulse } from "@shared/types";
import type { GitCommitListResponse } from "@shared/types/github";

interface GitActivityPanelProps extends PanelComponentProps {
  worktreeId?: string;
}

export function GitActivityPanel({ id, worktreeId }: GitActivityPanelProps) {
  const { getState: getActivityState, updateDaysToShow, toggleShowUncommitted } =
    useGitActivityStateStore();
  const getTerminal = useTerminalStore((state) => state.getTerminal);
  const { worktrees } = useWorktrees();

  const [pulse, setPulse] = useState<ProjectPulse | null>(null);
  const [commits, setCommits] = useState<GitCommitListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const terminal = getTerminal(id);
  const effectiveWorktreeId = worktreeId || terminal?.worktreeId;
  const worktree = worktrees.find((wt) => wt.id === effectiveWorktreeId);
  const worktreePath = worktree?.path;

  const activityState = getActivityState(id);
  const daysToShow = activityState.daysToShow;
  const showUncommitted = activityState.showUncommitted;

  const fetchActivity = useCallback(async () => {
    if (!effectiveWorktreeId || !worktreePath) return;

    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const [pulseData, commitsData] = await Promise.all([
        window.electron.git.getProjectPulse({
          worktreeId: effectiveWorktreeId,
          rangeDays: daysToShow,
          includeDelta: showUncommitted,
          includeRecentCommits: true,
          forceRefresh: false,
        }),
        window.electron.git.listCommits({
          cwd: worktreePath,
          limit: 50,
        }),
      ]);

      if (!mountedRef.current || currentRequestId !== requestIdRef.current) {
        return;
      }

      setPulse(pulseData);
      setCommits(commitsData);
    } catch (err) {
      console.error("Failed to fetch git activity:", err);
      if (!mountedRef.current || currentRequestId !== requestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load git activity");
    } finally {
      if (mountedRef.current && currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [effectiveWorktreeId, worktreePath, daysToShow, showUncommitted]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleRefresh = useCallback(() => {
    fetchActivity();
  }, [fetchActivity]);

  const handleDaysChange = useCallback(
    (days: number) => {
      updateDaysToShow(id, days);
    },
    [id, updateDaysToShow]
  );

  const handleToggleUncommitted = useCallback(() => {
    toggleShowUncommitted(id);
  }, [id, toggleShowUncommitted]);

  if (!worktreePath) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <div className="text-center">
          <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No worktree associated with this panel</p>
        </div>
      </div>
    );
  }

  if (isLoading && !pulse && !commits) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading git activity...</span>
        </div>
      </div>
    );
  }

  if (error && !pulse && !commits) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-red-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-2" />
          <p className="mb-2">Failed to load git activity</p>
          <p className="text-sm text-gray-500">{error}</p>
          <button
            onClick={handleRefresh}
            className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-surface)]">
      <div className="flex items-center justify-between p-4 border-b border-canopy-border">
        <h3 className="text-sm font-medium text-canopy-text">Git Activity</h3>
        <div className="flex items-center gap-2">
          <select
            value={daysToShow}
            onChange={(e) => handleDaysChange(Number(e.target.value))}
            className="text-xs px-2 py-1 bg-[var(--color-surface-dim)] border border-canopy-border rounded"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
          </select>
          <button
            onClick={handleToggleUncommitted}
            className={`text-xs px-2 py-1 rounded border ${
              showUncommitted
                ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                : "bg-[var(--color-surface-dim)] border-canopy-border"
            }`}
            title="Show uncommitted changes"
          >
            <FileText className="w-3 h-3" />
          </button>
          <button
            onClick={handleRefresh}
            className="p-1 hover:bg-[var(--color-surface-dim)] rounded"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {pulse && (
          <div className="mb-6">
            <h4 className="text-xs font-medium text-canopy-text/70 mb-2">Summary</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[var(--color-surface-dim)] p-3 rounded">
                <div className="text-2xl font-bold text-canopy-text">
                  {pulse.totalCommits ?? 0}
                </div>
                <div className="text-xs text-canopy-text/60">Total Commits</div>
              </div>
              <div className="bg-[var(--color-surface-dim)] p-3 rounded">
                <div className="text-2xl font-bold text-canopy-text">
                  {pulse.currentStreakDays ?? 0}
                </div>
                <div className="text-xs text-canopy-text/60">Day Streak</div>
              </div>
            </div>
          </div>
        )}

        {commits && commits.commits.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-canopy-text/70 mb-2">Recent Commits</h4>
            <div className="space-y-2">
              {commits.commits.map((commit) => (
                <div
                  key={commit.sha}
                  className="bg-[var(--color-surface-dim)] p-3 rounded text-xs"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-medium text-canopy-text truncate">
                      {commit.message.split("\n")[0]}
                    </div>
                    <div className="text-canopy-text/50 text-xs whitespace-nowrap">
                      {new Date(commit.date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-canopy-text/60">
                    <span>{commit.author}</span>
                    <span>·</span>
                    <span className="font-mono text-xs">{commit.sha.substring(0, 7)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(!commits || commits.commits.length === 0) && !isLoading && (
          <div className="text-center text-gray-500 py-8">
            <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No commits found in the selected range</p>
          </div>
        )}
      </div>
    </div>
  );
}
