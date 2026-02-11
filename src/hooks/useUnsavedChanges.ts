import { useCallback } from "react";

export interface UseUnsavedChangesOptions {
  isDirty: boolean;
  confirmMessage?: string;
}

export function useUnsavedChanges({
  isDirty,
  confirmMessage = "You have unsaved changes. Are you sure you want to close?",
}: UseUnsavedChangesOptions) {
  const onBeforeClose = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm(confirmMessage);
  }, [isDirty, confirmMessage]);

  return { onBeforeClose, isDirty };
}
