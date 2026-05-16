import { useEffect } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { usePanelLimitStore } from "@/store/panelLimitStore";

export function PanelLimitConfirmDialog() {
  const pendingConfirm = usePanelLimitStore((state) => state.pendingConfirm);
  const resolveConfirmation = usePanelLimitStore((state) => state.resolveConfirmation);

  // Resolve false on unmount to prevent leaked promises
  useEffect(() => {
    return () => {
      if (usePanelLimitStore.getState().pendingConfirm) {
        usePanelLimitStore.getState().resolveConfirmation(false);
      }
    };
  }, []);

  if (!pendingConfirm) return null;

  const { panelCount, memoryMB } = pendingConfirm;

  return (
    <ErrorBoundary
      variant="component"
      componentName="PanelLimitConfirmDialog"
      resetKeys={[`${panelCount}-${memoryMB}`]}
    >
      <ConfirmDialog
        isOpen={true}
        onClose={() => resolveConfirmation(false)}
        title="Many panels open"
        description={`You currently have ${panelCount} panels open. Adding more may slow down the application.`}
        confirmLabel="Add panel anyway"
        cancelLabel="Cancel"
        onConfirm={() => resolveConfirmation(true)}
        variant="info"
      >
        {memoryMB != null && (
          <p className="text-xs text-daintree-text/60 tabular-nums">
            Current memory usage: {Math.round(memoryMB)} MB
          </p>
        )}
      </ConfirmDialog>
    </ErrorBoundary>
  );
}
