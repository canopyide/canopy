import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useDockRenderState } from "@/hooks/useDockRenderState";
import { ContentDock } from "./ContentDock";
import { DockHandleOverlay } from "./DockHandleOverlay";
import { DockStatusOverlay } from "./DockStatusOverlay";

export function TerminalDockRegion() {
  const {
    shouldShowInLayout,
    showStatusOverlay,
    density,
    isHydrated,
    waitingCount,
    failedCount,
    trashedCount,
  } = useDockRenderState();

  // Before hydration, only show the handle overlay to prevent flash of incorrect state
  if (!isHydrated) {
    return <DockHandleOverlay />;
  }

  return (
    <>
      {/* ContentDock in layout when visible */}
      {shouldShowInLayout && (
        <ErrorBoundary variant="section" componentName="ContentDock">
          <ContentDock density={density} />
        </ErrorBoundary>
      )}

      {/* Handle overlay is always visible at bottom edge for discoverability */}
      <DockHandleOverlay />

      {/* Status overlay when dock is hidden but has status counts */}
      {showStatusOverlay && (
        <DockStatusOverlay
          waitingCount={waitingCount}
          failedCount={failedCount}
          trashedCount={trashedCount}
        />
      )}
    </>
  );
}
