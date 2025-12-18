import { useEffect, useRef } from "react";
import { useSidecarStore } from "@/store";
import { useUIStore } from "@/store/uiStore";

/**
 * Zero-UI controller component that manages sidecar visibility.
 * Mount once in AppLayout - handles IPC hide/show calls when:
 * - Overlays open/close (modal dialogs, etc.)
 * - Sidecar is collapsed and re-expanded
 */
export function SidecarVisibilityController(): null {
  const sidecarOpen = useSidecarStore((state) => state.isOpen);
  const activeTabId = useSidecarStore((state) => state.activeTabId);
  const tabs = useSidecarStore((state) => state.tabs);
  const createdTabs = useSidecarStore((state) => state.createdTabs);
  const overlayCount = useUIStore((state) => state.overlayCount);
  const hasOverlays = overlayCount > 0;

  const prevHasOverlaysRef = useRef(hasOverlays);
  const prevSidecarOpenRef = useRef(sidecarOpen);

  // Auto-select first tab on startup when sidecar is open with tabs but no active tab
  useEffect(() => {
    if (!sidecarOpen) return;
    if (activeTabId != null) return;
    if (tabs.length === 0) return;

    useSidecarStore.getState().setActiveTab(tabs[0].id);
  }, [sidecarOpen, tabs, activeTabId]);

  // Handle overlay visibility changes
  useEffect(() => {
    const wasHiddenByOverlay = prevHasOverlaysRef.current;
    prevHasOverlaysRef.current = hasOverlays;

    if (hasOverlays && sidecarOpen) {
      window.electron.sidecar.hide();
    } else if (!hasOverlays && wasHiddenByOverlay && sidecarOpen && activeTabId) {
      // Only restore if tab was already created (has a webview in main process)
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab?.url && createdTabs.has(activeTabId)) {
        restoreWebview(activeTabId);
      }
    }
  }, [hasOverlays, sidecarOpen, activeTabId, tabs, createdTabs]);

  // Handle sidecar open/close toggle (collapse and re-expand)
  useEffect(() => {
    const wasClosed = !prevSidecarOpenRef.current;
    prevSidecarOpenRef.current = sidecarOpen;

    // Sidecar just opened - restore webview if we have an active created tab
    if (sidecarOpen && wasClosed && activeTabId && !hasOverlays) {
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab?.url && createdTabs.has(activeTabId)) {
        restoreWebview(activeTabId);
      }
    }
  }, [sidecarOpen, activeTabId, tabs, createdTabs, hasOverlays]);

  return null;
}

/** Restore webview after a single animation frame (waits for placeholder to render) */
function restoreWebview(tabId: string): void {
  requestAnimationFrame(() => {
    // Verify conditions still valid (sidecar open, correct tab, no overlays)
    const sidecarState = useSidecarStore.getState();
    const uiState = useUIStore.getState();
    if (!sidecarState.isOpen || sidecarState.activeTabId !== tabId) return;
    if (uiState.overlayCount > 0) return; // Don't show if overlay opened during rAF wait

    const placeholder = document.getElementById("sidecar-placeholder");
    if (placeholder) {
      const rect = placeholder.getBoundingClientRect();
      window.electron.sidecar.show({
        tabId,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }
  });
}
