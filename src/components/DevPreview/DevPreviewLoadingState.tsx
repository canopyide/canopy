import { useDeferredLoading } from "@/hooks/useDeferredLoading";
import { UI_DOHERTY_THRESHOLD } from "@/lib/animationUtils";
import { SkeletonHint } from "@/components/ui/Skeleton";

interface DevPreviewLoadingStateProps {
  isPending: boolean;
  phaseLabel: string | null;
  variant: "full" | "overlay";
  className?: string;
}

export function DevPreviewLoadingState({
  isPending,
  phaseLabel,
  variant,
  className,
}: DevPreviewLoadingStateProps) {
  const showLoader = useDeferredLoading(isPending, UI_DOHERTY_THRESHOLD);

  if (!showLoader) return null;

  if (variant === "overlay") {
    return (
      <div
        className={`absolute inset-0 z-10 flex flex-col items-center justify-center bg-daintree-bg gap-3 ${className ?? ""}`}
        role="status"
        aria-busy="true"
      >
        {phaseLabel && (
          <p aria-live="polite" className="text-sm text-daintree-text/60">
            {phaseLabel}
          </p>
        )}
        <SkeletonHint className="pointer-events-auto" />
      </div>
    );
  }

  return (
    <div
      className={`absolute inset-0 flex flex-col bg-daintree-bg ${className ?? ""}`}
      role="status"
      aria-busy="true"
      aria-label={phaseLabel ?? "Loading dev preview"}
    >
      <span className="sr-only">{phaseLabel ?? "Loading dev preview"}</span>

      {/* Content area skeleton — no header/toolbar (real toolbar renders above) */}
      <div className="flex-1 min-h-0 p-3 space-y-3" aria-hidden="true">
        <div className="animate-pulse-delayed h-4 w-3/4 bg-muted rounded" />
        <div className="animate-pulse-delayed h-4 w-1/2 bg-muted rounded" />
        <div className="animate-pulse-delayed h-4 w-5/6 bg-muted rounded" />
        <div className="animate-pulse-delayed h-3 w-2/3 bg-muted rounded" />
        <div className="animate-pulse-delayed h-32 w-full bg-muted rounded mt-4" />
        <div className="animate-pulse-delayed h-3 w-1/3 bg-muted rounded" />
        <div className="animate-pulse-delayed h-3 w-1/4 bg-muted rounded" />
      </div>

      {/* Phase label */}
      {phaseLabel && (
        <p
          aria-live="polite"
          className="absolute bottom-12 left-1/2 -translate-x-1/2 text-sm text-daintree-text/60"
        >
          {phaseLabel}
        </p>
      )}

      <SkeletonHint className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto" />
    </div>
  );
}
