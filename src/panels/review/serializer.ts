import type { ReviewPanelData } from "@shared/types/panel";
import type { PanelSnapshot } from "@shared/types/project";

// Review panels persist nothing beyond BasePanelData — the worktree path is
// resolved fresh from the worktree store at render time, so there is no kind-
// specific snapshot fragment.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function serializeReview(_panel: ReviewPanelData): Partial<PanelSnapshot> {
  return {};
}
