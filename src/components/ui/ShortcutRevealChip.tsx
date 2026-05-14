import { useKeybindingDisplay } from "@/hooks";

interface ShortcutRevealChipProps {
  actionId: string;
}

// TEMPORARY (README screenshots): chip rendering disabled so Cmd+Shift+4
// screenshots don't capture the keyboard-hint overlay. Revert this stub by
// removing the early `return null` below once the README captures are done.
const RENDER_CHIPS = false;

export function ShortcutRevealChip({ actionId }: ShortcutRevealChipProps) {
  const display = useKeybindingDisplay(actionId);
  if (!RENDER_CHIPS) return null;
  if (!display) return null;
  return (
    <span aria-hidden="true" className="shortcut-reveal-chip">
      {display}
    </span>
  );
}
