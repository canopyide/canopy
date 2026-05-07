import { useCallback, useRef } from "react";
import { usePanelStore } from "@/store";
import { logError } from "@/utils/logger";
import { getTerminalAnimationDuration } from "@/lib/animationUtils";
import type { PanelLifecycle } from "./usePanelLifecycle";

export interface UsePanelHandlersConfig {
  terminalId: string;
  lifecycle: PanelLifecycle;
  onAfterClose?: () => void;
}

export interface PanelHandlers {
  handleFocus: () => void;
  handleClose: (force?: boolean) => void;
  handleTitleChange: (newTitle: string) => void;
}

export function usePanelHandlers({
  terminalId,
  lifecycle,
  onAfterClose,
}: UsePanelHandlersConfig): PanelHandlers {
  const setFocused = usePanelStore((state) => state.setFocused);
  const trashPanelGroup = usePanelStore((state) => state.trashPanelGroup);
  const removePanel = usePanelStore((state) => state.removePanel);
  const updateTitle = usePanelStore((state) => state.updateTitle);

  // Synchronous guard for repeat closes on the same panel. useState would be
  // batched and read stale on rapid Cmd+W; a ref mutates on the same tick.
  const inFlightRef = useRef(false);

  const handleFocus = useCallback(() => {
    setFocused(terminalId);
  }, [setFocused, terminalId]);

  const handleClose = useCallback(
    (force?: boolean) => {
      if (force) {
        removePanel(terminalId);
        onAfterClose?.();
        return;
      }

      const trashNow = () => {
        try {
          trashPanelGroup(terminalId);
        } catch (error) {
          logError("Failed to trash terminal", error);
        } finally {
          onAfterClose?.();
        }
      };

      // Repeat close on the same panel while its trash animation is still
      // playing — cancel the queued timer and flush now so rapid Cmd+W
      // doesn't serialize behind a tower of pending setTimeouts.
      if (inFlightRef.current) {
        if (lifecycle.timeoutRef.current) {
          clearTimeout(lifecycle.timeoutRef.current);
          lifecycle.timeoutRef.current = undefined;
        }
        inFlightRef.current = false;
        if (lifecycle.mountedRef.current) {
          lifecycle.setIsTrashing(false);
        }
        trashNow();
        return;
      }

      const duration = getTerminalAnimationDuration();
      if (duration === 0) {
        // Performance mode — skip the animation and the setIsTrashing churn.
        trashNow();
        return;
      }

      inFlightRef.current = true;
      lifecycle.setIsTrashing(true);
      lifecycle.timeoutRef.current = setTimeout(() => {
        lifecycle.timeoutRef.current = undefined;
        inFlightRef.current = false;
        if (lifecycle.mountedRef.current) {
          lifecycle.setIsTrashing(false);
        }
        trashNow();
      }, duration);
    },
    [removePanel, trashPanelGroup, terminalId, onAfterClose, lifecycle]
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      updateTitle(terminalId, newTitle);
    },
    [updateTitle, terminalId]
  );

  return { handleFocus, handleClose, handleTitleChange };
}
