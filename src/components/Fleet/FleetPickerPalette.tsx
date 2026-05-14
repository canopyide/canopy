import { useCallback, useMemo, type ReactElement } from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppPaletteDialog } from "@/components/ui/AppPaletteDialog";
import { FleetPickerContent } from "@/components/Fleet/FleetPickerContent";
import { useFleetPicker } from "@/hooks/useFleetPicker";
import { useFleetArmingStore } from "@/store/fleetArmingStore";
import { ACTIVE_AGENT_STATES } from "@shared/types/agent";

export interface FleetPickerPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Cold-start fleet picker — the centered palette that opens from the sidebar
 * Zap button when the user wants to arm terminals as a fleet.
 *
 * Mounts `FleetPickerContent` inside `AppPaletteDialog` so the picker inherits
 * the canonical centered/scrimmed/aria-modal palette tier-fast animation
 * (~150ms enter / ~100ms exit). Cold-start mode: pre-selects active-worktree
 * eligibles, REPLACES the armed set on confirm via `armIds`. The ribbon's
 * `+ Add panes…` flow uses a different consumer (ribbon-add owner, append
 * semantics) — see `FleetArmingRibbon.tsx`.
 */
export function FleetPickerPalette({ isOpen, onClose }: FleetPickerPaletteProps): ReactElement {
  const armIds = useFleetArmingStore((s) => s.armIds);

  const handleCommit = useCallback(
    (selected: string[]) => {
      armIds(selected);
      onClose();
    },
    [armIds, onClose]
  );

  const picker = useFleetPicker({
    isOpen,
    mode: "cold-start",
    onCommit: handleCommit,
    owner: "cold-start",
  });

  const allVisibleSelected = useMemo(
    () =>
      picker.visibleIds.length > 0 && picker.visibleIds.every((id) => picker.selectedIds.has(id)),
    [picker.visibleIds, picker.selectedIds]
  );

  // Scope is `agentState`-only — terminals are picked by their reported
  // agent state (working/waiting/directing). No capability-id gate, so a
  // terminal whose `agentState` is set but whose registered agent has gone
  // away is still eligible to be armed (arming broadcasts keystrokes, not
  // agent commands — the surface is acceptable).
  const agentVisibleIds = useMemo(
    () =>
      picker.visibleTerminals
        .filter((t) => t.agentState && ACTIVE_AGENT_STATES.has(t.agentState))
        .map((t) => t.id),
    [picker.visibleTerminals]
  );

  const hasQuery = picker.query.trim() !== "";
  const selectAllLabel = allVisibleSelected
    ? hasQuery
      ? "Deselect visible"
      : "Deselect all"
    : hasQuery
      ? "Select all visible"
      : "Select all";

  // Select → replace visible (matches Cmd+A in useFleetPicker).
  // Deselect when filtered → scoped removal so picks for filtered-out
  // terminals survive. Deselect when unfiltered → full clear, otherwise
  // drifted (transiently-ineligible) ids would sneak back into the
  // selection after re-eligibility, contradicting the "Deselect all" label.
  const handleToggleAllVisible = useCallback(() => {
    if (!allVisibleSelected) {
      picker.setSelectedIds(new Set(picker.visibleIds));
      return;
    }
    if (hasQuery) {
      picker.setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of picker.visibleIds) next.delete(id);
        return next;
      });
    } else {
      picker.setSelectedIds(new Set());
    }
  }, [allVisibleSelected, hasQuery, picker]);

  // Additive — preserves existing picks (including non-agent terminals).
  const handleSelectAgents = useCallback(() => {
    if (agentVisibleIds.length === 0) return;
    picker.setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of agentVisibleIds) next.add(id);
      return next;
    });
  }, [agentVisibleIds, picker]);

  return (
    <AppPaletteDialog isOpen={isOpen} onClose={onClose} ariaLabel="Select terminals to arm">
      <div className="flex flex-col">
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-3 border-b border-daintree-border",
            "text-daintree-text"
          )}
        >
          <Zap className="h-4 w-4 text-daintree-text/70" aria-hidden="true" />
          <h2 className="text-[14px] font-semibold">Select terminals to arm</h2>
        </div>

        {picker.acquired ? (
          <>
            <div className="max-h-[60vh] flex flex-col">
              <FleetPickerContent
                picker={picker}
                testIdPrefix="fleet-picker-cold-start"
                autoFocusSearch
              />
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-daintree-border px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span
                  role="status"
                  className="text-[11px] tabular-nums text-daintree-text/55"
                  data-testid="fleet-picker-cold-start-status"
                >
                  Select terminals to arm
                  {picker.driftCount > 0 ? ` · ${picker.driftCount} ineligible` : ""}
                </span>
                <button
                  type="button"
                  onClick={handleToggleAllVisible}
                  disabled={picker.visibleIds.length === 0}
                  data-testid="fleet-picker-cold-start-select-all"
                  className={cn(
                    "rounded px-2.5 py-1 text-[12px] text-daintree-text/70",
                    "hover:bg-tint/[0.08] hover:text-daintree-text",
                    "disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent"
                  )}
                >
                  {selectAllLabel}
                </button>
                <button
                  type="button"
                  onClick={handleSelectAgents}
                  disabled={agentVisibleIds.length === 0}
                  data-testid="fleet-picker-cold-start-select-agents"
                  className={cn(
                    "rounded px-2.5 py-1 text-[12px] text-daintree-text/70",
                    "hover:bg-tint/[0.08] hover:text-daintree-text",
                    "disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent"
                  )}
                >
                  Select agents
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(
                    "rounded px-2.5 py-1 text-[12px] text-daintree-text/70",
                    "hover:bg-tint/[0.08] hover:text-daintree-text",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent"
                  )}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={picker.handleConfirm}
                  disabled={picker.confirmedIds.length === 0}
                  data-testid="fleet-picker-cold-start-confirm"
                  className={cn(
                    "rounded border border-category-amber-border bg-category-amber-subtle px-2.5 py-1 text-[12px] text-category-amber-text transition",
                    "hover:brightness-110",
                    "disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-daintree-accent"
                  )}
                >
                  {picker.confirmedIds.length === 0
                    ? "Arm selected"
                    : `Arm ${picker.confirmedIds.length} selected`}
                </button>
              </div>
            </div>
          </>
        ) : (
          // Another picker (likely the ribbon `+ Add panes…`) holds the
          // single-active session. Surface a soft empty state and let the
          // user dismiss via Cancel/Esc.
          <div
            className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center"
            data-testid="fleet-picker-cold-start-blocked"
          >
            <div className="text-[13px] font-medium text-daintree-text">
              Another fleet picker is open
            </div>
            <div className="text-[12px] text-daintree-text/60">Close it and try again.</div>
          </div>
        )}
      </div>
    </AppPaletteDialog>
  );
}
