import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useFleetArmingStore } from "@/store/fleetArmingStore";
import { useFleetComposerStore } from "@/store/fleetComposerStore";
import { logWarn } from "@/utils/logger";
import { useNotificationStore } from "@/store/notificationStore";
import { getFleetBroadcastWarnings, resolveFleetBroadcastTargetIds } from "./fleetBroadcast";
import { broadcastFleetLiteralPaste } from "./fleetExecution";
import { registerFleetComposerFocusHandler } from "./fleetComposerFocus";
import { useFleetLiveKeyCapture } from "./useFleetLiveKeyCapture";

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
  const { draft } = useFleetComposerStore(useShallow((s) => ({ draft: s.draft })));

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const flashOverlayRef = useRef<HTMLDivElement | null>(null);

  const [pendingPaste, setPendingPaste] = useState<string | null>(null);
  const [isSendingPaste, setIsSendingPaste] = useState(false);

  useEffect(() => {
    const unregister = registerFleetComposerFocusHandler(() => {
      textareaRef.current?.focus();
    });
    return () => {
      unregister();
    };
  }, []);

  useEffect(() => {
    if (pendingPaste !== null) {
      cancelButtonRef.current?.focus();
    }
  }, [pendingPaste]);

  const handlePasteConfirm = useCallback((text: string) => {
    setPendingPaste(text);
  }, []);

  // Commit-flash: 200ms opacity pulse on the bar's border overlay, fired each
  // time a keystroke or paste is dispatched to armed targets. Uses WAAPI so
  // high-frequency keystrokes don't trigger React reconciliation. The overlay
  // div is always mounted — we toggle opacity via animation, not element key.
  const triggerCommitFlash = useCallback(() => {
    const el = flashOverlayRef.current;
    if (!el) return;
    // Honor both the OS-level and the Daintree-level reduced-motion switches.
    // Matches the selector-pair used in index.css for the CSS-class variants.
    const body = typeof document !== "undefined" ? document.body : null;
    if (
      (typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) ||
      body?.dataset.reduceAnimations === "true"
    ) {
      return;
    }
    if (typeof el.animate !== "function") return;
    // Cancel any in-flight flash before restarting so rapid keystrokes don't
    // stack. `getAnimations()` is cheaper than the `void offsetWidth` reflow
    // trick and avoids a synchronous layout.
    if (typeof el.getAnimations === "function") {
      for (const anim of el.getAnimations()) anim.cancel();
    }
    el.animate([{ opacity: 0 }, { opacity: 0.55 }, { opacity: 0 }], {
      duration: 200,
      easing: "ease-out",
      fill: "both",
    });
  }, []);

  useFleetLiveKeyCapture({
    textareaRef,
    enabled: armedCount > 0,
    onPasteConfirm: handlePasteConfirm,
    onSend: triggerCommitFlash,
  });

  const typedWarnings = useMemo(() => describeWarnings(draft), [draft]);
  const pasteWarnings = useMemo(
    () => (pendingPaste !== null ? describeWarnings(pendingPaste) : []),
    [pendingPaste]
  );

  const visibleWarnings = pendingPaste !== null ? pasteWarnings : typedWarnings;

  const cancelPendingPaste = useCallback(() => {
    setPendingPaste(null);
    textareaRef.current?.focus();
  }, []);

  const confirmPendingPaste = useCallback(async () => {
    const text = pendingPaste;
    if (text == null || isSendingPaste) return;
    setIsSendingPaste(true);
    try {
      const targets = resolveFleetBroadcastTargetIds();
      if (targets.length === 0) {
        useNotificationStore.getState().addNotification({
          type: "warning",
          priority: "low",
          message: "No armed agents available to send to",
        });
        return;
      }

      const { draft: currentDraft, setDraft } = useFleetComposerStore.getState();
      setDraft(currentDraft + text);

      const result = await broadcastFleetLiteralPaste(text, targets);
      if (result.successCount > 0) triggerCommitFlash();
      if (result.failureCount > 0) {
        logWarn("[FleetComposer] paste broadcast had rejections", {
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
    } finally {
      setIsSendingPaste(false);
      setPendingPaste(null);
      textareaRef.current?.focus();
    }
  }, [pendingPaste, isSendingPaste, triggerCommitFlash]);

  const handleConfirmStripKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelPendingPaste();
      }
    },
    [cancelPendingPaste]
  );

  if (armedCount === 0) return null;

  const placeholder =
    armedCount === 1
      ? "Live broadcast — keys reach 1 armed agent immediately"
      : `Live broadcast — keys reach ${armedCount} armed agents immediately`;

  return (
    <div
      className="relative flex flex-col gap-1 border-b border-daintree-border px-3 py-1.5"
      data-testid="fleet-composer"
    >
      {/* Commit-flash overlay. Compositor-only opacity animation via WAAPI —
       * never re-rendered by React (opacity lives on the DOM node). Covers the
       * composer's bottom edge so a successful send reads as "the input line
       * glowed." `pointer-events-none` so it never intercepts clicks; Tailwind
       * arbitrary-value `border-b-2` gives us the 2px accent edge. */}
      <div
        ref={flashOverlayRef}
        aria-hidden="true"
        data-testid="fleet-composer-commit-flash"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-[var(--color-accent-primary)]"
        style={{ opacity: 0, willChange: "opacity" }}
      />
      <div className="flex items-start gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          readOnly
          placeholder={placeholder}
          rows={1}
          aria-label="Live broadcast to armed agents"
          data-testid="fleet-composer-textarea"
          data-live="true"
          className={cn(
            "flex-1 resize-none rounded-[var(--radius-md)] border border-daintree-border bg-daintree-sidebar px-2 py-1 text-[12px] text-daintree-text",
            "placeholder:italic placeholder:text-daintree-text/40",
            "focus:border-daintree-accent focus:outline-none focus:ring-1 focus:ring-daintree-accent/30",
            "min-h-[28px] max-h-[140px] overflow-y-auto cursor-text"
          )}
        />
        <span
          data-testid="fleet-composer-live-indicator"
          aria-hidden="true"
          className="shrink-0 select-none rounded-[var(--radius-md)] bg-daintree-accent/15 px-2 py-1 text-[11px] font-medium text-daintree-accent"
        >
          Live
        </span>
      </div>
      {visibleWarnings.length > 0 && (
        <div
          role={pendingPaste !== null ? "alertdialog" : "status"}
          aria-live="polite"
          aria-atomic="true"
          data-testid="fleet-composer-confirm"
          data-mode={pendingPaste !== null ? "paste-confirm" : "passive"}
          onKeyDown={handleConfirmStripKeyDown}
          className="flex items-center gap-2 rounded-[var(--radius-md)] border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200"
        >
          <span className="flex-1">
            {pendingPaste !== null
              ? `Paste to ${armedCount} agent${armedCount === 1 ? "" : "s"} — ${visibleWarnings.map((r) => r.label).join(", ")}?`
              : visibleWarnings.map((r) => r.label).join(", ")}
          </span>
          {pendingPaste !== null && (
            <>
              <button
                type="button"
                ref={cancelButtonRef}
                onClick={cancelPendingPaste}
                data-testid="fleet-composer-confirm-cancel"
                className="rounded-[var(--radius-md)] px-2 py-0.5 text-daintree-text/70 transition-colors hover:bg-tint/[0.08] hover:text-daintree-text"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSendingPaste}
                onClick={() => void confirmPendingPaste()}
                data-testid="fleet-composer-confirm-send"
                className="rounded-[var(--radius-md)] bg-amber-500/20 px-2 py-0.5 text-amber-100 transition-colors hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send anyway
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
