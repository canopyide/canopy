import { create } from "zustand";

/**
 * Single in-flight broadcast that's waiting for the user to confirm
 * (destructive command, multi-line, or over-byte payload). Fed by both
 * the live-paste path and the Enter-broadcast path. The fleet ribbon
 * subscribes and renders the confirm controls in-place.
 *
 * Lives outside the ribbon's local state so any caller (paste handler,
 * input bar, future scriptable broadcasts) can request a confirm without
 * a callback prop chain.
 */
export interface PendingFleetBroadcast {
  requestId: string;
  text: string;
  /** Human-readable warnings to surface in the confirm prompt. */
  warningReasons: string[];
}

interface FleetBroadcastConfirmState {
  pending: PendingFleetBroadcast | null;
  clear: () => void;
}

/**
 * Module-level resolver map. Promises returned from
 * `requestFleetBroadcastConfirmation` are keyed by `requestId` UUID so
 * concurrent calls don't collide.
 *
 * The map lives outside React state because resolvers are functions and
 * Zustand state changes are async-batched; storing them in state would
 * defeat the deterministic resolve order.
 */
const resolvers = new Map<string, () => void>();

export const useFleetBroadcastConfirmStore = create<FleetBroadcastConfirmState>((set, get) => ({
  pending: null,
  clear: () => {
    const { pending } = get();
    if (pending !== null) {
      resolvers.delete(pending.requestId);
    }
    set({ pending: null });
  },
}));

/**
 * Request a fleet broadcast confirmation. Returns a Promise that resolves
 * when the user confirms (via `resolveFleetBroadcastConfirmation`) or
 * never resolves if the user cancels / clears the confirmation.
 */
export function requestFleetBroadcastConfirmation(
  entry: Omit<PendingFleetBroadcast, "requestId">
): Promise<void> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const store = useFleetBroadcastConfirmStore.getState();

    // Supersede any prior pending confirmation — delete its resolver so
    // the old Promise never resolves.
    if (store.pending !== null) {
      resolvers.delete(store.pending.requestId);
    }

    resolvers.set(requestId, resolve);
    useFleetBroadcastConfirmStore.setState({ pending: { ...entry, requestId } });
  });
}

/**
 * Resolve the current pending broadcast confirmation. The caller-provided
 * send action fires via the stored Promise resolver; the store clears
 * `pending` before calling the resolver so the ribbon immediately reflects
 * the non-pending state.
 */
export function resolveFleetBroadcastConfirmation(): void {
  const { pending } = useFleetBroadcastConfirmStore.getState();
  if (pending === null) return;
  const resolve = resolvers.get(pending.requestId);
  resolvers.delete(pending.requestId);
  useFleetBroadcastConfirmStore.setState({ pending: null });
  resolve?.();
}

/** Test-only escape hatch — resets store and clears the resolver map. */
export function __resetFleetBroadcastConfirmStoreForTesting(): void {
  resolvers.clear();
  useFleetBroadcastConfirmStore.setState({ pending: null });
}
