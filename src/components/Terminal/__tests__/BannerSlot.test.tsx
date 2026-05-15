// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { BANNER_ENTER_DURATION, BANNER_EXIT_DURATION } from "@/lib/animationUtils";
import { BannerSlot } from "../TerminalPane";

vi.stubGlobal("requestAnimationFrame", ((cb: FrameRequestCallback): number => {
  const timeoutId = setTimeout(() => cb(0), 0);
  return timeoutId as unknown as number;
}) satisfies typeof requestAnimationFrame);
vi.stubGlobal("cancelAnimationFrame", (id: number) =>
  clearTimeout(id as unknown as NodeJS.Timeout)
);

function getWrapper(container: HTMLElement): HTMLElement | null {
  return container.firstElementChild as HTMLElement | null;
}

describe("BannerSlot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("renders nothing when visible is false on mount", () => {
    const { container } = render(
      <BannerSlot visible={false}>
        <div data-testid="banner">payload</div>
      </BannerSlot>
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders open at h-auto when visible is true on mount (no entry flicker)", () => {
    const { container, getByTestId } = render(
      <BannerSlot visible={true}>
        <div data-testid="banner">payload</div>
      </BannerSlot>
    );
    const wrapper = getWrapper(container);
    expect(wrapper).not.toBeNull();
    expect(wrapper!.className).toContain("h-auto");
    expect(wrapper!.className).toContain("ease-[var(--ease-snappy)]");
    expect(wrapper!.style.transitionDuration).toBe(`${BANNER_ENTER_DURATION}ms`);
    expect(getByTestId("banner")).toBeTruthy();
  });

  it("toggling false → true starts at h-0 and opens after one rAF tick", () => {
    const { container, rerender } = render(
      <BannerSlot visible={false}>
        <div data-testid="banner">payload</div>
      </BannerSlot>
    );
    expect(container.firstChild).toBeNull();

    act(() => {
      rerender(
        <BannerSlot visible={true}>
          <div data-testid="banner">payload</div>
        </BannerSlot>
      );
    });

    const pre = getWrapper(container);
    expect(pre).not.toBeNull();
    expect(pre!.className).toContain("h-0");
    expect(pre!.className).toContain("ease-[var(--ease-exit)]");
    expect(pre!.style.transitionDuration).toBe(`${BANNER_EXIT_DURATION}ms`);

    act(() => {
      vi.advanceTimersByTime(16);
    });

    const open = getWrapper(container);
    expect(open!.className).toContain("h-auto");
    expect(open!.className).toContain("ease-[var(--ease-snappy)]");
    expect(open!.style.transitionDuration).toBe(`${BANNER_ENTER_DURATION}ms`);
  });

  it("toggling true → false keeps the child mounted during the exit window, then unmounts", () => {
    const { container, rerender, queryByTestId } = render(
      <BannerSlot visible={true}>
        <div data-testid="banner">payload</div>
      </BannerSlot>
    );
    expect(queryByTestId("banner")).not.toBeNull();

    act(() => {
      rerender(
        <BannerSlot visible={false}>
          <div data-testid="banner">payload</div>
        </BannerSlot>
      );
    });

    const exiting = getWrapper(container);
    expect(exiting).not.toBeNull();
    expect(exiting!.className).toContain("h-0");
    expect(exiting!.className).toContain("ease-[var(--ease-exit)]");
    expect(exiting!.style.transitionDuration).toBe(`${BANNER_EXIT_DURATION}ms`);
    expect(queryByTestId("banner")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(BANNER_EXIT_DURATION);
    });

    expect(container.firstChild).toBeNull();
  });

  it("renders the last-visible children through the exit window even when null is passed", () => {
    const { container, rerender, queryByTestId } = render(
      <BannerSlot visible={true}>
        <div data-testid="cached">first</div>
      </BannerSlot>
    );
    expect(queryByTestId("cached")).not.toBeNull();

    act(() => {
      rerender(<BannerSlot visible={false}>{null}</BannerSlot>);
    });

    expect(queryByTestId("cached")).not.toBeNull();
    expect(getWrapper(container)!.className).toContain("h-0");

    act(() => {
      vi.advanceTimersByTime(BANNER_EXIT_DURATION);
    });
    expect(container.firstChild).toBeNull();
  });

  it("cancels a pending exit when visible flips back to true mid-exit", () => {
    const { container, rerender, getByTestId } = render(
      <BannerSlot visible={true}>
        <div data-testid="banner">payload</div>
      </BannerSlot>
    );

    act(() => {
      rerender(
        <BannerSlot visible={false}>
          <div data-testid="banner">payload</div>
        </BannerSlot>
      );
    });
    expect(getWrapper(container)!.className).toContain("h-0");

    act(() => {
      vi.advanceTimersByTime(BANNER_EXIT_DURATION / 2);
    });

    act(() => {
      rerender(
        <BannerSlot visible={true}>
          <div data-testid="banner">payload</div>
        </BannerSlot>
      );
    });
    act(() => {
      vi.advanceTimersByTime(16);
    });

    act(() => {
      vi.advanceTimersByTime(BANNER_EXIT_DURATION);
    });

    const wrapper = getWrapper(container);
    expect(wrapper).not.toBeNull();
    expect(wrapper!.className).toContain("h-auto");
    expect(getByTestId("banner")).toBeTruthy();
  });

  it("cancels a pending entry rAF when visible flips back to false pre-rAF", () => {
    const { container, rerender } = render(
      <BannerSlot visible={false}>
        <div data-testid="banner">payload</div>
      </BannerSlot>
    );

    act(() => {
      rerender(
        <BannerSlot visible={true}>
          <div data-testid="banner">payload</div>
        </BannerSlot>
      );
    });
    expect(getWrapper(container)!.className).toContain("h-0");

    act(() => {
      rerender(
        <BannerSlot visible={false}>
          <div data-testid="banner">payload</div>
        </BannerSlot>
      );
    });

    act(() => {
      vi.advanceTimersByTime(BANNER_EXIT_DURATION);
    });

    expect(container.firstChild).toBeNull();
  });

  it("sets aria-hidden while collapsed and clears it while open", () => {
    const { container, rerender } = render(
      <BannerSlot visible={true}>
        <div>payload</div>
      </BannerSlot>
    );
    expect(getWrapper(container)!.getAttribute("aria-hidden")).toBeNull();

    act(() => {
      rerender(
        <BannerSlot visible={false}>
          <div>payload</div>
        </BannerSlot>
      );
    });
    expect(getWrapper(container)!.getAttribute("aria-hidden")).toBe("true");
  });

  it("uses scoped transition-[height], never bare transition", () => {
    const { container } = render(
      <BannerSlot visible={true}>
        <div>payload</div>
      </BannerSlot>
    );
    const wrapper = getWrapper(container)!;
    expect(wrapper.className).toContain("transition-[height]");
    expect(wrapper.className).not.toContain("transition-all");
    expect(wrapper.className.match(/\btransition\b(?!-)/)).toBeNull();
  });
});
