import { store } from "../store.js";
import type { ErrorRecord } from "../../shared/types/ipc/errors.js";

export const MAX_PENDING_ERRORS = 50;

export function appendPendingError(record: ErrorRecord): void {
  const raw = store.get("pendingErrors");
  const existing = Array.isArray(raw) ? (raw as ErrorRecord[]) : [];
  const updated = [...existing, record].slice(-MAX_PENDING_ERRORS);
  store.set("pendingErrors", updated);
}
