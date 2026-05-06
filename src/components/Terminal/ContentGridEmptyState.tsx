import { Settings } from "lucide-react";
import { DaintreeIcon } from "@/components/icons";
import { ProjectPulseCard } from "@/components/Pulse";
import { svgToDataUrl, sanitizeSvg } from "@/lib/svg";
import { usePanelStore } from "@/store/panelStore";
import { RotatingTip } from "./contentGridTips";
import { RecipeRunner } from "./RecipeRunner/RecipeRunner";

export function ContentGridEmptyState({
  hasActiveWorktree,
  hasWorktrees,
  activeWorktreeName,
  activeWorktreeId,
  showProjectPulse,
  projectIconSvg,
  defaultCwd,
}: {
  hasActiveWorktree: boolean;
  hasWorktrees: boolean;
  activeWorktreeName?: string | null;
  activeWorktreeId?: string | null;
  showProjectPulse: boolean;
  projectIconSvg?: string;
  defaultCwd?: string;
}) {
  "use memo";

  const hasEverLaunchedAgent = usePanelStore((state) =>
    state.panelIds.some((id) => {
      const p = state.panelsById[id];
      return (
        Boolean(p?.launchAgentId) || Boolean(p?.detectedAgentId) || p?.everDetectedAgent === true
      );
    })
  );

  const handleOpenProjectSettings = () => {
    window.dispatchEvent(
      new CustomEvent("daintree:open-settings-tab", {
        detail: { tab: "project:general" },
      })
    );
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-8 animate-in fade-in duration-500">
      <div className="max-w-3xl w-full flex flex-col items-center">
        {hasActiveWorktree && (
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="relative group mb-4">
              {projectIconSvg ? (
                (() => {
                  const sanitized = sanitizeSvg(projectIconSvg);
                  if (!sanitized.ok) {
                    return <DaintreeIcon className="h-28 w-28 text-tint/65" />;
                  }
                  return (
                    <img
                      src={svgToDataUrl(sanitized.svg)}
                      alt="Project icon"
                      className="h-28 w-28 object-contain"
                    />
                  );
                })()
              ) : (
                <DaintreeIcon className="h-28 w-28 text-tint/65" />
              )}
              <button
                type="button"
                onClick={handleOpenProjectSettings}
                className="absolute -bottom-1 -right-1 p-1.5 bg-daintree-sidebar border border-daintree-border rounded-full opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity hover:bg-daintree-bg focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-daintree-accent"
                aria-label="Change project icon"
              >
                <Settings className="h-3 w-3 text-daintree-text/70" />
              </button>
            </div>
            <h3 className="text-2xl font-semibold text-daintree-text tracking-tight mb-3">
              {activeWorktreeName || "Daintree"}
            </h3>
          </div>
        )}

        {!hasActiveWorktree && (
          <p
            className="text-sm text-daintree-text/60 max-w-md leading-relaxed text-center"
            role="status"
            aria-live="polite"
          >
            {hasWorktrees
              ? "Select a worktree in the sidebar to get started"
              : "Open a directory in the sidebar to get started"}
          </p>
        )}

        {hasActiveWorktree && hasEverLaunchedAgent && (
          <div className="mb-6 w-full flex justify-center">
            <RecipeRunner activeWorktreeId={activeWorktreeId} defaultCwd={defaultCwd} />
          </div>
        )}

        {showProjectPulse && hasActiveWorktree && activeWorktreeId && (
          <div className="flex justify-center mb-8">
            <ProjectPulseCard worktreeId={activeWorktreeId} />
          </div>
        )}

        {hasActiveWorktree && hasEverLaunchedAgent && (
          <div className="flex flex-col items-center gap-4 mt-4">
            <RotatingTip />
          </div>
        )}
      </div>
    </div>
  );
}
