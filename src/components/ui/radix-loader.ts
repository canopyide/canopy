import { startTransition, useEffect, useState } from "react";

export type RadixPrimitives = typeof import("./radix-deferred");

let cached: RadixPrimitives | null = null;
let inFlight: Promise<RadixPrimitives> | null = null;

export function primeRadix(): Promise<RadixPrimitives> {
  if (cached) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = import("./radix-deferred").then(
      (mod) => {
        cached = mod;
        return mod;
      },
      (err: unknown) => {
        // Clear the singleton on rejection so a subsequent gesture can retry
        // a fresh dynamic import rather than reusing a cached rejected
        // promise. Without this, a transient chunk load failure (e.g.,
        // corrupted chunk during HMR, brief filesystem error) would
        // permanently disable the overlay primitives for the rest of the
        // session and produce one unhandled rejection per gesture event.
        inFlight = null;
        throw err;
      }
    );
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
    primeRadix().then(
      (loaded) => {
        if (cancelled) return;
        startTransition(() => setMod(loaded));
      },
      () => {
        // Swallow — loader resets `inFlight` on rejection so the next gesture
        // retries. Logging happens once, in the failing dynamic import.
      }
    );
    return () => {
      cancelled = true;
    };
  }, [mod]);

  return mod;
}

export const primeOnEvent = () => {
  primeRadix().catch(() => {
    // Fire-and-forget priming: swallow rejection. The loader clears its
    // singleton so the next gesture retries. Without this catch, every
    // pointer/focus event on a deferred trigger after a chunk failure
    // would surface an unhandled rejection.
  });
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
