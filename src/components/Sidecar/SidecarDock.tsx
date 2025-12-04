import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useSidecarStore } from "@/store";
import { SidecarToolbar } from "./SidecarToolbar";
import { SidecarLaunchpad } from "./SidecarLaunchpad";
import { SIDECAR_MIN_WIDTH, SIDECAR_MAX_WIDTH } from "@shared/types";
import type { SidecarTab } from "@shared/types";

export function SidecarDock() {
  const {
    width,
    activeTabId,
    links,
    isTabCreated,
    markTabCreated,
    setActiveTab,
    setWidth,
    setOpen,
  } = useSidecarStore();
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [showLaunchpad, setShowLaunchpad] = useState(true);

  const enabledLinks = useMemo(
    () => links.filter((l) => l.enabled).sort((a, b) => a.order - b.order),
    [links]
  );

  const tabs: SidecarTab[] = useMemo(
    () =>
      enabledLinks.map((link) => ({
        id: link.id,
        url: link.url,
        title: link.title,
      })),
    [enabledLinks]
  );

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
      const link = enabledLinks.find((l) => l.id === tabId);
      if (!link) return;

      setShowLaunchpad(false);

      if (!isTabCreated(tabId)) {
        await window.electron.sidecar.create({ tabId, url: link.url });
        markTabCreated(tabId);
      }

      setActiveTab(tabId);

      if (placeholderRef.current) {
        const rect = placeholderRef.current.getBoundingClientRect();
        await window.electron.sidecar.show({
          tabId,
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      }
    },
    [enabledLinks, isTabCreated, markTabCreated, setActiveTab]
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

  useEffect(() => {
    if (activeTabId && !showLaunchpad) {
      const linkExists = enabledLinks.some((l) => l.id === activeTabId);
      if (!linkExists) {
        setShowLaunchpad(true);
        setActiveTab("");
      }
    }
  }, [activeTabId, enabledLinks, showLaunchpad, setActiveTab]);

  const handleLaunchpadSelect = useCallback(
    (linkId: string) => {
      handleTabClick(linkId);
    },
    [handleTabClick]
  );

  return (
    <div className="flex flex-col h-full bg-zinc-900" style={{ width }}>
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/50 transition-colors ${isResizing ? "bg-blue-500" : ""}`}
        onMouseDown={handleResizeStart}
      />
      <SidecarToolbar
        tabs={tabs}
        activeTabId={showLaunchpad ? null : activeTabId}
        onTabClick={handleTabClick}
        onClose={handleClose}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onReload={handleReload}
      />
      {showLaunchpad ? (
        <SidecarLaunchpad onSelectLink={handleLaunchpadSelect} />
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
