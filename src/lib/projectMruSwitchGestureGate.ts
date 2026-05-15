const STORAGE_KEY = "daintree:project-mru-switch-modifier-gate";
const GATE_TTL_MS = 2_000;

let memoryGateTimestamp: number | null = null;

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readGateTimestamp(): number | null {
  const storage = getStorage();
  const raw = storage?.getItem(STORAGE_KEY) ?? null;
  const value = raw === null ? memoryGateTimestamp : Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function armProjectMruModifierGate(now: number = Date.now()): void {
  memoryGateTimestamp = now;
  try {
    getStorage()?.setItem(STORAGE_KEY, String(now));
  } catch {
    // In private / constrained storage modes the in-memory fallback still gates
    // the current renderer. Cross-view gating is best-effort without storage.
  }
}

export function clearProjectMruModifierGate(): void {
  memoryGateTimestamp = null;
  try {
    getStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures; the TTL keeps stale gates bounded.
  }
}

export function isProjectMruModifierGateActive(now: number = Date.now()): boolean {
  const gateAt = readGateTimestamp();
  if (gateAt === null) return false;
  if (now - gateAt > GATE_TTL_MS) {
    clearProjectMruModifierGate();
    return false;
  }
  return true;
}
