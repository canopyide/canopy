import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useTerminalStore } from "@/store/terminalStore";
import { WaitingContainer } from "./WaitingContainer";
import { FailedContainer } from "./FailedContainer";
import { TrashContainer } from "./TrashContainer";

interface DockStatusOverlayProps {
  waitingCount: number;
  failedCount: number;
  trashedCount: number;
}

export function DockStatusOverlay({
  waitingCount,
  failedCount,
  trashedCount,
}: DockStatusOverlayProps) {
  const hasAny = waitingCount > 0 || failedCount > 0 || trashedCount > 0;

  const terminals = useTerminalStore((state) => state.terminals);
  const trashedTerminals = useTerminalStore(useShallow((state) => state.trashedTerminals));

  const trashedItems = Array.from(trashedTerminals.values())
    .map((trashed) => ({
      terminal: terminals.find((t) => t.id === trashed.id),
      trashedInfo: trashed,
    }))
    .filter((item) => item.terminal !== undefined) as {
    terminal: (typeof terminals)[0];
    trashedInfo: typeof trashedTerminals extends Map<string, infer V> ? V : never;
  }[];

  if (!hasAny) return null;

  return (
    <div
      className={cn(
        "absolute bottom-2 right-4 z-50",
        "flex items-center gap-2",
        "p-1.5 rounded-full",
        "bg-[var(--dock-bg)]/95 backdrop-blur-sm",
        "border border-[var(--dock-border)]",
        "shadow-lg"
      )}
      aria-live="polite"
      aria-label="Dock status indicators"
    >
      <WaitingContainer compact />
      <FailedContainer compact />
      <TrashContainer trashedTerminals={trashedItems} compact />
    </div>
  );
}
