import { useEffect, useState } from "react";
import { usePanelStore } from "@/store/panelStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function WorkingAgentCloseGuard() {
  const [pendingTerminalId, setPendingTerminalId] = useState<string | null>(null);

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
        setPendingTerminalId(id);
      },
      { signal: controller.signal }
    );
    return () => controller.abort();
  }, []);

  return (
    <ConfirmDialog
      isOpen={pendingTerminalId !== null}
      onClose={() => setPendingTerminalId(null)}
      title="Stop this agent?"
      description="The agent is currently working. Closing this tab will stop it."
      confirmLabel="Stop and close"
      variant="destructive"
      onConfirm={() => {
        const id = pendingTerminalId;
        setPendingTerminalId(null);
        if (id) usePanelStore.getState().trashPanel(id);
      }}
    />
  );
}
