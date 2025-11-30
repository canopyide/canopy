/**
 * DiagnosticsDock Component
 *
 * Unified bottom dock containing Problems, Logs, and Events tabs.
 * Consolidates three separate panels into one organized interface.
 */

import { useCallback, useRef, useState, useEffect, memo } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useDiagnosticsStore,
  type DiagnosticsTab,
  DIAGNOSTICS_MIN_HEIGHT,
  DIAGNOSTICS_MAX_HEIGHT_RATIO,
} from "@/store/diagnosticsStore";
import { useErrorStore } from "@/store";
import { ProblemsContent } from "./ProblemsContent";
import { LogsContent } from "./LogsContent";
import { EventsContent } from "./EventsContent";
import { ProblemsActions, LogsActions, EventsActions } from "./DiagnosticsActions";
import type { RetryAction } from "@/store";

interface TabButtonProps {
  tab: DiagnosticsTab;
  label: string;
  isActive: boolean;
  onClick: () => void;
  badge?: number;
}

const TabButton = memo(function TabButton({
  tab,
  label,
  isActive,
  onClick,
  badge,
}: TabButtonProps) {
  return (
    <button
      id={`diagnostics-${tab}-tab`}
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm font-medium transition-colors relative",
        "hover:text-canopy-text",
        isActive ? "text-canopy-text" : "text-gray-400"
      )}
      role="tab"
      aria-selected={isActive}
      aria-controls={`diagnostics-${tab}-panel`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-900/50 text-red-300 rounded-full">
          {badge}
        </span>
      )}
      {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-canopy-accent" />}
    </button>
  );
});

interface DiagnosticsDockProps {
  onRetry?: (id: string, action: RetryAction, args?: Record<string, unknown>) => void;
  className?: string;
}

export function DiagnosticsDock({ onRetry, className }: DiagnosticsDockProps) {
  const { isOpen, activeTab, height, openDock, closeDock, setActiveTab, setHeight } =
    useDiagnosticsStore();
  const errorCount = useErrorStore((state) => state.errors.filter((e) => !e.dismissed).length);
  const prevErrorCountRef = useRef(0);

  // Auto-open dock to Problems tab when first error appears
  useEffect(() => {
    // Only auto-open when going from 0 to 1+ errors and dock is closed
    if (errorCount > 0 && prevErrorCountRef.current === 0 && !isOpen) {
      openDock("problems");
    }
    prevErrorCountRef.current = errorCount;
  }, [errorCount, isOpen, openDock]);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);

  // Handle resize drag
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      resizeStartY.current = e.clientY;
      resizeStartHeight.current = height;
    },
    [height]
  );

  // Handle resize drag move
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = resizeStartY.current - e.clientY;
      const newHeight = resizeStartHeight.current + deltaY;
      const maxHeight = window.innerHeight * DIAGNOSTICS_MAX_HEIGHT_RATIO;
      const clampedHeight = Math.min(Math.max(newHeight, DIAGNOSTICS_MIN_HEIGHT), maxHeight);
      setHeight(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, setHeight]);

  // Persist height changes
  useEffect(() => {
    if (!isResizing && isOpen) {
      const timer = setTimeout(async () => {
        try {
          await window.electron?.app.setState({ diagnosticsHeight: height });
        } catch (error) {
          console.error("Failed to persist diagnostics height:", error);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [height, isResizing, isOpen]);

  // Restore height from persisted state
  useEffect(() => {
    const restoreHeight = async () => {
      try {
        const appState = await window.electron?.app.getState();
        if (appState?.diagnosticsHeight) {
          setHeight(appState.diagnosticsHeight);
        }
      } catch (error) {
        console.error("Failed to restore diagnostics height:", error);
      }
    };
    restoreHeight();
  }, [setHeight]);

  if (!isOpen) return null;

  const tabs: { id: DiagnosticsTab; label: string; badge?: number }[] = [
    { id: "problems", label: "Problems", badge: errorCount },
    { id: "logs", label: "Logs" },
    { id: "events", label: "Events" },
  ];

  return (
    <div
      className={cn(
        "flex flex-col border-t border-canopy-border bg-canopy-bg",
        "transition-[height] duration-200 ease-out",
        isResizing && "select-none",
        className
      )}
      style={{ height }}
      role="region"
      aria-label="Diagnostics dock"
    >
      {/* Resize handle */}
      <div
        className={cn(
          "h-1 cursor-ns-resize transition-colors",
          "hover:bg-canopy-accent/50",
          isResizing && "bg-canopy-accent"
        )}
        onMouseDown={handleResizeStart}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize diagnostics dock"
      />

      {/* Header with tabs */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-canopy-border bg-canopy-sidebar shrink-0">
        {/* Tabs */}
        <div className="flex items-center gap-2" role="tablist" aria-label="Diagnostics tabs">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab.id}
              label={tab.label}
              isActive={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              badge={tab.badge}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Tab-specific actions */}
          {activeTab === "problems" && <ProblemsActions />}
          {activeTab === "logs" && <LogsActions />}
          {activeTab === "events" && <EventsActions />}

          {/* Close button */}
          <button
            onClick={closeDock}
            className="p-1.5 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-gray-200"
            title="Close diagnostics dock"
            aria-label="Close diagnostics dock"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "problems" && (
          <div
            id="diagnostics-problems-panel"
            role="tabpanel"
            aria-labelledby="diagnostics-problems-tab"
            className="h-full"
          >
            <ProblemsContent onRetry={onRetry} />
          </div>
        )}
        {activeTab === "logs" && (
          <div
            id="diagnostics-logs-panel"
            role="tabpanel"
            aria-labelledby="diagnostics-logs-tab"
            className="h-full"
          >
            <LogsContent />
          </div>
        )}
        {activeTab === "events" && (
          <div
            id="diagnostics-events-panel"
            role="tabpanel"
            aria-labelledby="diagnostics-events-tab"
            className="h-full"
          >
            <EventsContent />
          </div>
        )}
      </div>
    </div>
  );
}
