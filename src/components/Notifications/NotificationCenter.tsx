import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Ellipsis, Layers, Moon, Trash2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  useNotificationHistoryStore,
  type NotificationHistoryEntry,
} from "@/store/slices/notificationHistorySlice";
import { NotificationCenterEntry } from "./NotificationCenterEntry";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { actionService } from "@/services/ActionService";
import { muteForDuration, muteUntilNextMorning, setSessionQuietUntil } from "@/lib/notify";
import { useNotificationSettingsStore } from "@/store/notificationSettingsStore";
import { useUIStore } from "@/store/uiStore";
import { useWorktreeStore } from "@/hooks/useWorktreeStore";
import { isScheduledQuietNow, nextOccurrenceTimestamp } from "@shared/utils/quietHours";
import type { NotificationType } from "@/store/notificationStore";

const SEVERITY_WEIGHTS: Record<NotificationType, number> = {
  error: 3,
  warning: 2,
  info: 1,
  success: 0,
} as const;

const NEEDS_ATTENTION_CAP = 5;
const CONTEXT_NONE_KEY = "__none__";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function getWorstSeverity(entries: NotificationHistoryEntry[]): NotificationType {
  if (entries.length === 0) return "success";
  return entries.reduce((highest, current) =>
    SEVERITY_WEIGHTS[current.type] > SEVERITY_WEIGHTS[highest.type] ? current : highest
  ).type;
}

function isUnreadGroup(group: ThreadGroup): boolean {
  return group.entries.some((e) => !e.seenAsToast);
}

function getGroupContextKey(group: ThreadGroup): string {
  for (const e of group.entries) {
    const wt = e.context?.worktreeId;
    if (wt) return `wt:${wt}`;
    const proj = e.context?.projectId;
    if (proj) return `proj:${proj}`;
  }
  return CONTEXT_NONE_KEY;
}

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

interface ThreadGroup {
  correlationId: string | undefined;
  entries: NotificationHistoryEntry[];
  latestTimestamp: number;
}

interface ContextSection {
  key: string;
  worktreeId?: string;
  projectId?: string;
  groups: ThreadGroup[];
}

function groupByCorrelationId(entries: NotificationHistoryEntry[]): ThreadGroup[] {
  const groups = new Map<string, { entries: NotificationHistoryEntry[]; isSolo: boolean }>();
  const order: string[] = [];

  for (const entry of entries) {
    if (entry.correlationId) {
      if (!groups.has(entry.correlationId)) {
        groups.set(entry.correlationId, { entries: [], isSolo: false });
        order.push(entry.correlationId);
      }
      groups.get(entry.correlationId)!.entries.push(entry);
    } else {
      groups.set(entry.id, { entries: [entry], isSolo: true });
      order.push(entry.id);
    }
  }

  return order.map((key) => {
    const { entries: groupEntries, isSolo } = groups.get(key)!;
    return {
      correlationId: isSolo ? undefined : key,
      entries: groupEntries,
      latestTimestamp: Math.max(...groupEntries.map((e) => e.timestamp)),
    };
  });
}

function partitionByContext(groups: ThreadGroup[]): ContextSection[] {
  const sections = new Map<string, ContextSection>();
  const order: string[] = [];

  for (const g of groups) {
    const key = getGroupContextKey(g);
    if (!sections.has(key)) {
      const first = g.entries.find((e) => e.context?.worktreeId || e.context?.projectId);
      sections.set(key, {
        key,
        worktreeId: first?.context?.worktreeId,
        projectId: first?.context?.projectId,
        groups: [],
      });
      order.push(key);
    }
    sections.get(key)!.groups.push(g);
  }

  return order.map((k) => sections.get(k)!);
}

export function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const entries = useNotificationHistoryStore((s) => s.entries);
  const unreadCount = useNotificationHistoryStore((s) => s.unreadCount);
  const clearAll = useNotificationHistoryStore((s) => s.clearAll);
  const markAllRead = useNotificationHistoryStore((s) => s.markAllRead);
  const dismissEntry = useNotificationHistoryStore((s) => s.dismissEntry);

  const {
    quietUntil,
    quietHoursEnabled,
    quietHoursStartMin,
    quietHoursEndMin,
    quietHoursWeekdays,
    groupByContext,
    setGroupByContext,
  } = useNotificationSettingsStore(
    useShallow((s) => ({
      quietUntil: s.quietUntil,
      quietHoursEnabled: s.quietHoursEnabled,
      quietHoursStartMin: s.quietHoursStartMin,
      quietHoursEndMin: s.quietHoursEndMin,
      quietHoursWeekdays: s.quietHoursWeekdays,
      groupByContext: s.groupByContext,
      setGroupByContext: s.setGroupByContext,
    }))
  );

  const lastClosedAt = useUIStore((s) => s.lastNotificationCenterClosedAt);
  const resetLastClosedAt = useUIStore((s) => s.resetNotificationCenterLastClosedAt);

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [frozenUnreadIds, setFrozenUnreadIds] = useState<Set<string> | null>(null);

  // Re-render at session-mute expiry and at scheduled quiet-hours boundaries —
  // mirrors the toolbar bell pattern so the pill auto-clears without an
  // unrelated render trigger.
  const [, forceTick] = useState(0);
  const now = Date.now();
  const isSessionMuted = quietUntil > now;
  const isScheduledMuted = isScheduledQuietNow({
    quietHoursEnabled,
    quietHoursStartMin,
    quietHoursEndMin,
    quietHoursWeekdays,
  });
  const showMutedPill = isSessionMuted || isScheduledMuted;

  useEffect(() => {
    if (!open) {
      setFrozenUnreadIds(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const tick = () => forceTick((n) => n + 1);
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];

    if (isSessionMuted) {
      const delay = Math.max(0, quietUntil - Date.now());
      timeouts.push(setTimeout(tick, delay + 50));
    }

    if (quietHoursEnabled) {
      const msToNextMinute = 60_000 - (Date.now() % 60_000);
      timeouts.push(
        setTimeout(() => {
          tick();
          intervals.push(setInterval(tick, 60_000));
        }, msToNextMinute + 50)
      );
    }

    return () => {
      for (const t of timeouts) clearTimeout(t);
      for (const i of intervals) clearInterval(i);
    };
  }, [open, isSessionMuted, quietUntil, quietHoursEnabled]);

  const filteredEntries = useMemo(() => {
    if (filter === "all") return entries;
    if (frozenUnreadIds) {
      return entries.filter((e) => !e.seenAsToast || frozenUnreadIds.has(e.id));
    }
    return entries.filter((e) => !e.seenAsToast);
  }, [entries, filter, frozenUnreadIds]);

  const { needsAttentionGroups, chronoSections, dividerGroupId } = useMemo(() => {
    // Pinned reflects the global unread severe-threads set so it stays the
    // same in All and Unread filter views. Chrono respects the active filter.
    const rawGroups = groupByCorrelationId(entries);
    const pinned = rawGroups
      .filter((g) => {
        if (!isUnreadGroup(g)) return false;
        const sev = getWorstSeverity(g.entries);
        return sev === "error" || sev === "warning";
      })
      .sort((a, b) => {
        const sevDiff =
          SEVERITY_WEIGHTS[getWorstSeverity(b.entries)] -
          SEVERITY_WEIGHTS[getWorstSeverity(a.entries)];
        if (sevDiff !== 0) return sevDiff;
        return b.latestTimestamp - a.latestTimestamp;
      })
      .slice(0, NEEDS_ATTENTION_CAP);

    const chronoGroups = groupByCorrelationId(filteredEntries);
    const sections: ContextSection[] = groupByContext
      ? partitionByContext(chronoGroups)
      : [{ key: "all", groups: chronoGroups }];

    let divider: string | null = null;
    if (lastClosedAt > 0) {
      for (const g of chronoGroups) {
        if (g.latestTimestamp > lastClosedAt) {
          divider = g.correlationId ?? g.entries[0]?.id ?? null;
          break;
        }
      }
    }

    return {
      needsAttentionGroups: pinned,
      chronoSections: sections,
      dividerGroupId: divider,
    };
  }, [entries, filteredEntries, groupByContext, lastClosedAt]);

  const totalChronoGroups = chronoSections.reduce((sum, s) => sum + s.groups.length, 0);

  const handleMarkAllRead = () => {
    if (filter === "unread") {
      setFrozenUnreadIds(new Set(entries.filter((e) => !e.seenAsToast).map((e) => e.id)));
    }
    markAllRead();
    resetLastClosedAt();
  };

  const handleMuteFor = (durationMs: number) => {
    muteForDuration(durationMs);
  };

  const handleMuteUntilMorning = () => {
    muteUntilNextMorning();
  };

  const openNotificationSettings = () => {
    onClose();
    void actionService.dispatch(
      "app.settings.openTab",
      { tab: "notifications" },
      { source: "user" }
    );
  };

  const handleResumeNotifications = () => {
    setSessionQuietUntil(0);
  };

  const pillLabel = isSessionMuted
    ? `Muted until ${timeFormatter.format(new Date(quietUntil))}`
    : "Quiet hours";
  const morningLabel = `Until ${timeFormatter.format(new Date(nextOccurrenceTimestamp(8 * 60)))}`;

  const showGroupToggle = entries.length > 0;

  return (
    <div className="w-[360px] max-h-[420px] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-divider gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {showMutedPill ? (
            <span
              data-testid="notification-muted-pill"
              className="inline-flex items-center gap-1 rounded-full bg-overlay-medium px-2 py-0.5 text-[11px] text-daintree-text/70"
            >
              <span className="font-medium text-daintree-text/80">Notifications</span>
              <span aria-hidden="true" className="text-daintree-text/40">
                ·
              </span>
              <span className="truncate">{pillLabel}</span>
              {isSessionMuted && (
                <button
                  type="button"
                  onClick={handleResumeNotifications}
                  aria-label="Resume notifications"
                  title="Resume notifications"
                  className="ml-0.5 inline-flex items-center justify-center rounded-full p-0.5 text-daintree-text/50 hover:bg-overlay-emphasis hover:text-daintree-text/80 transition-colors"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
            </span>
          ) : (
            <span className="text-xs font-medium text-daintree-text/80">Notifications</span>
          )}
          {entries.length > 0 && (
            <div className="flex items-center rounded-md border border-daintree-text/10 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setFilter("all");
                  setFrozenUnreadIds(null);
                }}
                className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  filter === "all"
                    ? "bg-overlay-medium text-daintree-text/80"
                    : "text-daintree-text/40 hover:text-daintree-text/60"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilter("unread")}
                className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  filter === "unread"
                    ? "bg-overlay-medium text-daintree-text/80"
                    : "text-daintree-text/40 hover:text-daintree-text/60"
                }`}
              >
                Unread
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {showGroupToggle && (
            <button
              type="button"
              aria-label="Group by project or worktree"
              aria-pressed={groupByContext}
              title="Group by project or worktree"
              onClick={() => setGroupByContext(!groupByContext)}
              className={`p-1 transition-colors rounded-[var(--radius-sm)] ${
                groupByContext
                  ? "bg-overlay-medium text-daintree-text/80"
                  : "text-daintree-text/50 hover:bg-daintree-text/10 hover:text-daintree-text/80"
              }`}
            >
              <Layers className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleMarkAllRead}
              className="text-daintree-text/50"
            >
              <CheckCheck />
              Mark all read
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Pause notifications"
                title="Pause notifications"
                className="p-1 hover:bg-daintree-text/10 text-daintree-text/50 hover:text-daintree-text/80 transition-colors rounded-[var(--radius-sm)]"
              >
                <Moon className="w-3 h-3" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuItem onSelect={() => handleMuteFor(60 * 60 * 1000)}>
                For 1 hour
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleMuteUntilMorning}>{morningLabel}</DropdownMenuItem>
              <DropdownMenuItem onSelect={openNotificationSettings}>Custom…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                aria-label="Notification settings"
                onSelect={openNotificationSettings}
              >
                Notification settings{" "}
                <span aria-hidden="true" className="ml-auto pl-2 text-daintree-text/40">
                  →
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {entries.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-1 hover:bg-daintree-text/10 text-daintree-text/50 hover:text-daintree-text/80 transition-colors rounded-[var(--radius-sm)]"
                  aria-label="More notification actions"
                  title="More notification actions"
                >
                  <Ellipsis className="w-3 h-3" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                <DropdownMenuItem
                  destructive
                  onSelect={() => {
                    clearAll();
                    onClose();
                  }}
                >
                  <Trash2 className="w-3 h-3 mr-2" aria-hidden="true" />
                  Clear all
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {totalChronoGroups === 0 && needsAttentionGroups.length === 0 ? (
          filter === "unread" && entries.length > 0 ? (
            <EmptyState
              variant="user-cleared"
              title="You're all caught up"
              icon={<Bell />}
              className="py-10"
            />
          ) : (
            <EmptyState
              variant="zero-data"
              title="No notifications yet"
              icon={<Bell />}
              description={
                <>
                  Notifications appear here. Adjust which ones at{" "}
                  <button
                    type="button"
                    onClick={openNotificationSettings}
                    className="underline text-daintree-text/70 hover:text-daintree-text transition-colors"
                  >
                    Notification settings
                  </button>
                  .
                </>
              }
              className="py-10"
            />
          )
        ) : (
          <>
            {needsAttentionGroups.length > 0 && (
              <NeedsAttentionSection groups={needsAttentionGroups} onDismiss={dismissEntry} />
            )}
            {chronoSections.map((section) => (
              <ChronoSection
                key={section.key}
                section={section}
                groupByContext={groupByContext}
                dividerGroupId={dividerGroupId}
                onDismiss={dismissEntry}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function NeedsAttentionSection({
  groups,
  onDismiss,
}: {
  groups: ThreadGroup[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div data-testid="needs-attention-section" className="border-b border-divider">
      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-daintree-text/50">
        Needs attention
      </div>
      <div className="divide-y divide-tint/[0.04]">
        {groups.map((group) => renderGroup(group, onDismiss))}
      </div>
    </div>
  );
}

function ChronoSection({
  section,
  groupByContext,
  dividerGroupId,
  onDismiss,
}: {
  section: ContextSection;
  groupByContext: boolean;
  dividerGroupId: string | null;
  onDismiss: (id: string) => void;
}) {
  return (
    <div data-testid="chrono-section">
      {groupByContext && (
        <ContextSectionHeader
          worktreeId={section.worktreeId}
          projectId={section.projectId}
          count={section.groups.length}
        />
      )}
      <div className="divide-y divide-tint/[0.04]">
        {section.groups.map((group) => {
          const groupKey = group.correlationId ?? group.entries[0]!.id;
          const isDivider = dividerGroupId !== null && groupKey === dividerGroupId;
          return (
            <div key={groupKey}>
              {isDivider && <NewSinceLastLookedDivider />}
              {renderGroup(group, onDismiss)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderGroup(group: ThreadGroup, onDismiss: (id: string) => void) {
  if (group.correlationId && group.entries.length > 1) {
    return <NotificationThread key={group.correlationId} group={group} onDismiss={onDismiss} />;
  }
  const entry = group.entries[0]!;
  return (
    <NotificationCenterEntry
      key={entry.id}
      entry={entry}
      isNew={!entry.seenAsToast}
      onDismiss={() => onDismiss(entry.id)}
    />
  );
}

function ContextSectionHeader({
  worktreeId,
  projectId,
  count,
}: {
  worktreeId?: string;
  projectId?: string;
  count: number;
}) {
  const worktreeName = useWorktreeStore((s) =>
    worktreeId ? s.worktrees.get(worktreeId)?.name : undefined
  );
  const label = worktreeName ?? worktreeId ?? projectId ?? "Other";
  return (
    <div
      data-testid="context-section-header"
      className="flex items-center justify-between px-3 py-1 bg-overlay-subtle text-[10px] font-medium uppercase tracking-wide text-daintree-text/60"
    >
      <span className="truncate">{label}</span>
      <span aria-hidden="true" className="ml-2 shrink-0 text-daintree-text/40 tabular-nums">
        {count}
      </span>
    </div>
  );
}

function NewSinceLastLookedDivider() {
  return (
    <div
      data-testid="new-since-last-looked"
      className="flex items-center gap-2 px-3 py-1 text-[10px] font-medium text-daintree-text/50"
    >
      <span className="h-px flex-1 bg-divider" aria-hidden="true" />
      <span>New since you last looked</span>
      <span className="h-px flex-1 bg-divider" aria-hidden="true" />
    </div>
  );
}

function NotificationThread({
  group,
  onDismiss,
}: {
  group: ThreadGroup;
  onDismiss: (id: string) => void;
}) {
  const latest = group.entries[0];
  const isNew = group.entries.some((e) => !e.seenAsToast);

  if (!latest) return null;

  const displayType = getWorstSeverity(group.entries);

  return (
    <div data-testid="notification-thread" className="relative border-l-2 border-tint/15">
      <NotificationCenterEntry
        entry={latest}
        displayType={displayType}
        threadCount={group.entries.length}
        isNew={isNew}
        onDismiss={() => onDismiss(latest.id)}
      />
    </div>
  );
}
