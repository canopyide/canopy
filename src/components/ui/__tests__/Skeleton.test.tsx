// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { Skeleton, SkeletonBone, SkeletonText } from "../Skeleton";

describe("Skeleton", () => {
  describe("ARIA contract", () => {
    it('uses role="status" on the wrapper', () => {
      render(
        <Skeleton>
          <SkeletonBone />
        </Skeleton>
      );
      expect(screen.getByRole("status")).toBeTruthy();
    });

    it('sets aria-live="polite" and aria-busy="true"', () => {
      render(<Skeleton />);
      const status = screen.getByRole("status");
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.getAttribute("aria-busy")).toBe("true");
    });

    it("uses default label when none provided", () => {
      render(<Skeleton />);
      const status = screen.getByRole("status");
      expect(status.getAttribute("aria-label")).toBe("Loading");
      expect(status.querySelector(".sr-only")?.textContent).toBe("Loading");
    });

    it("respects a custom label", () => {
      render(<Skeleton label="Loading commits" />);
      const status = screen.getByRole("status");
      expect(status.getAttribute("aria-label")).toBe("Loading commits");
      expect(status.querySelector(".sr-only")?.textContent).toBe("Loading commits");
    });

    it("hides the bone container from assistive tech", () => {
      const { container } = render(
        <Skeleton>
          <SkeletonBone data-testid="bone" />
        </Skeleton>
      );
      const hidden = container.querySelector('[aria-hidden="true"]');
      expect(hidden).toBeTruthy();
      expect(hidden?.querySelector('[data-testid="bone"]')).toBeTruthy();
    });
  });

  describe("inert mode", () => {
    it("renders only an aria-hidden wrapper without status semantics", () => {
      const { container } = render(
        <Skeleton inert>
          <SkeletonBone />
        </Skeleton>
      );
      expect(screen.queryByRole("status")).toBeNull();
      const root = container.firstElementChild;
      expect(root?.getAttribute("aria-hidden")).toBe("true");
    });

    it("does not render the sr-only label when inert", () => {
      const { container } = render(<Skeleton inert label="Loading" />);
      expect(container.querySelector(".sr-only")).toBeNull();
    });
  });

  describe("className passthrough", () => {
    it("merges custom className on the wrapper", () => {
      render(<Skeleton className="my-skeleton" />);
      expect(screen.getByRole("status").className).toContain("my-skeleton");
    });
  });
});

describe("SkeletonBone", () => {
  it("is aria-hidden and carries the muted background", () => {
    const { container } = render(<SkeletonBone />);
    const bone = container.firstElementChild as HTMLElement;
    expect(bone.getAttribute("aria-hidden")).toBe("true");
    expect(bone.className).toContain("bg-muted");
  });

  it("uses animate-pulse-delayed by default", () => {
    const { container } = render(<SkeletonBone />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "animate-pulse-delayed"
    );
  });

  it("switches to animate-pulse-immediate when immediate is set", () => {
    const { container } = render(<SkeletonBone immediate />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("animate-pulse-immediate");
    expect(cls).not.toContain("animate-pulse-delayed");
  });

  it("does not include shimmer class by default", () => {
    const { container } = render(<SkeletonBone />);
    expect((container.firstElementChild as HTMLElement).className).not.toContain(
      "animate-skeleton-shimmer"
    );
  });

  it("adds animate-skeleton-shimmer when shimmer is set", () => {
    const { container } = render(<SkeletonBone shimmer />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "animate-skeleton-shimmer"
    );
  });

  it("applies a fixed pixel height when heightPx is provided", () => {
    const { container } = render(<SkeletonBone heightPx={68} />);
    expect((container.firstElementChild as HTMLElement).style.height).toBe("68px");
  });

  it("merges custom className", () => {
    const { container } = render(<SkeletonBone className="w-12 h-4" />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("w-12");
    expect(cls).toContain("h-4");
  });
});

describe("SkeletonText", () => {
  it("renders 3 lines by default", () => {
    const { container } = render(<SkeletonText />);
    expect(container.firstElementChild?.children.length).toBe(3);
  });

  it("renders the requested line count", () => {
    const { container } = render(<SkeletonText lines={5} />);
    expect(container.firstElementChild?.children.length).toBe(5);
  });

  it("clamps negative line counts to 0", () => {
    const { container } = render(<SkeletonText lines={-2} />);
    expect(container.firstElementChild?.children.length).toBe(0);
  });

  it("clamps non-finite line counts to 0", () => {
    const { container } = render(<SkeletonText lines={Number.NaN} />);
    expect(container.firstElementChild?.children.length).toBe(0);
  });

  it("floors fractional line counts", () => {
    const { container } = render(<SkeletonText lines={3.9} />);
    expect(container.firstElementChild?.children.length).toBe(3);
  });

  it("cycles widths through [w-full, w-3/4, w-1/2]", () => {
    const { container } = render(<SkeletonText lines={4} />);
    const lines = Array.from(container.firstElementChild?.children ?? []);
    expect(lines[0]?.className).toContain("w-full");
    expect(lines[1]?.className).toContain("w-3/4");
    expect(lines[2]?.className).toContain("w-1/2");
    expect(lines[3]?.className).toContain("w-full");
  });

  it("is aria-hidden on the container", () => {
    const { container } = render(<SkeletonText lines={1} />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("uses animate-pulse-delayed by default on each line", () => {
    const { container } = render(<SkeletonText lines={2} />);
    Array.from(container.firstElementChild?.children ?? []).forEach((line) => {
      expect((line as HTMLElement).className).toContain("animate-pulse-delayed");
    });
  });

  it("switches to animate-pulse-immediate when immediate is set", () => {
    const { container } = render(<SkeletonText lines={2} immediate />);
    Array.from(container.firstElementChild?.children ?? []).forEach((line) => {
      expect((line as HTMLElement).className).toContain("animate-pulse-immediate");
    });
  });

  it("layers shimmer on each line when shimmer is set", () => {
    const { container } = render(<SkeletonText lines={2} shimmer />);
    Array.from(container.firstElementChild?.children ?? []).forEach((line) => {
      expect((line as HTMLElement).className).toContain("animate-skeleton-shimmer");
    });
  });

  it("respects custom line height and gap classes", () => {
    const { container } = render(
      <SkeletonText lines={2} lineHeightClassName="h-6" gapClassName="space-y-4" />
    );
    expect(container.firstElementChild?.className).toContain("space-y-4");
    Array.from(container.firstElementChild?.children ?? []).forEach((line) => {
      expect((line as HTMLElement).className).toContain("h-6");
    });
  });

  it("does not use transition-all", () => {
    const { container } = render(<SkeletonText lines={3} />);
    expect(container.innerHTML).not.toContain("transition-all");
  });
});
