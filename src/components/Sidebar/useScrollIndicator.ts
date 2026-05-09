import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import { useResizeObserverRaf } from "@/hooks/useResizeObserverRaf";

interface UseScrollIndicatorParams {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollContentRef: RefObject<HTMLDivElement | null>;
  itemCount: number;
}

interface UseScrollIndicatorReturn {
  hiddenAbove: number;
  hiddenBelow: number;
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

function useScrollIndicator({
  scrollContainerRef,
  scrollContentRef,
  itemCount,
}: UseScrollIndicatorParams): UseScrollIndicatorReturn {
  const [hiddenAbove, setHiddenAbove] = useState(0);
  const [hiddenBelow, setHiddenBelow] = useState(0);
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setContainerEl(scrollContainerRef.current);
    setContentEl(scrollContentRef.current);
  }, [scrollContainerRef, scrollContentRef]);

  const updateScrollIndicators = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const totalItems = itemCount;

    if (scrollHeight <= clientHeight + 1) {
      setHiddenAbove(0);
      setHiddenBelow(0);
      return;
    }

    const scrollableHeight = scrollHeight - clientHeight;
    if (scrollableHeight <= 0) {
      setHiddenAbove(0);
      setHiddenBelow(0);
      return;
    }

    const scrollFraction = Math.min(1, Math.max(0, scrollTop / scrollableHeight));
    const visibleFraction = clientHeight / scrollHeight;
    const approxVisible = Math.max(1, Math.round(totalItems * visibleFraction));
    const totalHidden = Math.max(0, totalItems - approxVisible);

    const above = Math.round(totalHidden * scrollFraction);
    const below = totalHidden - above;

    setHiddenAbove(above);
    setHiddenBelow(below);
  }, [scrollContainerRef, itemCount]);

  useLayoutEffect(() => {
    updateScrollIndicators();
  }, [updateScrollIndicators, itemCount]);

  useResizeObserverRaf(containerEl, () => updateScrollIndicators());
  useResizeObserverRaf(contentEl, () => updateScrollIndicators());

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        updateScrollIndicators();
        rafId = null;
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [updateScrollIndicators, scrollContainerRef]);

  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [scrollContainerRef]);

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [scrollContainerRef]);

  return { hiddenAbove, hiddenBelow, scrollToTop, scrollToBottom };
}

export { useScrollIndicator };
