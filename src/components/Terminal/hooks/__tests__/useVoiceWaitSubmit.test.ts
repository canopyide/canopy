import { describe, it, expect, beforeEach, vi } from "vitest";
import { useTerminalInputStore } from "@/store/terminalInputStore";

vi.mock("@/services/VoiceRecordingService", () => ({
  voiceRecordingService: { stop: vi.fn().mockResolvedValue(undefined) },
}));

const PANEL_ID = "test-panel";

describe("terminalInputStore voiceSubmitting", () => {
  beforeEach(() => {
    useTerminalInputStore.setState({ voiceSubmittingPanels: new Set() });
  });

  it("setVoiceSubmitting adds and removes panels", () => {
    const store = useTerminalInputStore.getState();

    store.setVoiceSubmitting(PANEL_ID, true);
    expect(useTerminalInputStore.getState().isVoiceSubmitting(PANEL_ID)).toBe(true);

    store.setVoiceSubmitting(PANEL_ID, false);
    expect(useTerminalInputStore.getState().isVoiceSubmitting(PANEL_ID)).toBe(false);
  });

  it("clearTerminalState clears voiceSubmitting", () => {
    useTerminalInputStore.getState().setVoiceSubmitting(PANEL_ID, true);
    useTerminalInputStore.getState().clearTerminalState(PANEL_ID);
    expect(useTerminalInputStore.getState().isVoiceSubmitting(PANEL_ID)).toBe(false);
  });

  it("does not trigger unnecessary state updates", () => {
    const store = useTerminalInputStore.getState();
    store.setVoiceSubmitting(PANEL_ID, false);
    const before = useTerminalInputStore.getState().voiceSubmittingPanels;
    store.setVoiceSubmitting(PANEL_ID, false);
    const after = useTerminalInputStore.getState().voiceSubmittingPanels;
    expect(before).toBe(after);
  });
});
