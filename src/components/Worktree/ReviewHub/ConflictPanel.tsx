import { useCallback, useMemo, useState } from "react";
import type { RebaseAction, RebaseEntry, RepoState, StagingStatus } from "@shared/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleDashed,
  CircleSlash,
  ExternalLink,
  FileIcon,
  GitMerge,
  Play,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { TruncatedTooltip } from "@/components/ui/TruncatedTooltip";

const OPERATION_LABEL: Record<Exclude<RepoState, "CLEAN" | "DIRTY">, string> = {
  MERGING: "Merge",
  REBASING: "Rebase",
  CHERRY_PICKING: "Cherry-pick",
  REVERTING: "Revert",
};

const ABORT_DESCRIPTION: Record<Exclude<RepoState, "CLEAN" | "DIRTY">, string> = {
  MERGING: "Discards the in-progress merge and restores the working tree to its pre-merge state.",
  REBASING:
    "Discards the in-progress rebase, including any commits already replayed, and returns HEAD to the original branch tip.",
  CHERRY_PICKING:
    "Discards the in-progress cherry-pick and restores the working tree to the state before the operation started.",
  REVERTING:
    "Discards the in-progress revert and restores the working tree to the state before the operation started.",
};

const REBASE_ACTION_LABEL: Record<RebaseAction, string> = {
  pick: "pick",
  reword: "reword",
  edit: "edit",
  squash: "squash",
  fixup: "fixup",
  drop: "drop",
  exec: "exec",
  other: "step",
};

interface RebaseDisplayEntry extends RebaseEntry {
  /** Indented under a preceding pick/reword/edit to show grouping. */
  indented: boolean;
}

interface ConflictPanelProps {
  status: StagingStatus;
  onMarkResolved: (filePath: string) => Promise<void> | void;
  onOpenInEditor: (filePath: string) => Promise<void> | void;
  onAbort: () => Promise<void>;
  onContinue: () => Promise<void>;
}

/**
 * Vertical commit-sequence rail for an in-progress rebase. The current step
 * carries the sole accent treatment in the conflict view per the accent-as-
 * scarce-resource rule — every other state uses neutral surfaces.
 */
function RebaseSequenceRail({ entries }: { entries: RebaseEntry[] }) {
  const display = useMemo<RebaseDisplayEntry[]>(() => {
    const out: RebaseDisplayEntry[] = [];
    let lastParentWasCommit = false;
    for (const entry of entries) {
      // fixup/squash visually nest under the preceding pick/reword/edit so the
      // operator can see which commit they amend without collapsing the rows.
      const indented =
        lastParentWasCommit && (entry.action === "fixup" || entry.action === "squash");
      out.push({ ...entry, indented });
      if (entry.action === "pick" || entry.action === "reword" || entry.action === "edit") {
        lastParentWasCommit = true;
      } else if (entry.action !== "fixup" && entry.action !== "squash") {
        lastParentWasCommit = false;
      }
    }
    return out;
  }, [entries]);

  if (display.length === 0) return null;

  return (
    <div className="border-b border-divider" data-testid="conflict-rebase-sequence">
      <div className="px-4 py-2 bg-overlay-subtle flex items-center">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-daintree-text/60">
          Rebase sequence
          <span className="ml-1.5 tabular-nums bg-tint/10 rounded px-1 py-0.5 text-[10px] font-medium normal-case tracking-normal">
            {display.length}
          </span>
        </span>
      </div>
      <ul
        className="px-2 py-1 flex flex-col gap-0.5 max-h-48 overflow-y-auto"
        role="list"
        aria-label="Rebase commit sequence"
      >
        {display.map((entry, idx) => (
          <RebaseSequenceRow key={`rebase-entry-${idx}`} entry={entry} />
        ))}
      </ul>
    </div>
  );
}

function RebaseSequenceRow({ entry }: { entry: RebaseDisplayEntry }) {
  const isDropped = entry.action === "drop";
  const isCurrent = entry.state === "current";
  const isDone = entry.state === "done";

  // State drives the row tone; the action keyword sits in its own column.
  const rowTone = isCurrent
    ? "text-accent-primary font-medium"
    : isDone
      ? "text-daintree-text/45"
      : "text-daintree-text/75";

  const StateIcon = isCurrent
    ? ChevronRight
    : isDone
      ? Check
      : isDropped
        ? CircleSlash
        : CircleDashed;

  return (
    <li
      className={cn(
        "flex items-center gap-2 px-2 py-1 text-xs transition-colors",
        entry.indented && "ml-4",
        rowTone
      )}
      data-testid={`rebase-entry-${entry.state}`}
      data-action={entry.action}
    >
      <StateIcon className="w-3 h-3 shrink-0" aria-hidden />
      <span
        className={cn(
          "text-[10px] uppercase tracking-wider font-mono w-12 shrink-0 text-daintree-text/55",
          isCurrent && "text-accent-primary/80"
        )}
      >
        {REBASE_ACTION_LABEL[entry.action]}
      </span>
      {entry.sha != null && entry.sha.length > 0 ? (
        <span className="font-mono text-[11px] tabular-nums text-daintree-text/55 shrink-0">
          {entry.sha.slice(0, 7)}
        </span>
      ) : (
        <span className="font-mono text-[11px] text-daintree-text/30 shrink-0">—</span>
      )}
      <TruncatedTooltip content={entry.subject || REBASE_ACTION_LABEL[entry.action]}>
        <span
          className={cn(
            "flex-1 min-w-0 truncate font-mono text-[11px]",
            isDropped && "line-through"
          )}
        >
          {entry.subject}
        </span>
      </TruncatedTooltip>
    </li>
  );
}

function splitPath(filePath: string): { dir: string; base: string } {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) return { dir: "", base: normalized };
  return { dir: normalized.slice(0, lastSlash), base: normalized.slice(lastSlash + 1) };
}

export function ConflictPanel({
  status,
  onMarkResolved,
  onOpenInEditor,
  onAbort,
  onContinue,
}: ConflictPanelProps) {
  const [isAbortOpen, setIsAbortOpen] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [busyFile, setBusyFile] = useState<string | null>(null);

  const operationState = status.repoState;
  const operationLabel = useMemo(() => {
    if (
      operationState === "MERGING" ||
      operationState === "REBASING" ||
      operationState === "CHERRY_PICKING" ||
      operationState === "REVERTING"
    ) {
      return OPERATION_LABEL[operationState];
    }
    return "Operation";
  }, [operationState]);

  const conflictCount = status.conflictedFiles.length;
  const canContinue = conflictCount === 0;
  const hasStagedResolutions = status.staged.length > 0;

  const handleAbort = useCallback(async () => {
    setIsAborting(true);
    try {
      await onAbort();
      setIsAbortOpen(false);
    } finally {
      setIsAborting(false);
    }
  }, [onAbort]);

  const handleContinue = useCallback(async () => {
    setIsContinuing(true);
    try {
      await onContinue();
    } finally {
      setIsContinuing(false);
    }
  }, [onContinue]);

  const handleMarkResolvedClick = useCallback(
    async (filePath: string) => {
      setBusyFile(filePath);
      try {
        await onMarkResolved(filePath);
      } finally {
        setBusyFile((current) => (current === filePath ? null : current));
      }
    },
    [onMarkResolved]
  );

  return (
    <div data-testid="conflict-panel">
      {/* Banner */}
      <div className="px-4 py-3 bg-status-warning/10 border-b border-divider flex items-start gap-2">
        <GitMerge className="w-4 h-4 text-status-warning mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-daintree-text">
              Resolve {operationLabel} Conflicts
            </span>
            {operationState === "REBASING" &&
              status.rebaseStep != null &&
              status.rebaseTotalSteps != null && (
                <span
                  className="text-[11px] tabular-nums text-daintree-text/70 bg-tint/[0.08] border border-tint/[0.08] rounded px-1.5 py-0.5"
                  data-testid="conflict-rebase-progress"
                >
                  Step {status.rebaseStep} of {status.rebaseTotalSteps}
                </span>
              )}
          </div>
          <p className="text-xs text-daintree-text/60 mt-0.5">
            {conflictCount > 0
              ? `${conflictCount} conflicted file${conflictCount !== 1 ? "s" : ""} — resolve each, then continue.`
              : hasStagedResolutions
                ? "All conflicts resolved. Continue to finish the operation."
                : "No conflicts remaining. Continue to finish the operation."}
          </p>
        </div>
      </div>

      {/* Rebase commit sequence (merge backend only) */}
      {operationState === "REBASING" && status.rebaseSequence != null && (
        <RebaseSequenceRail entries={status.rebaseSequence.entries} />
      )}

      {/* Conflicted files */}
      <div className="border-b border-divider">
        <div className="flex items-center justify-between px-4 py-2 bg-overlay-subtle">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-daintree-text/60">
            Conflicted
            <span className="ml-1.5 tabular-nums bg-tint/10 rounded px-1 py-0.5 text-[10px] font-medium normal-case tracking-normal">
              {conflictCount}
            </span>
          </span>
        </div>
        {conflictCount > 0 ? (
          <ul className="px-2 py-1 flex flex-col gap-0.5" role="list">
            {status.conflictedFiles.map((file) => {
              const { dir, base } = splitPath(file.path);
              const isBusy = busyFile === file.path;
              return (
                <li
                  key={`conflict-${file.path}`}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded text-xs",
                    "hover:bg-tint/5 transition-colors"
                  )}
                >
                  <AlertTriangle className="w-3 h-3 shrink-0 text-status-error" />
                  <FileIcon className="w-3 h-3 shrink-0 text-daintree-text/40" />
                  <TruncatedTooltip content={`${file.path} (${file.label})`}>
                    <div className="flex-1 min-w-0 flex items-baseline">
                      {dir && (
                        <span className="shrink truncate text-daintree-text/50 font-mono text-[11px]">
                          {dir}/
                        </span>
                      )}
                      <span className="shrink truncate text-daintree-text font-medium font-mono text-[11px]">
                        {base}
                      </span>
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-daintree-text/50 font-mono">
                        {file.label}
                      </span>
                    </div>
                  </TruncatedTooltip>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void onOpenInEditor(file.path)}
                      disabled={isBusy}
                      className="h-5 px-1.5 text-[10px]"
                      aria-label={`Open ${file.path} in external editor`}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleMarkResolvedClick(file.path)}
                      disabled={isBusy}
                      className="h-5 px-1.5 text-[10px]"
                      aria-label={`Mark ${file.path} as resolved`}
                    >
                      {isBusy ? (
                        <Spinner size="sm" className="mr-1" />
                      ) : (
                        <Check className="w-3 h-3 mr-1" />
                      )}
                      Mark resolved
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-4 py-3 text-xs text-daintree-text/60">No conflicted files remain.</div>
        )}
      </div>

      {/* Staged resolutions (informational) */}
      {hasStagedResolutions && (
        <div className="border-b border-divider">
          <div className="px-4 py-2 bg-overlay-subtle">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-daintree-text/60">
              Resolved (staged)
              <span className="ml-1.5 tabular-nums bg-tint/10 rounded px-1 py-0.5 text-[10px] font-medium normal-case tracking-normal">
                {status.staged.length}
              </span>
            </span>
          </div>
          <ul className="px-2 py-1 flex flex-col gap-0.5" role="list">
            {status.staged.map((file) => {
              const { dir, base } = splitPath(file.path);
              return (
                <li
                  key={`resolved-${file.path}`}
                  className="flex items-center gap-2 px-2 py-1 text-xs"
                >
                  <Check className="w-3 h-3 shrink-0 text-status-success" />
                  <TruncatedTooltip content={file.path}>
                    <div className="flex-1 min-w-0 flex items-baseline">
                      {dir && (
                        <span className="shrink truncate text-daintree-text/50 font-mono text-[11px]">
                          {dir}/
                        </span>
                      )}
                      <span className="shrink truncate text-daintree-text/80 font-mono text-[11px]">
                        {base}
                      </span>
                    </div>
                  </TruncatedTooltip>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-2 p-3 border-t border-divider">
        <Button
          variant="subtle"
          size="sm"
          onClick={() => setIsAbortOpen(true)}
          disabled={isAborting || isContinuing}
          className="flex-1"
          data-testid="conflict-abort"
        >
          <XCircle className="w-3.5 h-3.5 mr-1.5" />
          Abort {operationLabel.toLowerCase()}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => void handleContinue()}
          disabled={!canContinue || isAborting || isContinuing}
          className="flex-1"
          data-testid="conflict-continue"
        >
          {isContinuing ? (
            <Spinner size="sm" className="mr-1.5" />
          ) : (
            <Play className="w-3.5 h-3.5 mr-1.5" />
          )}
          Continue {operationLabel.toLowerCase()}
        </Button>
      </div>

      <ConfirmDialog
        isOpen={isAbortOpen}
        onClose={() => {
          if (!isAborting) setIsAbortOpen(false);
        }}
        title={`Abort ${operationLabel.toLowerCase()}?`}
        description={
          ABORT_DESCRIPTION[operationState as Exclude<RepoState, "CLEAN" | "DIRTY">] ??
          "Discards the in-progress operation."
        }
        confirmLabel={`Abort ${operationLabel.toLowerCase()}`}
        cancelLabel="Keep working"
        onConfirm={() => void handleAbort()}
        isConfirmLoading={isAborting}
        variant="destructive"
      />
    </div>
  );
}
