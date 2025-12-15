import { useEffect, useMemo, useRef, useState } from "react";
import { filesClient } from "@/clients/filesClient";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [delayMs, value]);

  return debounced;
}

export interface UseFileAutocompleteOptions {
  cwd: string;
  query: string;
  enabled: boolean;
  limit?: number;
}

export interface UseFileAutocompleteResult {
  files: string[];
  isLoading: boolean;
}

export function useFileAutocomplete({
  cwd,
  query,
  enabled,
  limit = 50,
}: UseFileAutocompleteOptions): UseFileAutocompleteResult {
  const [files, setFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  const debouncedQuery = useDebouncedValue(query, 75);
  const effectiveQuery = useMemo(() => debouncedQuery, [debouncedQuery]);

  useEffect(() => {
    if (!enabled) {
      setFiles([]);
      setIsLoading(false);
      return;
    }

    if (!cwd) {
      setFiles([]);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    filesClient
      .search({ cwd, query: effectiveQuery, limit })
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setFiles(result.files);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setFiles([]);
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setIsLoading(false);
      });
  }, [cwd, enabled, effectiveQuery, limit]);

  return { files, isLoading };
}
