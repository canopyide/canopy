import { useEffect } from "react";
import type { EditorView } from "@codemirror/view";
import { useVoiceRecordingStore } from "@/store";
import { setInterimRange, setPendingAIRanges } from "../inputEditorExtensions";

interface UseVoiceDecorationsParams {
  terminalId: string;
  editorViewRef: React.RefObject<EditorView | null>;
  voiceDraftRevision: number;
}

export function useVoiceDecorations({
  terminalId,
  editorViewRef,
  voiceDraftRevision,
}: UseVoiceDecorationsParams) {
  const transcriptPhase = useVoiceRecordingStore(
    (s) => s.panelBuffers[terminalId]?.transcriptPhase ?? "idle"
  );
  const liveSegmentStart = useVoiceRecordingStore(
    (s) => s.panelBuffers[terminalId]?.draftLengthAtSegmentStart ?? -1
  );
  const correctionRange = useVoiceRecordingStore(
    (s) => s.panelBuffers[terminalId]?.correctionRange ?? null
  );

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    const docLen = view.state.doc.length;
    const interimRange =
      transcriptPhase === "interim" && liveSegmentStart >= 0 && liveSegmentStart < docLen
        ? { from: liveSegmentStart, to: docLen }
        : null;

    // The whole-passage AI cleanup pass marks its range with a dotted underline
    // (`cm-voice-pending-ai`) so the user sees correction is in flight.
    const pendingRanges =
      correctionRange &&
      correctionRange.from >= 0 &&
      correctionRange.to <= docLen &&
      correctionRange.from < correctionRange.to
        ? [correctionRange]
        : [];

    view.dispatch({
      effects: [setInterimRange.of(interimRange), setPendingAIRanges.of(pendingRanges)],
    });
  }, [transcriptPhase, voiceDraftRevision, liveSegmentStart, correctionRange, editorViewRef]);
}
