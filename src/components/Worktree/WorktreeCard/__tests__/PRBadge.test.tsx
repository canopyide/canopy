/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return { ...actual, createPortal: (children: ReactNode) => children };
});

let mockMissingToken = false;

vi.mock("@/hooks/useGitHubTooltip", () => ({
  usePRTooltip: () => ({
    data: null,
    loading: false,
    error: null,
    missingToken: mockMissingToken,
    fetchTooltip: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock("../hooks/useGitHubBadgeTooltip", () => ({
  useGitHubBadgeTooltip: () => ({
    isOpen: true,
    handleOpenChange: vi.fn(),
    handleClick: vi.fn(),
  }),
}));

vi.mock("../hooks/useGitHubBadgeFreshness", () => ({
  useGitHubBadgeFreshness: () => ({
    freshnessLevel: "fresh",
    cacheLastUpdatedAt: null,
    now: Date.now(),
  }),
}));

import { PRBadge } from "../PRBadge";

function renderBadge(extra: Partial<Parameters<typeof PRBadge>[0]> = {}) {
  return render(
    <TooltipProvider>
      <PRBadge
        prNumber={42}
        prState="open"
        isSubordinate={false}
        worktreePath="/repo"
        isActive
        {...extra}
      />
    </TooltipProvider>
  );
}

describe("PRBadge circuit-breaker glyph", () => {
  beforeEach(() => {
    mockMissingToken = false;
  });

  it("shows the CloudOff glyph and tooltip line when prDetectionPaused is true", () => {
    const { container } = renderBadge({ prDetectionPaused: true });

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toContain("PR detection paused");
    // The CloudOff lucide icon must actually render in the badge button.
    expect(button.querySelector(".lucide-cloud-off")).toBeTruthy();
    // Radix renders tooltip content plus a visually-hidden a11y duplicate.
    expect(screen.getAllByText("PR detection paused — retrying").length).toBeGreaterThan(0);
    expect(container).toBeTruthy();
  });

  it("does not show the glyph or tooltip line when prDetectionPaused is false", () => {
    renderBadge({ prDetectionPaused: false });

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).not.toContain("PR detection paused");
    expect(button.querySelector(".lucide-cloud-off")).toBeNull();
    expect(screen.queryByText("PR detection paused — retrying")).toBeNull();
  });

  it("does not show the glyph when prDetectionPaused is undefined", () => {
    renderBadge();

    expect(screen.queryByText("PR detection paused — retrying")).toBeNull();
  });

  it("keeps the badge button at full opacity (no dimming classes)", () => {
    renderBadge({ prDetectionPaused: true });

    const button = screen.getByRole("button");
    expect(button.className).not.toMatch(/opacity-/);
  });

  it("suppresses the paused signal when the GitHub token is missing", () => {
    mockMissingToken = true;
    renderBadge({ prDetectionPaused: true });

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).not.toContain("PR detection paused");
    expect(screen.queryByText("PR detection paused — retrying")).toBeNull();
  });
});
