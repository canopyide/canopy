import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useOverlayState } from "@/hooks";
import { FileDiffModal } from "../FileDiffModal";
import { BaseBranchDiffModal } from "./BaseBranchDiffModal";
import { useReviewHubState } from "./useReviewHubState";
import { ReviewHubBody } from "./ReviewHubBody";

interface ReviewHubProps {
  isOpen: boolean;
  worktreePath: string;
  onClose: () => void;
}

export function ReviewHub({ isOpen, worktreePath, onClose }: ReviewHubProps) {
  const state = useReviewHubState({ worktreePath, active: isOpen });
  const {
    selectedFile,
    selectedBaseBranchFile,
    mainBranch,
    status,
    setSelectedFile,
    setSelectedBaseBranchFile,
  } = state;
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useOverlayState(isOpen);

  const handleKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (selectedFile) {
        setSelectedFile(null);
      } else if (selectedBaseBranchFile) {
        setSelectedBaseBranchFile(null);
      } else {
        onClose();
      }
    }
  });

  useEffect(() => {
    if (!isOpen) return;
    const timeoutId = setTimeout(() => closeButtonRef.current?.focus(), 50);
    return () => clearTimeout(timeoutId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!isOpen) return null;

  return createPortal(
    <>
      <div
        className={cn(
          "fixed inset-0 z-[var(--z-modal)] flex items-center justify-center",
          "bg-scrim-medium backdrop-blur-sm",
          "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
        )}
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-hub-title"
        data-testid="review-hub"
      >
        <div
          className={cn(
            "relative flex flex-col",
            "w-[min(720px,calc(100vw-80px))] max-h-[calc(100vh-80px)] min-h-[320px]",
            "bg-daintree-bg rounded-xl",
            "border border-divider",
            "shadow-[var(--theme-shadow-dialog)]",
            "motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <ReviewHubBody state={state} onClose={onClose} closeButtonRef={closeButtonRef} />
        </div>
      </div>

      {/* File diff modal — working-tree mode */}
      <FileDiffModal
        isOpen={selectedFile !== null}
        filePath={selectedFile?.path ?? ""}
        status={selectedFile?.status ?? "modified"}
        worktreePath={worktreePath}
        onClose={() => setSelectedFile(null)}
      />

      {/* File diff modal — base-branch mode */}
      <BaseBranchDiffModal
        isOpen={selectedBaseBranchFile !== null}
        filePath={selectedBaseBranchFile?.path ?? ""}
        worktreePath={worktreePath}
        mainBranch={mainBranch}
        currentBranch={status?.currentBranch ?? "HEAD"}
        onClose={() => setSelectedBaseBranchFile(null)}
      />
    </>,
    document.body
  );
}
