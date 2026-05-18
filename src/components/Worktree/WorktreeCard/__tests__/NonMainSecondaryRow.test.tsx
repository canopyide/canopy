/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { WorktreeState } from "@/types";
import { usePRCircuitBreakerStore } from "@/store/prCircuitBreakerStore";

const prBadgeProps: Array<Record<string, unknown>> = [];

vi.mock("../PRBadge", () => ({
  PRBadge: (props: Record<string, unknown>) => {
    prBadgeProps.push(props);
    return <div data-testid="pr-badge" />;
  },
}));

import { NonMainSecondaryRow } from "../NonMainSecondaryRow";

const worktree = {
  id: "wt-1",
  path: "/repo",
  name: "feature",
  branch: "feature/test",
  prNumber: 42,
  prState: "open",
  linked: {
    providerId: "github",
    pr: {
      ref: { providerId: "github", owner: "test", repo: "test", number: 42, rawData: {} },
      state: "open",
      url: "https://github.com/test/repo/pull/42",
    },
  },
} as unknown as WorktreeState;

function renderRow() {
  return render(
    <NonMainSecondaryRow
      worktree={worktree}
      branchLabel="feature/test"
      isActive
      underlineOnHover={false}
      hasUpstreamDelta={false}
      hasAuthFailedSignIn={false}
      hasIssueTitle={false}
      hasPlanFile={false}
      badges={{}}
    />
  );
}

describe("NonMainSecondaryRow → PRBadge circuit-breaker wiring", () => {
  beforeEach(() => {
    prBadgeProps.length = 0;
    usePRCircuitBreakerStore.setState({ tripped: false });
  });

  it("passes prDetectionPaused=false when the breaker is not tripped", () => {
    renderRow();
    expect(prBadgeProps.at(-1)?.prDetectionPaused).toBe(false);
  });

  it("passes prDetectionPaused=true when the breaker is tripped", () => {
    usePRCircuitBreakerStore.setState({ tripped: true });
    renderRow();
    expect(prBadgeProps.at(-1)?.prDetectionPaused).toBe(true);
  });
});
