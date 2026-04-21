import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useFleetArmingStore } from "@/store/fleetArmingStore";
import { useFleetComposerStore } from "@/store/fleetComposerStore";
import { useCommandHistoryStore } from "@/store/commandHistoryStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useProjectStore } from "@/store/projectStore";
import { logWarn } from "@/utils/logger";
import {
  getFleetBroadcastHistoryKey,
  getFleetBroadcastWarnings,
  needsFleetBroadcastConfirmation,
  resolveFleetBroadcastTargetIds,
} from "./fleetBroadcast";
import { executeFleetBroadcast } from "./fleetExecution";
import { registerFleetComposerFocusHandler } from "./fleetComposerFocus";

interface WarningReason {
  key: "destructive" | "overByteLimit" | "multiline";
  label: string;
}

function describeWarnings(text: string): WarningReason[] {
  const w = getFleetBroadcastWarnings(text);
  const reasons: WarningReason[] = [];
  if (w.destructive) reasons.push({ key: "destructive", label: "destructive command detected" });
  if (w.overByteLimit) reasons.push({ key: "overByteLimit", label: "payload exceeds 512 bytes" });
  if (w.multiline) reasons.push({ key: "multiline", label: "multi-line payload" });
  return reasons;
}

export function FleetComposer(): ReactElement | null {
  const armedCount = useFleetArmingStore((s) => s.armedIds.size);
  const { draft, setDraft, clearDraft } = useFleetComposerStore(
    useShallow((s) => ({
      draft: s.draft,
      setDraft: s.setDraft,
      clearDraft: s.clearDraft,
    }))
  );

  const projectId = useProjectStore((s) => s.currentProject?.id);
  const historyKey = getFleetBroadcastHistoryKey(projectId);

  const historyEntries = useCommandHistoryStore(useShallow((s) => s.getProjectHistory(historyKey)));

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const historySnapshotRef = useRef<string>("");
  const submittingRef = useRef<boolean>(false);

  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    const unregister = registerFleetComposerFocusHandler(() => {
      textareaRef.current?.focus();
    });
    return () => {
      unregister();
    };
  }, []);

  useEffect(() => {
    if (isConfirming) {
      cancelButtonRef.current?.focus();
    }
  }, [isConfirming]);

  const warningReasons = useMemo(() => describeWarnings(draft), [draft]);

  const handleSubmit = useCallback(
    async (options: { force?: boolean } = {}) => {
      const { force = false } = options;
      if (submittingRef.current) return;

      const currentDraft = useFleetComposerStore.getState().draft;
      if (currentDraft.trim() === "") return;

      if (!force && needsFleetBroadcastConfirmation(currentDraft)) {
        setIsConfirming(true);
        return;
      }

      submittingRef.current = true;
      setIsConfirming(false);
      setIsSubmitting(true);

      try {
        const resolvedTargetIds = resolveFleetBroadcastTargetIds();
        if (resolvedTargetIds.length === 0) {
          useNotificationStore.getState().addNotification({
            type: "warning",
            priority: "low",
            message: "No armed agents available to send to",
          });
          return;
        }

        const result = await executeFleetBroadcast(currentDraft, resolvedTargetIds);

        if (result.failureCount > 0) {
          logWarn("[FleetComposer] broadcast submit had rejections", {
            failureCount: result.failureCount,
            failedIds: result.failedIds,
          });
        }

        useNotificationStore.getState().addNotification({
          type: result.successCount > 0 ? "success" : "warning",
          priority: "low",
          message:
            result.failureCount > 0
              ? `Sent to ${result.successCount} agent${result.successCount === 1 ? "" : "s"} (${result.failureCount} failed)`
              : `Sent to ${result.successCount} agent${result.successCount === 1 ? "" : "s"}`,
        });

        if (result.successCount > 0) {
          const armedIds = Array.from(useFleetArmingStore.getState().armedIds);
          useCommandHistoryStore
            .getState()
            .recordPrompt(historyKey, currentDraft, null, { armedIds });
          if (useFleetComposerStore.getState().draft === currentDraft) {
            clearDraft();
          }
          setHistoryIndex(-1);
          historySnapshotRef.current = "";
        }
      } catch (e) {
        useNotificationStore.getState().addNotification({
          type: "error",
          priority: "high",
          message: "Broadcast failed unexpectedly",
        });
        throw e;
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [clearDraft, historyKey]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return;

      if (e.key === "Escape") {
        if (draft.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          clearDraft();
          setHistoryIndex(-1);
          historySnapshotRef.current = "";
        }
        return;
      }

      if (e.key === "Enter") {
        if (e.shiftKey) return; // newline passthrough
        e.preventDefault();
        const force = e.metaKey || e.ctrlKey;
        void handleSubmit({ force });
        return;
      }

      if (e.key === "ArrowUp") {
        if (historyEntries.length === 0) return;
        const target = e.currentTarget;
        if (historyIndex === -1 && (target.selectionStart !== 0 || target.selectionEnd !== 0))
          return;
        e.preventDefault();
        if (historyIndex === -1) {
          historySnapshotRef.current = draft;
        }
        const next = Math.min(historyIndex + 1, historyEntries.length - 1);
        setHistoryIndex(next);
        const entry = historyEntries[next]!;
        setDraft(entry.prompt);
        // Shift+ArrowUp: also recall the armed IDs from this history entry
        if (e.shiftKey && entry.armedIds && entry.armedIds.length > 0) {
          useFleetArmingStore.getState().armIds(entry.armedIds);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        if (historyIndex < 0) return;
        e.preventDefault();
        const next = historyIndex - 1;
        setHistoryIndex(next);
        if (next < 0) {
          setDraft(historySnapshotRef.current);
          historySnapshotRef.current = "";
        } else {
          setDraft(historyEntries[next]!.prompt);
        }
      }
    },
    [clearDraft, draft, handleSubmit, historyEntries, historyIndex, setDraft]
  );

  const handleConfirmStripKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsConfirming(false);
      textareaRef.current?.focus();
    }
  }, []);

  if (armedCount === 0) return null;

  const sendLabel = isSubmitting ? "Sending…" : "Send";
  const placeholderBase =
    armedCount === 1
      ? "Broadcast to 1 armed agent (Enter to send)"
      : `Broadcast to ${armedCount} armed agents (Enter to send)`;

  return (
    <div
      className="flex flex-col gap-1 border-b border-daintree-border px-3 py-1.5"
      data-testid="fleet-composer"
    >
      <div className="flex items-start gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (historyIndex !== -1) {
              setHistoryIndex(-1);
              historySnapshotRef.current = "";
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholderBase}
          rows={1}
          inert={isConfirming ? true : undefined}
          aria-label="Broadcast to armed agents"
          data-testid="fleet-composer-textarea"
          className={cn(
            "flex-1 resize-none rounded-[var(--radius-md)] border border-daintree-border bg-daintree-sidebar px-2 py-1 text-[12px] text-daintree-text",
            "placeholder:italic placeholder:text-daintree-text/40",
            "focus:border-daintree-accent focus:outline-none focus:ring-1 focus:ring-daintree-accent/30",
            "min-h-[28px] max-h-[140px] overflow-y-auto"
          )}
        />
        <button
          type="button"
          onClick={() => void handleSubmit({ force: false })}
          disabled={draft.trim().length === 0 || isSubmitting}
          data-testid="fleet-composer-send"
          className="shrink-0 rounded-[var(--radius-md)] bg-daintree-accent px-2.5 py-1 text-[11px] text-text-inverse transition-colors hover:bg-daintree-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send broadcast"
        >
          {sendLabel}
        </button>
      </div>
      {isConfirming && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="fleet-composer-confirm"
          onKeyDown={handleConfirmStripKeyDown}
          className="flex items-center gap-2 rounded-[var(--radius-md)] border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200"
        >
          <span className="flex-1">
            Send to {armedCount} agent{armedCount === 1 ? "" : "s"} —{" "}
            {warningReasons.map((r) => r.label).join(", ")}?
          </span>
          <button
            type="button"
            ref={cancelButtonRef}
            onClick={() => {
              setIsConfirming(false);
              textareaRef.current?.focus();
            }}
            data-testid="fleet-composer-confirm-cancel"
            className="rounded-[var(--radius-md)] px-2 py-0.5 text-daintree-text/70 transition-colors hover:bg-tint/[0.08] hover:text-daintree-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleSubmit({ force: true })}
            data-testid="fleet-composer-confirm-send"
            className="rounded-[var(--radius-md)] bg-amber-500/20 px-2 py-0.5 text-amber-100 transition-colors hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send anyway
          </button>
        </div>
      )}
    </div>
  );
}
