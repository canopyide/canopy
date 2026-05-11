import { startTransition, useEffect, useState } from "react";

export type RadixPrimitives = typeof import("./radix-deferred");

let cached: RadixPrimitives | null = null;
let inFlight: Promise<RadixPrimitives> | null = null;

export function primeRadix(): Promise<RadixPrimitives> {
  if (cached) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = import("./radix-deferred").then((mod) => {
      cached = mod;
      return mod;
    });
  }
  return inFlight;
}

export function getRadixPrimitives(): RadixPrimitives | null {
  return cached;
}

export function useRadixPrimitives(): RadixPrimitives | null {
  const [mod, setMod] = useState<RadixPrimitives | null>(getRadixPrimitives);

  useEffect(() => {
    if (mod) return;
    let cancelled = false;
    void primeRadix().then((loaded) => {
      if (cancelled) return;
      startTransition(() => setMod(loaded));
    });
    return () => {
      cancelled = true;
    };
  }, [mod]);

  return mod;
}

export const primeOnEvent = () => {
  void primeRadix();
};

export function composeHandlers<T>(
  first: ((event: T) => void) | undefined,
  second: ((event: T) => void) | undefined
): ((event: T) => void) | undefined {
  if (!first) return second;
  if (!second) return first;
  return (event: T) => {
    first(event);
    second(event);
  };
}
