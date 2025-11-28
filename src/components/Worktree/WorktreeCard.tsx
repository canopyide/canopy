import { useMemo, useCallback, useState, useEffect } from 'react';
import type { WorktreeState, WorktreeMood } from '../../types/index.js';
import { ActivityLight } from './ActivityLight.js';
import { FileChangeList } from './FileChangeList.js';
import { useDevServer } from '../../hooks/useDevServer.js';
import { cn } from '../../lib/utils.js';

export interface WorktreeCardProps {
  worktree: WorktreeState;
  isActive: boolean;
  isFocused: boolean;
  onSelect: () => void;
  onCopyTree: () => void;
  onOpenEditor: () => void;
  onOpenIssue?: () => void;
  onOpenPR?: () => void;
  onToggleServer: () => void;
}

const MOOD_BORDER_COLORS: Record<WorktreeMood, string> = {
  active: 'border-blue-400',
  stable: 'border-green-400',
  stale: 'border-yellow-400',
  error: 'border-red-400',
};

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function parseNoteWithLinks(text: string): Array<{ type: 'text' | 'link'; content: string }> {
  const segments: Array<{ type: 'text' | 'link'; content: string }> = [];
  let lastIndex = 0;
  const regex = new RegExp(URL_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'link', content: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

function formatPath(targetPath: string): string {
  const home = process.env.HOME || '';
  if (home && targetPath.startsWith(home)) {
    return targetPath.replace(home, '~');
  }
  return targetPath;
}

const MAIN_WORKTREE_NOTE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function WorktreeCard({
  worktree,
  isActive,
  isFocused,
  onSelect,
  onCopyTree,
  onOpenEditor,
  onOpenIssue,
  onOpenPR,
  onToggleServer,
}: WorktreeCardProps) {
  const mood = worktree.mood || 'stable';
  const borderColor = MOOD_BORDER_COLORS[mood];

  const { state: serverState, hasDevScript, isLoading: serverLoading } = useDevServer({
    worktreeId: worktree.id,
    worktreePath: worktree.path,
  });

  // For main worktree, notes expire after 10 minutes (real-time)
  const [now, setNow] = useState(() => Date.now());
  const isMainWorktree = worktree.branch === 'main' || worktree.branch === 'master';

  // Set up timer to re-check note expiration for main worktree
  useEffect(() => {
    if (!isMainWorktree || !worktree.aiNote || !worktree.aiNoteTimestamp) {
      return;
    }

    const expiresAt = worktree.aiNoteTimestamp + MAIN_WORKTREE_NOTE_TTL_MS;
    const timeUntilExpiry = expiresAt - Date.now();

    if (timeUntilExpiry <= 0) {
      setNow(Date.now());
      return;
    }

    const timer = setTimeout(() => {
      setNow(Date.now());
    }, timeUntilExpiry);

    return () => clearTimeout(timer);
  }, [isMainWorktree, worktree.aiNote, worktree.aiNoteTimestamp]);

  // Calculate effective note (applying TTL for main worktree)
  const effectiveNote = useMemo(() => {
    const trimmed = worktree.aiNote?.trim();
    if (!trimmed) return undefined;

    if (isMainWorktree && worktree.aiNoteTimestamp) {
      const age = now - worktree.aiNoteTimestamp;
      if (age > MAIN_WORKTREE_NOTE_TTL_MS) {
        return undefined;
      }
    }

    return trimmed;
  }, [worktree.aiNote, isMainWorktree, worktree.aiNoteTimestamp, now]);

  const parsedNoteSegments = useMemo(() => {
    return effectiveNote ? parseNoteWithLinks(effectiveNote) : [];
  }, [effectiveNote]);

  const handlePathClick = useCallback(() => {
    if (window.electron?.system?.openPath) {
      window.electron.system.openPath(worktree.path);
    }
  }, [worktree.path]);

  const handleOpenIssue = useCallback(() => {
    if (worktree.issueNumber && onOpenIssue) {
      onOpenIssue();
    }
  }, [worktree.issueNumber, onOpenIssue]);

  const handleOpenPR = useCallback(() => {
    if (worktree.prNumber && onOpenPR) {
      onOpenPR();
    }
  }, [worktree.prNumber, onOpenPR]);

  const displayPath = formatPath(worktree.path);
  const branchLabel = worktree.branch ?? worktree.name;
  const hasChanges = (worktree.worktreeChanges?.changedFileCount ?? 0) > 0;

  // Summary component
  let summaryContent: React.ReactNode;
  const isCommitMessage = worktree.summary?.startsWith('Last commit:') || worktree.summary?.startsWith('✅');

  if (worktree.summary) {
    if (isCommitMessage) {
      summaryContent = <span className="text-gray-500">{worktree.summary}</span>;
    } else if (hasChanges) {
      summaryContent = <span className="text-gray-300">{worktree.summary}</span>;
    } else {
      summaryContent = <span className="text-gray-500">{worktree.summary}</span>;
    }
  } else if (worktree.aiStatus === 'loading') {
    summaryContent = <span className="text-gray-500">Generating summary...</span>;
  } else {
    const fallbackText = worktree.branch ? `Clean: ${worktree.branch}` : 'Ready';
    summaryContent = <span className="text-gray-500">{fallbackText}</span>;
  }

  // Server status helpers
  const getServerStatusIndicator = () => {
    if (!serverState) return null;
    switch (serverState.status) {
      case 'stopped':
        return <span className="text-gray-500">○</span>;
      case 'starting':
        return <span className="text-yellow-400">◐</span>;
      case 'running':
        return <span className="text-green-400">●</span>;
      case 'error':
        return <span className="text-red-400">●</span>;
      default:
        return <span className="text-gray-500">○</span>;
    }
  };

  const getServerStatusText = () => {
    if (!serverState) return null;
    switch (serverState.status) {
      case 'stopped':
        return <span className="text-gray-500">Dev Server</span>;
      case 'starting':
        return <span className="text-yellow-400">Starting...</span>;
      case 'running':
        return serverState.url ? (
          <span className="text-green-400">{serverState.url}</span>
        ) : (
          <span className="text-green-400">Running</span>
        );
      case 'error':
        return (
          <span className="text-red-400">
            {serverState.errorMessage ? `Error: ${serverState.errorMessage.slice(0, 40)}` : 'Error'}
          </span>
        );
      default:
        return <span className="text-gray-500">Dev Server</span>;
    }
  };

  const getServerButtonLabel = () => {
    if (!serverState) return 'Start';
    switch (serverState.status) {
      case 'stopped':
        return 'Start';
      case 'starting':
        return '...';
      case 'running':
        return 'Stop';
      case 'error':
        return 'Retry';
      default:
        return 'Start';
    }
  };

  const getServerButtonColor = () => {
    if (!serverState) return 'text-green-400';
    switch (serverState.status) {
      case 'stopped':
        return 'text-green-400';
      case 'starting':
        return 'text-yellow-400';
      case 'running':
        return 'text-red-400';
      case 'error':
        return 'text-green-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div
      className={cn(
        'border-2 rounded-lg p-3 mb-3 cursor-pointer transition-all',
        borderColor,
        isFocused && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900',
        'hover:shadow-lg hover:shadow-blue-500/20'
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Worktree: ${branchLabel}`}
    >
      {/* Action buttons */}
      <div className="flex gap-2 mb-3 border-b border-gray-700 pb-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCopyTree();
          }}
          className="text-xs px-2 py-1 border border-gray-600 rounded hover:bg-gray-800 hover:border-gray-500 text-gray-300"
        >
          Copy
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenEditor();
          }}
          className="text-xs px-2 py-1 border border-gray-600 rounded hover:bg-gray-800 hover:border-gray-500 text-gray-300"
        >
          Code
        </button>
        {worktree.issueNumber && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenIssue();
            }}
            className="text-xs px-2 py-1 border border-blue-600 rounded hover:bg-blue-900 hover:border-blue-500 text-blue-400"
          >
            Issue
          </button>
        )}
        {worktree.prNumber && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenPR();
            }}
            className="text-xs px-2 py-1 border border-green-600 rounded hover:bg-green-900 hover:border-green-500 text-green-400"
          >
            PR
          </button>
        )}
      </div>

      {/* Header: Activity light + Branch */}
      <div className="mb-1 flex items-center gap-2">
        <ActivityLight timestamp={worktree.lastActivityTimestamp} />
        {isActive && <span className="text-blue-400">●</span>}
        <span className={cn('font-bold', mood === 'active' ? 'text-yellow-400' : 'text-gray-200')}>
          {branchLabel}
        </span>
        {!worktree.branch && <span className="text-yellow-400">(detached)</span>}
        {worktree.aiStatus === 'disabled' && <span className="text-gray-500">[AI off]</span>}
        {worktree.aiStatus === 'error' && <span className="text-red-400">[AI err]</span>}
      </div>

      {/* Path (clickable) */}
      <div className="mb-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePathClick();
          }}
          className={cn(
            'text-sm text-gray-500 hover:text-gray-400 hover:underline text-left',
            isFocused && 'underline'
          )}
        >
          {displayPath}
        </button>
      </div>

      {/* Summary */}
      <div className="mt-3 text-sm">{summaryContent}</div>

      {/* Files */}
      {hasChanges && worktree.worktreeChanges && (
        <FileChangeList
          changes={worktree.worktreeChanges.changes}
          rootPath={worktree.worktreeChanges.rootPath}
          maxVisible={4}
        />
      )}

      {/* Server status */}
      {hasDevScript && serverState && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {getServerStatusIndicator()}
            {getServerStatusText()}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!serverLoading && serverState.status !== 'starting') {
                onToggleServer();
              }
            }}
            disabled={serverLoading || serverState.status === 'starting'}
            className={cn(
              'text-xs px-2 py-1 border rounded font-bold',
              getServerButtonColor(),
              (serverLoading || serverState.status === 'starting') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800'
            )}
          >
            [{getServerButtonLabel()}]
          </button>
        </div>
      )}

      {/* Agent note */}
      {effectiveNote && (
        <div className="mt-3 text-sm text-gray-300">
          {parsedNoteSegments.map((segment, index) =>
            segment.type === 'link' ? (
              <a
                key={index}
                href={segment.content}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 underline hover:text-blue-300"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.electron?.system?.openExternal) {
                    e.preventDefault();
                    window.electron.system.openExternal(segment.content);
                  }
                }}
              >
                {segment.content}
              </a>
            ) : (
              <span key={index}>{segment.content}</span>
            )
          )}
        </div>
      )}
    </div>
  );
}
