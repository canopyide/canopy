import { useEffect, useRef } from "react";
import { useSidecarStore } from "@/store";
import { useUIStore } from "@/store/uiStore";

/**
 * Zero-UI controller component that manages sidecar visibility based on overlay state.
 * Mount once in AppLayout - handles IPC hide/show calls when overlays open/close.
 */
export function SidecarVisibilityController(): null {
  const sidecarOpen = useSidecarStore((state) => state.isOpen);
  const activeTabId = useSidecarStore((state) => state.activeTabId);
  const overlayCount = useUIStore((state) => state.overlayCount);
  const hasOverlays = overlayCount > 0;
  const prevHasOverlaysRef = useRef(hasOverlays);

  useEffect(() => {
    const wasHidden = prevHasOverlaysRef.current;
    prevHasOverlaysRef.current = hasOverlays;

    if (hasOverlays && sidecarOpen) {
      // Overlay opened - hide sidecar
      window.electron.sidecar.hide();
    } else if (!hasOverlays && wasHidden && sidecarOpen && activeTabId) {
      // All overlays closed - restore sidecar by getting placeholder bounds and calling show
      const placeholder = document.getElementById("sidecar-placeholder");
      if (placeholder) {
        const rect = placeholder.getBoundingClientRect();
        window.electron.sidecar.show({
          tabId: activeTabId,
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      }
    }
  }, [hasOverlays, sidecarOpen, activeTabId]);

  return null;
}
