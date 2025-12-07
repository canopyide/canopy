import { useMemo, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useLayoutConfigStore } from "@/store";
import type { TerminalInstance } from "@/store";

interface PaginationResult {
  visibleTerminals: TerminalInstance[];
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  pageSize: number;
  setPage: (page: number) => void;
}

export function useTerminalPagination(terminals: TerminalInstance[]): PaginationResult {
  const { pagination, setPage } = useLayoutConfigStore(
    useShallow((state) => ({ pagination: state.pagination, setPage: state.setPage }))
  );

  const { currentPage, pageSize } = pagination;
  const prevTerminalCountRef = useRef(terminals.length);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(terminals.length / pageSize)),
    [terminals.length, pageSize]
  );

  const visibleTerminals = useMemo(() => {
    const startIndex = currentPage * pageSize;
    return terminals.slice(startIndex, startIndex + pageSize);
  }, [terminals, currentPage, pageSize]);

  const hasNext = currentPage < totalPages - 1;
  const hasPrev = currentPage > 0;

  // Auto-navigate if current page is empty (terminals were deleted)
  useEffect(() => {
    if (terminals.length > 0 && visibleTerminals.length === 0) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [terminals.length, visibleTerminals.length, totalPages, setPage]);

  // Clamp currentPage when terminals are removed or page bounds change
  useEffect(() => {
    if (terminals.length === 0 && currentPage !== 0) {
      setPage(0);
      return;
    }

    const lastPage = totalPages - 1;
    if (currentPage > lastPage) {
      setPage(lastPage);
    }
  }, [terminals.length, totalPages, currentPage, setPage]);

  // Auto-navigate to last page when new terminal is added (only if already on last page)
  useEffect(() => {
    const prevCount = prevTerminalCountRef.current;
    const currentCount = terminals.length;

    if (currentCount > prevCount) {
      const lastPage = totalPages - 1;
      if (currentPage === totalPages - 2 || prevCount === 0) {
        setPage(lastPage);
      }
    }

    prevTerminalCountRef.current = currentCount;
  }, [terminals.length, totalPages, currentPage, setPage]);

  return {
    visibleTerminals,
    currentPage,
    totalPages,
    hasNext,
    hasPrev,
    pageSize,
    setPage,
  };
}
