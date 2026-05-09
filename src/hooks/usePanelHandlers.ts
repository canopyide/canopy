import { useCallback, useRef } from "react";
import { usePanelStore } from "@/store";
import { logError } from "@/utils/logger";

export interface UsePanelHandlersConfig {
  terminalId: string;
  onAfterClose?: () => void;
}

export interface PanelHandlers {
  handleFocus: () => void;
  handleClose: (force?: boolean) => void;
  handleTitleChange: (newTitle: string) => void;
}

export function usePanelHandlers({
  terminalId,
  onAfterClose,
}: UsePanelHandlersConfig): PanelHandlers {
  const setFocused = usePanelStore((state) => state.setFocused);
  const trashPanelGroup = usePanelStore((state) => state.trashPanelGroup);
  const removePanel = usePanelStore((state) => state.removePanel);
  const updateTitle = usePanelStore((state) => state.updateTitle);

  // Synchronous guard against rapid Cmd+W double-fires. useState would batch
  // and read stale on the second tick; refs mutate atomically.
  const trashedRef = useRef(false);

  const handleFocus = useCallback(() => {
    setFocused(terminalId);
  }, [setFocused, terminalId]);

  const handleClose = useCallback(
    (force?: boolean) => {
      if (trashedRef.current) return;
      trashedRef.current = true;

      if (force) {
        removePanel(terminalId);
        onAfterClose?.();
        return;
      }

      try {
        trashPanelGroup(terminalId);
      } catch (error) {
        logError("Failed to trash terminal", error);
      } finally {
        onAfterClose?.();
      }
    },
    [removePanel, trashPanelGroup, terminalId, onAfterClose]
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      updateTitle(terminalId, newTitle);
    },
    [updateTitle, terminalId]
  );

  return { handleFocus, handleClose, handleTitleChange };
}
