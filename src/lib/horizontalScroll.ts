export interface ScrollMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export interface HorizontalScrollState {
  isOverflowing: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

const EPSILON = 1;

export function getHorizontalScrollState(metrics: ScrollMetrics): HorizontalScrollState {
  const isOverflowing = metrics.scrollWidth > metrics.clientWidth + EPSILON;
  const canScrollLeft = isOverflowing && metrics.scrollLeft > EPSILON;
  const canScrollRight =
    isOverflowing && metrics.scrollLeft + metrics.clientWidth < metrics.scrollWidth - EPSILON;
  return { isOverflowing, canScrollLeft, canScrollRight };
}

export function calculateScrollAmount(clientWidth: number): number {
  const minScroll = 200;
  const maxScroll = 600;
  const preferredScroll = clientWidth * 0.8;
  return Math.max(minScroll, Math.min(preferredScroll, maxScroll));
}
