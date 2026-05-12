import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateCommonProps = {
  title: string;
  className?: string;
};

export type EmptyStateScale = "popover" | "sidebar" | "canvas";

export type EmptyStateProps =
  | (EmptyStateCommonProps & {
      variant: "zero-data";
      scale: "popover" | "sidebar";
      icon?: ReactNode;
      description?: never;
      action?: ReactNode;
    })
  | (EmptyStateCommonProps & {
      variant: "zero-data";
      scale: "canvas";
      icon?: ReactNode;
      description?: ReactNode;
      action?: ReactNode;
    })
  | (EmptyStateCommonProps & {
      variant: "filtered-empty";
      scale: "popover" | "sidebar";
      description?: never;
      action?: ReactNode;
    })
  | (EmptyStateCommonProps & {
      variant: "filtered-empty";
      scale: "canvas";
      description?: ReactNode;
      action?: ReactNode;
    })
  | (EmptyStateCommonProps & {
      variant: "user-cleared";
      scale: "popover" | "sidebar" | "canvas";
      icon?: ReactNode;
      description?: never;
      action?: never;
    });

export function EmptyState(props: EmptyStateProps) {
  const { variant, title, className } = props;
  const rawDescription =
    variant === "user-cleared" ? undefined : "description" in props ? props.description : undefined;
  const descriptionId = useId();
  const hasDescription =
    rawDescription !== undefined &&
    rawDescription !== null &&
    rawDescription !== false &&
    rawDescription !== "";

  const icon = variant === "filtered-empty" ? null : props.icon;
  const action = variant === "user-cleared" ? null : props.action;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-describedby={hasDescription ? descriptionId : undefined}
      className={cn(
        "@container/empty-state flex flex-col items-center justify-center text-center px-4 py-8",
        className
      )}
    >
      <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150 flex flex-col items-center gap-2">
        {icon ? (
          <div
            className="text-daintree-text/30 [&_svg]:h-6 [&_svg]:w-6 @max-[280px]/empty-state:[&_svg]:h-4 @max-[280px]/empty-state:[&_svg]:w-4"
            aria-hidden="true"
          >
            {icon}
          </div>
        ) : null}
        <p className="text-sm font-medium text-daintree-text/70">{title}</p>
        {hasDescription ? (
          <p id={descriptionId} className="text-xs text-daintree-text/50 max-w-xs">
            {rawDescription}
          </p>
        ) : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}
