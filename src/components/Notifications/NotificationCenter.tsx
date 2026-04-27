import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { Bell, CheckCheck, Clock, Moon, Sunrise, Trash2, X } from "lucide-react";
import {
  useNotificationHistoryStore,
  type NotificationHistoryEntry,
} from "@/store/slices/notificationHistorySlice";
import { NotificationCenterEntry } from "./NotificationCenterEntry";
import { Button } from "@/components/ui/button";
import { actionService } from "@/services/ActionService";
import {
  _muteStore,
  clearSessionMute,
  isScheduledQuietHours,
  muteForDuration,
  muteUntilNextMorning,
  notify,
} from "@/lib/notify";
import { useEscapeStack } from "@/hooks/useEscapeStack";
import { cn } from "@/lib/utils";
import type { NotificationType } from "@/store/notificationStore";

const SEVERITY_WEIGHTS: Record<NotificationType, number> = {
  error: 3,
  warning: 2,
  info: 1,
  success: 0,
} as const;

function getWorstSeverity(entries: NotificationHistoryEntry[]): NotificationType {
  if (entries.length === 0) return "success";
  return entries.reduce((highest, current) =>
    SEVERITY_WEIGHTS[current.type] > SEVERITY_WEIGHTS[highest.type] ? current : highest
  ).type;
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

function formatTimeOfDay(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(ts)
  );
}

export function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const entries = useNotificationHistoryStore((s) => s.entries);
  const unreadCount = useNotificationHistoryStore((s) => s.unreadCount);
  const clearAll = useNotificationHistoryStore((s) => s.clearAll);
  const markAllRead = useNotificationHistoryStore((s) => s.markAllRead);
  const dismissEntry = useNotificationHistoryStore((s) => s.dismissEntry);
  const quietUntil = useStore(_muteStore, (s) => s.quietUntil);

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [frozenUnreadIds, setFrozenUnreadIds] = useState<Set<string> | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const pauseAnchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      setFrozenUnreadIds(null);
      setPauseOpen(false);
    }
  }, [open]);

  // Refresh once a minute while open so the muted pill auto-clears on expiry
  // and the "Muted until 8:00" label stays current. Poll-while-open keeps the
  // cost off the closed-state idle path. Lesson #4595.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [open]);

  useEscapeStack(open && pauseOpen, () => setPauseOpen(false));

  const sessionMuted = quietUntil > now;
  const scheduledQuiet = useMemo(() => isScheduledQuietHours(new Date(now)), [now]);
  const muteActive = sessionMuted || scheduledQuiet;
  const muteLabel = sessionMuted
    ? `Muted until ${formatTimeOfDay(quietUntil)}`
    : scheduledQuiet
      ? "Quiet hours"
      : "";

  const filteredEntries = useMemo(() => {
    if (filter === "all") return entries;
    if (frozenUnreadIds) {
      return entries.filter((e) => !e.seenAsToast || frozenUnreadIds.has(e.id));
    }
    return entries.filter((e) => !e.seenAsToast);
  }, [entries, filter, frozenUnreadIds]);

  const groups = useMemo(() => groupByCorrelationId(filteredEntries), [filteredEntries]);

  const handleMarkAllRead = () => {
    if (filter === "unread") {
      setFrozenUnreadIds(new Set(entries.filter((e) => !e.seenAsToast).map((e) => e.id)));
    }
    markAllRead();
  };

  const handleMuteFor = (durationMs: number, label: string) => {
    muteForDuration(durationMs);
    setPauseOpen(false);
    notify({
      type: "info",
      message: `Notifications muted ${label}`,
      priority: "low",
      urgent: true,
      countable: false,
    });
  };

  const handleMuteUntilMorning = () => {
    const until = muteUntilNextMorning();
    setPauseOpen(false);
    notify({
      type: "info",
      message: `Notifications muted until ${formatTimeOfDay(until)}`,
      priority: "low",
      urgent: true,
      countable: false,
    });
  };

  const openSettings = () => {
    setPauseOpen(false);
    onClose();
    void actionService.dispatch(
      "app.settings.openTab",
      { tab: "notifications" },
      { source: "user" }
    );
  };

  return (
    <div className="w-[360px] max-h-[420px] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-divider">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium text-daintree-text/80">Notifications</span>
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
          <MuteStatePill
            visible={muteActive}
            label={muteLabel}
            canResume={sessionMuted}
            onResume={clearSessionMute}
          />
        </div>
        <div className="flex items-center gap-1">
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
          <div className="relative">
            <Button
              ref={pauseAnchorRef}
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setPauseOpen((o) => !o)}
              className={cn(
                "text-daintree-text/50",
                muteActive && "text-daintree-text/80",
                pauseOpen && "bg-overlay-soft text-daintree-text"
              )}
              aria-label="Pause notifications"
              aria-haspopup="menu"
              aria-expanded={pauseOpen}
              title="Pause notifications"
            >
              <Moon />
            </Button>
            {pauseOpen && (
              <PausePopover
                anchorRef={pauseAnchorRef}
                onClose={() => setPauseOpen(false)}
                onMuteFor={handleMuteFor}
                onMuteUntilMorning={handleMuteUntilMorning}
                onOpenSettings={openSettings}
              />
            )}
          </div>
          {entries.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                clearAll();
                onClose();
              }}
              className="text-daintree-text/50"
            >
              <Trash2 />
              Clear all
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-daintree-text/30">
            <Bell className="h-6 w-6 mb-2" />
            <span className="text-xs">
              {filter === "unread" && entries.length > 0
                ? "You're all caught up"
                : "No notifications yet"}
            </span>
          </div>
        ) : (
          <div className="divide-y divide-tint/[0.04]">
            {groups.map((group) =>
              group.correlationId && group.entries.length > 1 ? (
                <NotificationThread
                  key={group.correlationId}
                  group={group}
                  onDismiss={dismissEntry}
                />
              ) : (
                <NotificationCenterEntry
                  key={group.entries[0]!.id}
                  entry={group.entries[0]!}
                  isNew={!group.entries[0]!.seenAsToast}
                  onDismiss={() => dismissEntry(group.entries[0]!.id)}
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MuteStatePill({
  visible,
  label,
  canResume,
  onResume,
}: {
  visible: boolean;
  label: string;
  canResume: boolean;
  onResume: () => void;
}) {
  // `invisible` keeps the slot reserved so toggling on/off doesn't reflow the
  // header (filter pills / Pause button stay put). The width cap protects the
  // row from runaway labels.
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md bg-overlay-medium px-1.5 py-0.5 text-[10px] font-medium text-daintree-text/70 max-w-[160px]",
        visible ? "visible" : "invisible"
      )}
      aria-hidden={!visible}
      data-testid="notification-mute-pill"
    >
      <span className="truncate">{label || "—"}</span>
      {canResume && (
        <button
          type="button"
          onClick={onResume}
          className="-mr-0.5 rounded-sm p-0.5 text-daintree-text/60 hover:bg-overlay-soft hover:text-daintree-text"
          aria-label="Resume notifications"
          tabIndex={visible ? 0 : -1}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function PausePopover({
  anchorRef,
  onClose,
  onMuteFor,
  onMuteUntilMorning,
  onOpenSettings,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onMuteFor: (durationMs: number, label: string) => void;
  onMuteUntilMorning: () => void;
  onOpenSettings: () => void;
}) {
  // Positioned absolutely inside the NotificationCenter DOM tree (no portal).
  // `FixedDropdown` guards outside-click via `contentRef.contains()`, so any
  // portaled popover would close the parent dropdown when clicked. Keeping
  // the panel inside the same node tree avoids that collision.
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (panelRef.current?.contains(target)) return;
      // Skip the trigger button — its onClick toggles us closed already, and
      // closing here would race with the click handler reopening us.
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [anchorRef, onClose]);

  return (
    <div
      ref={panelRef}
      role="menu"
      className="absolute right-0 top-full mt-1 z-10 w-[200px] rounded-md surface-overlay shadow-overlay border border-divider py-1 text-xs"
      data-testid="notification-pause-popover"
    >
      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-daintree-text/40">
        Pause notifications
      </div>
      <PauseOption
        icon={<Clock className="h-3.5 w-3.5" />}
        label="For 1 hour"
        onClick={() => onMuteFor(60 * 60 * 1000, "for 1h")}
      />
      <PauseOption
        icon={<Sunrise className="h-3.5 w-3.5" />}
        label="Until 8:00 AM"
        onClick={onMuteUntilMorning}
      />
      <PauseOption
        icon={<Moon className="h-3.5 w-3.5" />}
        label="Custom…"
        onClick={onOpenSettings}
      />
      <div className="my-1 border-t border-divider" />
      <button
        type="button"
        role="menuitem"
        onClick={onOpenSettings}
        className="flex w-full items-center justify-between px-2 py-1.5 text-left text-daintree-text/70 hover:bg-overlay-soft hover:text-daintree-text"
      >
        <span>Notification settings</span>
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

function PauseOption({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-daintree-text/70 hover:bg-overlay-soft hover:text-daintree-text"
    >
      <span className="text-daintree-text/50">{icon}</span>
      <span>{label}</span>
    </button>
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
    <div className="relative">
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
