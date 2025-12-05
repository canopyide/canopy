import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useSidecarStore } from "@/store";
import { SidecarToolbar } from "./SidecarToolbar";
import { SidecarLaunchpad } from "./SidecarLaunchpad";
import { SIDECAR_MIN_WIDTH, SIDECAR_MAX_WIDTH } from "@shared/types";

export function SidecarDock() {
  const {
    width,
    activeTabId,
    tabs,
    links,
    setActiveTab,
    setWidth,
    setOpen,
    createBlankTab,
    closeTab,
    markTabCreated,
    updateTabUrl,
    updateTabTitle,
    createdTabs,
  } = useSidecarStore();
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const getPlaceholderBounds = useCallback(() => {
    if (!placeholderRef.current) return null;
    const rect = placeholderRef.current.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }, []);

  const enabledLinks = useMemo(
    () => links.filter((l) => l.enabled).sort((a, b) => a.order - b.order),
    [links]
  );

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isBlankTab = activeTabId !== null && activeTab && !activeTab.url;
  const showLaunchpad = activeTabId === null || tabs.length === 0 || isBlankTab;

  const syncBounds = useCallback(() => {
    if (!placeholderRef.current || !activeTabId) return;
    const rect = placeholderRef.current.getBoundingClientRect();
    window.electron.sidecar.resize({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }, [activeTabId]);

  useEffect(() => {
    if (!placeholderRef.current || !activeTabId) return;

    const debouncedSync = debounce(syncBounds, 100);
    const observer = new ResizeObserver(debouncedSync);
    observer.observe(placeholderRef.current);

    window.addEventListener("resize", debouncedSync);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", debouncedSync);
    };
  }, [activeTabId, syncBounds]);

  useEffect(() => {
    const cleanup = window.electron.sidecar.onNavEvent((data) => {
      useSidecarStore.getState().updateTabTitle(data.tabId, data.title);
      useSidecarStore.getState().updateTabUrl(data.tabId, data.url);
    });
    return cleanup;
  }, []);

  const handleTabClick = useCallback(
    async (tabId: string) => {
      if (tabId === activeTabId || isSwitching) return;

      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      // Blank tabs (no URL) switch instantly - no webview to wait for
      if (!tab.url) {
        setActiveTab(tabId);
        window.electron.sidecar.hide();
        return;
      }

      const bounds = getPlaceholderBounds();
      if (!bounds) return;

      setIsSwitching(true);

      try {
        // Ensure the tab exists in main process
        if (!createdTabs.has(tabId)) {
          await window.electron.sidecar.create({ tabId, url: tab.url });
          markTabCreated(tabId);
        }

        // Wait for webview to switch before updating UI
        await window.electron.sidecar.show({ tabId, bounds });

        // Only now update the UI to highlight the tab
        setActiveTab(tabId);
      } catch (error) {
        console.error("Failed to switch tab:", error);
      } finally {
        setIsSwitching(false);
      }
    },
    [
      activeTabId,
      tabs,
      createdTabs,
      getPlaceholderBounds,
      markTabCreated,
      setActiveTab,
      isSwitching,
    ]
  );

  const handleTabClose = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      // Store's closeTab handles state update and deferred webview switching
      closeTab(tabId);
    },
    [closeTab]
  );

  const handleNewTab = useCallback(() => {
    createBlankTab();
    window.electron.sidecar.hide();
  }, [createBlankTab]);

  const handleOpenUrl = useCallback(
    async (url: string, title: string) => {
      setIsSwitching(true);

      try {
        // Reuse blank tab if active, otherwise create new tab
        const currentTab = activeTabId ? tabs.find((t) => t.id === activeTabId) : null;
        const isCurrentBlank = currentTab && !currentTab.url;

        let tabId: string;
        if (isCurrentBlank && activeTabId) {
          // Reuse the blank tab
          tabId = activeTabId;
          updateTabUrl(tabId, url);
          updateTabTitle(tabId, title);
        } else {
          // Create new tab without auto-activating
          const newTabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const newTab = { id: newTabId, url, title };
          useSidecarStore.setState((s) => ({
            tabs: [...s.tabs, newTab],
          }));
          tabId = newTabId;
        }

        // Wait for placeholder to exist if showing launchpad
        let bounds = getPlaceholderBounds();
        if (!bounds) {
          // Placeholder not rendered yet - wait a tick for React to update
          await new Promise((resolve) => setTimeout(resolve, 0));
          bounds = getPlaceholderBounds();
          if (!bounds) {
            throw new Error("Failed to get sidecar bounds");
          }
        }

        // Create in main process
        await window.electron.sidecar.create({ tabId, url });
        markTabCreated(tabId);

        // Show webview and wait for it
        await window.electron.sidecar.show({ tabId, bounds });

        // Now update UI state to highlight the tab
        setActiveTab(tabId);
      } catch (error) {
        console.error("Failed to open URL in sidecar:", error);
        // Rollback: hide any partial webview
        await window.electron.sidecar.hide().catch(() => {});
      } finally {
        setIsSwitching(false);
      }
    },
    [
      activeTabId,
      tabs,
      markTabCreated,
      updateTabUrl,
      updateTabTitle,
      getPlaceholderBounds,
      setActiveTab,
    ]
  );

  const handleClose = useCallback(async () => {
    await window.electron.sidecar.hide();
    setOpen(false);
  }, [setOpen]);

  const handleGoBack = useCallback(async () => {
    if (activeTabId) {
      await window.electron.sidecar.goBack(activeTabId);
    }
  }, [activeTabId]);

  const handleGoForward = useCallback(async () => {
    if (activeTabId) {
      await window.electron.sidecar.goForward(activeTabId);
    }
  }, [activeTabId]);

  const handleReload = useCallback(async () => {
    if (activeTabId) {
      await window.electron.sidecar.reload(activeTabId);
    }
  }, [activeTabId]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const startWidth = width;

      const handleMouseMove = (e: MouseEvent) => {
        const delta = startX - e.clientX;
        const newWidth = Math.min(
          Math.max(startWidth + delta, SIDECAR_MIN_WIDTH),
          SIDECAR_MAX_WIDTH
        );
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    },
    [width, setWidth]
  );

  useEffect(() => {
    return () => {
      setIsResizing(false);
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-900 relative" style={{ width }}>
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/50 transition-colors ${isResizing ? "bg-blue-500" : ""}`}
        onMouseDown={handleResizeStart}
      />
      <SidecarToolbar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onNewTab={handleNewTab}
        onClose={handleClose}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onReload={handleReload}
      />
      {showLaunchpad ? (
        <SidecarLaunchpad links={enabledLinks} onOpenUrl={handleOpenUrl} />
      ) : (
        <div ref={placeholderRef} className="flex-1 bg-zinc-950" id="sidecar-placeholder" />
      )}
    </div>
  );
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}
