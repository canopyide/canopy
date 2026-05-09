import { useEffect, useRef, useState } from "react";

/**
 * Tracks input-time pings against a card's terminals and emits a monotonically
 * increasing key whenever a new ping (`pingSeq` advanced) targets one of
 * `terminalIds`. Consumers mount a keyed overlay element on the returned key
 * so each ping replays the one-shot CSS animation. Null clears (the 1.6s
 * timeout end) are intentionally ignored — the receipt acknowledges input,
 * not its absence.
 *
 * `pingSeq` (rather than `pingedId` alone) is the authoritative trigger:
 * tapping the same row twice within the live window holds `pingedId` constant
 * but advances `pingSeq`, so both taps produce a receipt. `terminalIds`
 * reference instability is tolerated — only the seq drives an increment.
 */
export function useInputReceiptKey(
  pingedId: string | null,
  pingSeq: number,
  terminalIds: readonly string[]
): number {
  const [receiptKey, setReceiptKey] = useState(0);
  const prevSeqRef = useRef(pingSeq);

  useEffect(() => {
    const prev = prevSeqRef.current;
    prevSeqRef.current = pingSeq;
    if (pingSeq !== prev && pingedId && terminalIds.includes(pingedId)) {
      setReceiptKey((k) => k + 1);
    }
  }, [pingSeq, pingedId, terminalIds]);

  return receiptKey;
}
