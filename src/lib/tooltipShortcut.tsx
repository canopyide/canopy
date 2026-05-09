import type { ReactElement, ReactNode } from "react";
import { KbdChord } from "@/components/ui/Kbd";

/**
 * Build tooltip content as a flex row: action label on the left, chord pills
 * on the right. For consumers that need a plain string (e.g. `aria-label`),
 * use `createTooltipWithShortcut` from `@/lib/platform` instead.
 */
export function createTooltipContent(label: ReactNode, shortcut?: string): ReactElement {
  if (!shortcut || !shortcut.trim()) {
    return <span>{label}</span>;
  }

  return (
    <span className="flex items-center justify-between gap-4 w-full">
      <span>{label}</span>
      <KbdChord shortcut={shortcut} />
    </span>
  );
}
