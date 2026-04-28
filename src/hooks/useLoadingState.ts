import { useState, useEffect } from "react";

export interface UseLoadingStateResult {
  showSpinner: boolean;
  isSlow: boolean;
  isOverdue: boolean;
}

export function useLoadingState(
  isPending: boolean,
  deferDelay: number = 200,
  slowThreshold: number = 3000,
  overdueThreshold: number = 10000
): UseLoadingStateResult {
  const [showSpinner, setShowSpinner] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [isOverdue, setIsOverdue] = useState(false);

  useEffect(() => {
    if (!isPending) {
      setShowSpinner(false);
      setIsSlow(false);
      setIsOverdue(false);
      return;
    }
    const deferTimer = setTimeout(() => setShowSpinner(true), deferDelay);
    const slowTimer = setTimeout(() => setIsSlow(true), slowThreshold);
    const overdueTimer = setTimeout(() => setIsOverdue(true), overdueThreshold);
    return () => {
      clearTimeout(deferTimer);
      clearTimeout(slowTimer);
      clearTimeout(overdueTimer);
    };
  }, [isPending, deferDelay, slowThreshold, overdueThreshold]);

  return { showSpinner, isSlow, isOverdue };
}
