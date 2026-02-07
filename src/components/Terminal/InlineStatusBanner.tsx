import React, { useState, useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "accent" | "dismiss" | "danger";

export interface BannerAction {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: ButtonVariant;
  onClick: () => void;
  ariaLabel?: string;
  title?: string;
  iconOnly?: boolean;
}

export interface InlineStatusBannerProps {
  icon: React.ComponentType<{ className?: string; style?: CSSProperties }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  contextLine?: React.ReactNode;
  severity?: "error" | "warning";
  animated?: boolean;
  className?: string;
  actions: BannerAction[];
  role?: "alert" | "status";
  ariaLive?: "polite" | "assertive";
}

const SEVERITY_VAR: Record<"error" | "warning", string> = {
  error: "--color-status-error",
  warning: "--color-status-warning",
};

function getButtonClasses(variant: ButtonVariant, colorVar: string): string {
  switch (variant) {
    case "primary":
      return "bg-canopy-border text-canopy-text hover:bg-canopy-border/80";
    case "accent":
      return "bg-canopy-accent/10 text-canopy-accent hover:bg-canopy-accent/20";
    case "dismiss":
      return "text-canopy-text/60 hover:text-canopy-text hover:bg-canopy-border/50";
    case "danger":
      return `text-[var(${colorVar})]/70 hover:text-[var(${colorVar})] hover:bg-[var(${colorVar})]/10`;
  }
}

function InlineStatusBannerComponent({
  icon: IconComponent,
  title,
  description,
  contextLine,
  severity = "error",
  animated = true,
  className,
  actions,
  role = "alert",
  ariaLive = "polite",
}: InlineStatusBannerProps) {
  const [isVisible, setIsVisible] = useState(!animated);
  const rafRef = useRef<number | null>(null);
  const colorVar = SEVERITY_VAR[severity];

  useEffect(() => {
    if (!animated) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setIsVisible(true);
    });

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [animated]);

  const hasDescription = description || contextLine;

  return (
    <div
      className={cn(
        hasDescription
          ? "flex flex-col gap-2 px-3 py-2 shrink-0"
          : "flex items-center justify-between gap-3 px-3 py-2 shrink-0",
        animated && "transition-all duration-150",
        animated &&
          "motion-reduce:transition-none motion-reduce:duration-0 motion-reduce:transform-none",
        animated && (isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"),
        className
      )}
      style={{
        backgroundColor: `color-mix(in oklab, var(${colorVar}) 10%, transparent)`,
        borderBottom: `1px solid color-mix(in oklab, var(${colorVar}) 20%, transparent)`,
      }}
      role={role}
      aria-live={ariaLive}
    >
      <div className={cn("flex", hasDescription ? "items-start" : "items-center", "gap-2 min-w-0")}>
        <IconComponent
          className={cn("w-4 h-4 shrink-0", hasDescription && "mt-0.5")}
          style={{ color: `var(${colorVar})` }}
          aria-hidden="true"
        />
        {hasDescription ? (
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium" style={{ color: `var(${colorVar})` }}>
              {title}
            </span>
            {description && (
              <p
                className="text-xs mt-0.5"
                style={{ color: `color-mix(in oklab, var(${colorVar}) 80%, transparent)` }}
              >
                {description}
              </p>
            )}
            {contextLine && (
              <p
                className="text-xs font-mono mt-1 truncate"
                style={{ color: `color-mix(in oklab, var(${colorVar}) 60%, transparent)` }}
              >
                {contextLine}
              </p>
            )}
          </div>
        ) : (
          <span className="text-sm" style={{ color: `var(${colorVar})` }}>
            {title}
          </span>
        )}
      </div>

      <div className={cn("flex items-center shrink-0", hasDescription ? "gap-2 ml-6" : "gap-1")}>
        {actions.map((action) => {
          const variantClasses = getButtonClasses(action.variant ?? "primary", colorVar);
          return (
            <button
              key={action.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
              className={cn(
                action.iconOnly
                  ? "p-1 rounded transition-colors"
                  : "flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors",
                variantClasses
              )}
              title={action.title}
              aria-label={action.ariaLabel}
            >
              {action.icon && (
                <action.icon
                  className={action.iconOnly ? "w-3.5 h-3.5" : "w-3 h-3"}
                  aria-hidden="true"
                />
              )}
              {!action.iconOnly && action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const InlineStatusBanner = React.memo(InlineStatusBannerComponent);
