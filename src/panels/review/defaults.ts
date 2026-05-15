import type { ReviewPanelData } from "@shared/types/panel";
import type { ReviewPanelOptions } from "@shared/types/addPanelOptions";

// Review panels have no kind-specific defaults — id/title/location/worktreeId
// are filled in by addTerminal from the common base.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createReviewDefaults(_options: ReviewPanelOptions): Partial<ReviewPanelData> {
  return {};
}
