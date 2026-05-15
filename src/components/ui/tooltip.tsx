import * as React from "react";
import type * as TooltipPrimitiveType from "@radix-ui/react-tooltip";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { primeOnEvent, useRadixPrimitives } from "./radix-loader";
import { FixedDropdownVisibleContext } from "./fixed-dropdown";

type TooltipProviderProps = React.ComponentProps<typeof TooltipPrimitiveType.Provider>;

const TooltipProvider = ({ children, ...props }: TooltipProviderProps) => {
  const radix = useRadixPrimitives();
  if (!radix) return <>{children}</>;
  const Provider = radix.TooltipPrimitive.Provider;
  return <Provider {...props}>{children}</Provider>;
};
TooltipProvider.displayName = "TooltipProvider";

type TooltipRootProps = React.ComponentProps<typeof TooltipPrimitiveType.Root>;

const Tooltip = ({ children, open, ...props }: TooltipRootProps) => {
  const radix = useRadixPrimitives();
  // When the surrounding keepMounted FixedDropdown has transitioned to the
  // Activity-hidden state, force `open={false}` on the Radix Root so any
  // tooltip whose dismiss path was skipped by the synchronous `display:none`
  // gets explicitly closed before its portaled content can strand at (0,0)
  // on document.body (issue #8001). Outside that subtree the context default
  // (`true`) preserves the caller's `open` value, so uncontrolled tooltips
  // and any explicit `open={true}` callers keep working unchanged.
  const dropdownVisible = React.useContext(FixedDropdownVisibleContext);
  const effectiveOpen = dropdownVisible ? open : false;
  if (!radix) return <>{children}</>;
  const Root = radix.TooltipPrimitive.Root;
  return (
    <Root {...props} open={effectiveOpen}>
      {children}
    </Root>
  );
};
Tooltip.displayName = "Tooltip";

type TooltipTriggerProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitiveType.Trigger>;

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitiveType.Trigger>,
  TooltipTriggerProps
>(({ asChild, children, onPointerEnter, onFocusCapture, ...props }, ref) => {
  const radix = useRadixPrimitives();

  const handlePointerEnter: React.PointerEventHandler<HTMLButtonElement> = (event) => {
    primeOnEvent();
    onPointerEnter?.(event);
  };
  const handleFocusCapture: React.FocusEventHandler<HTMLButtonElement> = (event) => {
    primeOnEvent();
    onFocusCapture?.(event);
  };

  if (!radix) {
    if (asChild) {
      return (
        <Slot
          ref={ref}
          onPointerEnter={handlePointerEnter}
          onFocusCapture={handleFocusCapture}
          {...props}
        >
          {children}
        </Slot>
      );
    }
    return (
      <button
        type="button"
        ref={ref as React.Ref<HTMLButtonElement>}
        onPointerEnter={handlePointerEnter}
        onFocusCapture={handleFocusCapture}
        {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </button>
    );
  }

  const Trigger = radix.TooltipPrimitive.Trigger;
  return (
    <Trigger
      ref={ref}
      asChild={asChild}
      onPointerEnter={handlePointerEnter}
      onFocusCapture={handleFocusCapture}
      {...props}
    >
      {children}
    </Trigger>
  );
});
TooltipTrigger.displayName = "TooltipTrigger";

type TooltipContentProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitiveType.Content>;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitiveType.Content>,
  TooltipContentProps
>(({ className, sideOffset = 4, style, ...props }, ref) => {
  const radix = useRadixPrimitives();
  if (!radix) return null;
  const Portal = radix.TooltipPrimitive.Portal;
  const Content = radix.TooltipPrimitive.Content;
  return (
    <Portal>
      <Content
        ref={ref}
        sideOffset={sideOffset}
        style={{ transformOrigin: "var(--radix-tooltip-content-transform-origin)", ...style }}
        className={cn(
          "z-[var(--z-popover)] overflow-hidden rounded-[var(--radius-md)] surface-overlay shadow-overlay px-3 py-1.5 text-xs text-daintree-text",
          "animate-in fade-in-0 zoom-in-95 duration-150 data-[state=closed]:animate-out data-[state=closed]:duration-[100ms] data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
          className
        )}
        {...props}
      />
    </Portal>
  );
});
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
