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

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    const docLen = view.state.doc.length;
    const interimRange =
      transcriptPhase === "interim" && liveSegmentStart >= 0 && liveSegmentStart < docLen
        ? { from: liveSegmentStart, to: docLen }
        : null;

    view.dispatch({
      effects: [setInterimRange.of(interimRange), setPendingAIRanges.of([])],
    });
  }, [transcriptPhase, voiceDraftRevision, liveSegmentStart, editorViewRef]);
}
