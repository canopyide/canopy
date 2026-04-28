import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;

type ZeroDataProps = {
  variant: "zero-data";
  icon?: IconComponent;
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
  className?: string;
};

type FilteredEmptyProps = {
  variant: "filtered-empty";
  message: string;
  clearLabel?: string;
  onClear?: () => void;
  className?: string;
};

type AcknowledgedProps = {
  variant: "acknowledged";
  message: string;
  className?: string;
};

export type EmptyStateProps = ZeroDataProps | FilteredEmptyProps | AcknowledgedProps;

export function EmptyState(props: EmptyStateProps) {
  if (props.variant === "zero-data") {
    const { icon: Icon, title, description, ctaLabel, onCta, className } = props;
    return (
      <div
        className={cn("flex flex-col items-center justify-center gap-3 p-6 text-center", className)}
      >
        {Icon && <Icon className="h-6 w-6 text-daintree-text/40 opacity-70" aria-hidden="true" />}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-daintree-text/80">{title}</p>
          {description && <p className="text-xs text-daintree-text/50 max-w-xs">{description}</p>}
        </div>
        {ctaLabel && onCta && (
          <Button type="button" variant="outline" size="sm" onClick={onCta} className="mt-1">
            {ctaLabel}
          </Button>
        )}
      </div>
    );
  }

  if (props.variant === "filtered-empty") {
    const { message, clearLabel = "Clear search", onClear, className } = props;
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn("flex flex-col items-center justify-center gap-2 p-6 text-center", className)}
      >
        <p className="text-sm text-daintree-text/60">{message}</p>
        {onClear && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-daintree-text/60 hover:text-daintree-text"
          >
            {clearLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center p-6 text-center", props.className)}>
      <p className="text-sm text-daintree-text/60">{props.message}</p>
    </div>
  );
}
