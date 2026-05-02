import { useEffect, useRef, useState } from "react";

/**
 * Tracks input-time pings against a card's terminals and emits a monotonically
 * increasing key whenever `pingedId` transitions to one of `terminalIds`.
 * Consumers mount a keyed overlay element on the returned key so each ping
 * replays the one-shot CSS animation. Null clears (the 1.6s timeout end) are
 * intentionally ignored — the receipt acknowledges input, not its absence.
 *
 * `terminalIds` reference instability is tolerated: the prev-pingedId guard
 * means re-runs of the effect with the same `pingedId` are no-ops.
 */
export function useInputReceiptKey(
  pingedId: string | null,
  terminalIds: readonly string[]
): number {
  const [receiptKey, setReceiptKey] = useState(0);
  const prevPingedRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevPingedRef.current;
    prevPingedRef.current = pingedId;
    if (pingedId && pingedId !== prev && terminalIds.includes(pingedId)) {
      setReceiptKey((k) => k + 1);
    }
  }, [pingedId, terminalIds]);

  return receiptKey;
}
