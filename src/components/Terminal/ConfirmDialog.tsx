import { useEffect, useCallback, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOverlayState } from "@/hooks";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useOverlayState(isOpen);

  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Handle escape key only; let buttons handle Enter to avoid accidental confirms
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [onCancel]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  useEffect(() => {
    if (!isOpen) return;
    cancelButtonRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      aria-describedby={dialogDescriptionId}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full max-w-md mx-4 rounded-lg border border-canopy-border bg-canopy-sidebar p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={dialogTitleId} className="text-lg font-semibold text-canopy-text mb-2">
          {title}
        </h2>
        <p id={dialogDescriptionId} className="text-sm text-canopy-text/70 mb-6">
          {description}
        </p>

        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            className="text-canopy-text hover:bg-canopy-border"
            ref={cancelButtonRef}
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            className={cn(
              "font-medium",
              destructive
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-canopy-accent hover:bg-canopy-accent/90 text-white"
            )}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
