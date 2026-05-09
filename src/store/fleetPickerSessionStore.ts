import { create } from "zustand";

/**
 * Single-active-picker guard for the fleet picker. Two open pickers would
 * each fire `terminal.searchSemanticBuffers` IPC requests against every
 * eligible terminal's xterm scrollback — the pty-host scan is synchronous
 * across all buffers, so doubling it is wasted work and a typing-debounce
 * footgun (each picker would race the other's response stream).
 *
 * Picker consumers (cold-start palette, ribbon `+ Add panes…` mode) call
 * `acquire(owner)` on open and `release(owner)` on close. `acquire` returns
 * `false` if another owner currently holds the session — the caller should
 * either bail or close the previous owner first.
 *
 * Owner is a stable string (e.g. `"cold-start"`, `"ribbon-add"`) so
 * release-after-unmount can't accidentally clear someone else's session.
 */
export type FleetPickerOwner = "cold-start" | "ribbon-add";

interface FleetPickerSessionState {
  activeOwner: FleetPickerOwner | null;
  acquire: (owner: FleetPickerOwner) => boolean;
  release: (owner: FleetPickerOwner) => void;
}

export const useFleetPickerSessionStore = create<FleetPickerSessionState>()((set, get) => ({
  activeOwner: null,

  acquire: (owner) => {
    const current = get().activeOwner;
    if (current !== null && current !== owner) return false;
    if (current === owner) return true;
    set({ activeOwner: owner });
    return true;
  },

  release: (owner) => {
    if (get().activeOwner !== owner) return;
    set({ activeOwner: null });
  },
}));
