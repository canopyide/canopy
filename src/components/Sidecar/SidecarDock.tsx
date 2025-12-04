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
    createTab,
    closeTab,
    markTabCreated,
    isTabCreated,
  } = useSidecarStore();
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  const enabledLinks = useMemo(
    () => links.filter((l) => l.enabled).sort((a, b) => a.order - b.order),
    [links]
  );

  const showLaunchpad = activeTabId === null || tabs.length === 0;

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

  // Show sidecar tab after DOM is ready (handles launchpad-to-tab and collapse/expand)
  useEffect(() => {
    if (activeTabId && placeholderRef.current && isTabCreated(activeTabId)) {
      const rect = placeholderRef.current.getBoundingClientRect();
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
  }, [activeTabId, isTabCreated]);

  useEffect(() => {
    const cleanup = window.electron.sidecar.onNavEvent((data) => {
      useSidecarStore.getState().updateTabTitle(data.tabId, data.title);
      useSidecarStore.getState().updateTabUrl(data.tabId, data.url);
    });
    return cleanup;
  }, []);

  const handleTabClick = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      // useEffect handles the sidecar.show() call after DOM is ready
      setActiveTab(tabId);
    },
    [tabs, setActiveTab]
  );

  const handleTabClose = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      closeTab(tabId);
    },
    [closeTab]
  );

  const handleNewTab = useCallback(() => {
    setActiveTab(null);
    window.electron.sidecar.hide();
  }, [setActiveTab]);

  const handleOpenUrl = useCallback(
    async (url: string, title: string) => {
      const tabId = createTab(url, title);

      await window.electron.sidecar.create({ tabId, url });

      // Mark as created after sidecar window exists, so effect can safely show it
      markTabCreated(tabId);
    },
    [createTab, markTabCreated]
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
