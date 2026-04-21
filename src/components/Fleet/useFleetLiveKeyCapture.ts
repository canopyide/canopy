import { useEffect, useRef, type RefObject } from "react";
import { useFleetComposerStore } from "@/store/fleetComposerStore";
import { useNotificationStore } from "@/store/notificationStore";
import { logWarn } from "@/utils/logger";
import { needsFleetBroadcastConfirmation, resolveFleetBroadcastTargetIds } from "./fleetBroadcast";
import { broadcastFleetKeySequence, broadcastFleetLiteralPaste } from "./fleetExecution";

export interface FleetLiveKeyCaptureOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  enabled: boolean;
  onPasteConfirm: (text: string) => void;
  /**
   * Fired each time a keystroke or paste is dispatched to the armed targets.
   * Keystrokes are fire-and-forget (PTY writes don't resolve), so this signals
   * "dispatched to the broadcast layer", not "delivered". For paste, fires only
   * when at least one target accepted the payload.
   *
   * Called synchronously relative to the DOM event — safe to trigger imperative
   * animations from the callback.
   */
  onSend?: () => void;
}

/**
 * Map a DOM keydown event to the terminal byte sequence the PTY expects.
 * Returns null for modifier-only presses, meta-accelerators (Cmd/Win) that
 * should reach the browser, and keys we don't have a mapping for.
 *
 * Uses normal (not application) cursor mode for arrows — works for shells and
 * is tolerated by most TUIs. Application-mode tracking per-PTY is a later
 * refinement.
 */
export function mapKeyToSequence(event: KeyboardEvent): string | null {
  if (["Meta", "Control", "Alt", "Shift", "CapsLock"].includes(event.key)) return null;
  if (event.metaKey) return null;

  switch (event.key) {
    case "Enter":
      return "\r";
    case "Backspace":
      return "\x7f";
    case "Tab":
      return event.shiftKey ? "\x1b[Z" : "\t";
    case "Escape":
      return "\x1b";
    case "ArrowUp":
      return "\x1b[A";
    case "ArrowDown":
      return "\x1b[B";
    case "ArrowRight":
      return "\x1b[C";
    case "ArrowLeft":
      return "\x1b[D";
    case "Home":
      return "\x1b[H";
    case "End":
      return "\x1b[F";
    case "Delete":
      return "\x1b[3~";
    case "PageUp":
      return "\x1b[5~";
    case "PageDown":
      return "\x1b[6~";
    case "Insert":
      return "\x1b[2~";
  }

  if (event.ctrlKey && !event.altKey && event.key.length === 1) {
    const lower = event.key.toLowerCase();
    const code = lower.charCodeAt(0);
    if (code >= 0x61 && code <= 0x7a) {
      return String.fromCharCode(code - 0x60);
    }
    if (event.key === " ") return "\x00";
    if (event.key === "[") return "\x1b";
    if (event.key === "\\") return "\x1c";
    if (event.key === "]") return "\x1d";
  }

  if (event.altKey && !event.ctrlKey && event.key.length === 1) {
    return "\x1b" + event.key;
  }

  if (!event.ctrlKey && !event.altKey && event.key.length === 1) {
    return event.key;
  }

  // AltGr on Windows/Linux layouts synthesizes ctrlKey=true AND altKey=true;
  // the resulting event.key is the composed printable char (e.g. "@" on DE,
  // "{" on PL). Forward it as a literal keystroke.
  if (event.ctrlKey && event.altKey && event.key.length === 1) {
    const code = event.key.charCodeAt(0);
    if (code >= 0x20 && code !== 0x7f) return event.key;
  }

  return null;
}

/**
 * Update the visible draft buffer from a forwarded sequence. The draft is
 * feedback only — the source of truth is the remote PTYs — but mirroring
 * printable chars, Enter, and Backspace keeps the bar legible for the user
 * and drives the destructive-warning regex.
 */
function applySequenceToDraft(sequence: string): void {
  const { draft, setDraft } = useFleetComposerStore.getState();
  if (sequence === "\r") {
    setDraft(draft + "\n");
    return;
  }
  if (sequence === "\x7f") {
    if (draft.length > 0) setDraft(draft.slice(0, -1));
    return;
  }
  if (sequence.length === 1) {
    const code = sequence.charCodeAt(0);
    if (code >= 0x20 && code !== 0x7f) {
      setDraft(draft + sequence);
    }
  }
}

/**
 * Attach raw DOM listeners to the fleet composer textarea so every keydown,
 * IME composition, and paste is forwarded to all armed PTYs.
 *
 * The hook uses native addEventListener rather than React synthetic events so
 * `preventDefault()` reliably suppresses Tab focus movement, Enter newline
 * insertion, and Esc dismissal across Electron builds.
 */
export function useFleetLiveKeyCapture({
  textareaRef,
  enabled,
  onPasteConfirm,
  onSend,
}: FleetLiveKeyCaptureOptions): void {
  const isComposingRef = useRef(false);
  const onPasteConfirmRef = useRef(onPasteConfirm);
  onPasteConfirmRef.current = onPasteConfirm;
  // Ref-forward onSend so an inline callback at the call site doesn't force a
  // useEffect re-subscription on every parent render (the effect would tear
  // down and re-add native listeners, dropping in-flight composition state).
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  useEffect(() => {
    if (!enabled) return;
    const el = textareaRef.current;
    if (!el) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229 || isComposingRef.current) return;

      const sequence = mapKeyToSequence(event);
      if (sequence == null) return;

      event.preventDefault();
      event.stopPropagation();

      applySequenceToDraft(sequence);

      const targets = resolveFleetBroadcastTargetIds();
      broadcastFleetKeySequence(sequence, targets);
      // Fire the commit-flash signal only when at least one target received the
      // payload — a flash with no active targets would be misleading feedback.
      if (targets.length > 0) onSendRef.current?.();
    };

    const handleCompositionStart = () => {
      isComposingRef.current = true;
    };

    const handleCompositionEnd = (event: CompositionEvent) => {
      isComposingRef.current = false;
      const data = event.data ?? "";
      if (!data) return;

      const { draft, setDraft } = useFleetComposerStore.getState();
      setDraft(draft + data);

      const targets = resolveFleetBroadcastTargetIds();
      broadcastFleetKeySequence(data, targets);
      if (targets.length > 0) onSendRef.current?.();
    };

    const handlePaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain") ?? "";
      event.preventDefault();
      if (!text) return;

      if (needsFleetBroadcastConfirmation(text)) {
        onPasteConfirmRef.current(text);
        return;
      }

      const { draft, setDraft } = useFleetComposerStore.getState();
      setDraft(draft + text);

      const targets = resolveFleetBroadcastTargetIds();
      void (async () => {
        const result = await broadcastFleetLiteralPaste(text, targets);
        // Flash as soon as at least one target received the paste — parity with
        // the toast, which treats partial success as "sent". Total failure path
        // below skips the flash so the user isn't told a broken send succeeded.
        if (result.successCount > 0) onSendRef.current?.();
        if (result.failureCount === 0) return;
        logWarn("[FleetComposer] benign paste broadcast had rejections", {
          failureCount: result.failureCount,
          failedIds: result.failedIds,
        });
        useNotificationStore.getState().addNotification({
          type: result.successCount > 0 ? "warning" : "error",
          priority: "low",
          message:
            result.successCount > 0
              ? `Sent to ${result.successCount} agent${result.successCount === 1 ? "" : "s"} (${result.failureCount} failed)`
              : `Paste failed — no agents received the payload`,
        });
      })();
    };

    el.addEventListener("keydown", handleKeyDown);
    el.addEventListener("compositionstart", handleCompositionStart);
    el.addEventListener("compositionend", handleCompositionEnd);
    el.addEventListener("paste", handlePaste);

    return () => {
      el.removeEventListener("keydown", handleKeyDown);
      el.removeEventListener("compositionstart", handleCompositionStart);
      el.removeEventListener("compositionend", handleCompositionEnd);
      el.removeEventListener("paste", handlePaste);
      isComposingRef.current = false;
    };
  }, [enabled, textareaRef]);
}
