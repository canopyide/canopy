import { useEffect, useState, useCallback } from "react";
import { usePanelStore } from "@/store/panelStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function WorkingAgentCloseGuard() {
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    window.addEventListener(
      "daintree:confirm-close-terminal",
      (e: Event) => {
        if (!(e instanceof CustomEvent)) return;
        const detail = e.detail as unknown;
        const id =
          typeof (detail as { terminalId?: unknown })?.terminalId === "string"
            ? (detail as any).terminalId
            : null;
        if (!id) return;
        setPendingIds((prev) => {
          if (prev.includes(id)) return prev;
          return [...prev, id];
        });
      },
      { signal: controller.signal }
    );
    return () => controller.abort();
  }, []);

  const currentId = pendingIds[0] ?? null;

  const advance = useCallback(() => {
    setPendingIds((prev) => prev.slice(1));
  }, []);

  const handleConfirm = useCallback(() => {
    if (currentId) {
      usePanelStore.getState().trashPanel(currentId);
    }
    advance();
  }, [currentId, advance]);

  return (
    <ConfirmDialog
      isOpen={currentId !== null}
      onClose={advance}
      title="Stop this agent?"
      description="The agent is currently working. Closing this tab will stop it."
      confirmLabel="Stop and close"
      variant="destructive"
      onConfirm={handleConfirm}
    />
  );
}
