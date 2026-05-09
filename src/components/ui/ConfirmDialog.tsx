import type React from "react";
import { useEffect, useState } from "react";
import { AppDialog, type DialogZIndex } from "@/components/ui/AppDialog";
import { TypedNameConfirmInput } from "@/components/ui/TypedNameConfirmInput";

const DESTRUCTIVE_CONFIRM_LABEL_RE =
  /^\s*(delete|remove|destroy|erase|wipe|purge|abort|reset|revoke|terminate|uninstall)\b/i;

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose?: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  isConfirmLoading?: boolean;
  variant: "default" | "destructive" | "info";
  zIndex?: DialogZIndex;
  typedNameTarget?: string;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  isConfirmLoading = false,
  variant,
  zIndex,
  typedNameTarget,
}: ConfirmDialogProps) {
  const handleClose = onClose ?? (() => {});
  const [typedValue, setTypedValue] = useState("");

  useEffect(() => {
    if (!isOpen) setTypedValue("");
  }, [isOpen]);

  if (
    import.meta.env.DEV &&
    variant !== "destructive" &&
    DESTRUCTIVE_CONFIRM_LABEL_RE.test(confirmLabel)
  ) {
    // eslint-disable-next-line no-console
    console.error(
      `[ConfirmDialog] Destructive confirmLabel "${confirmLabel}" rendered with variant="${variant}". Use variant="destructive" so the primary button gets the destructive styling.`
    );
  }

  if (import.meta.env.DEV && typedNameTarget && variant !== "destructive") {
    // eslint-disable-next-line no-console
    console.error(
      `[ConfirmDialog] typedNameTarget="${typedNameTarget}" was set with variant="${variant}". The typed-name gate is intended for destructive actions; use variant="destructive".`
    );
  }

  const hasTypedNameGate = !!typedNameTarget;
  const isTypedMatched = !hasTypedNameGate || typedValue === typedNameTarget;

  const handleConfirm = () => {
    if (hasTypedNameGate && !isTypedMatched) return;
    return onConfirm();
  };

  return (
    <AppDialog isOpen={isOpen} onClose={handleClose} size="sm" variant={variant} zIndex={zIndex}>
      <AppDialog.Header>
        <AppDialog.Title>{title}</AppDialog.Title>
        {onClose && <AppDialog.CloseButton />}
      </AppDialog.Header>

      <AppDialog.Body className="space-y-3">
        {description && <AppDialog.Description>{description}</AppDialog.Description>}
        {children}
        {hasTypedNameGate && (
          <TypedNameConfirmInput
            target={typedNameTarget}
            value={typedValue}
            onChange={setTypedValue}
            onMatchSubmit={() => {
              void handleConfirm();
            }}
          />
        )}
      </AppDialog.Body>

      <AppDialog.Footer
        secondaryAction={{
          label: cancelLabel,
          onClick: handleClose,
          disabled: isConfirmLoading || !onClose,
        }}
        primaryAction={{
          label: confirmLabel,
          onClick: handleConfirm,
          loading: isConfirmLoading,
          disabled: hasTypedNameGate && !isTypedMatched,
          intent: variant === "destructive" ? "destructive" : "default",
        }}
      />
    </AppDialog>
  );
}
