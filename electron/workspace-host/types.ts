import type { WorktreeSnapshot } from "../../shared/types/workspace-host.js";
import type { AdaptivePollingStrategy, NoteFileReader } from "../services/worktree/index.js";

export const NOTE_PATH = "canopy/note";

export interface MonitorState extends WorktreeSnapshot {
  pollingTimer: NodeJS.Timeout | null;
  resumeTimer: NodeJS.Timeout | null;
  pollingInterval: number;
  isRunning: boolean;
  isUpdating: boolean;
  pollingEnabled: boolean;
  previousStateHash: string;
  pollingStrategy: AdaptivePollingStrategy;
  noteReader: NoteFileReader;
}
