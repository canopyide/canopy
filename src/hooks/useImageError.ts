import { useState, useEffect, useRef, useCallback } from "react";

export function useImageError(src: string | undefined) {
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setError(false);
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) {
      setError(true);
    }
  }, [src]);

  const onError = useCallback(() => setError(true), []);

  return { imgRef, error, onError };
}
