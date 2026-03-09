import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[5px] font-medium transition-[color,background-color,border-color,box-shadow,transform,filter] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:saturate-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground bg-gradient-to-b from-white/12 to-transparent border border-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.5)] hover:brightness-110 active:shadow-[inset_0_2px_3px_rgba(0,0,0,0.2)] active:brightness-95",
        destructive:
          "bg-destructive text-destructive-foreground bg-gradient-to-b from-white/10 to-transparent border border-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_1px_2px_rgba(0,0,0,0.5)] hover:brightness-110 active:shadow-[inset_0_2px_3px_rgba(0,0,0,0.2)] active:brightness-95 focus-visible:ring-destructive",
        outline:
          "border border-white/10 bg-white/5 text-canopy-text shadow-[0_1px_2px_rgba(0,0,0,0.3)] hover:bg-white/10 hover:text-accent-foreground active:bg-white/5 active:shadow-none",
        secondary:
          "bg-secondary text-secondary-foreground border border-white/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.3)] hover:bg-secondary/80 active:shadow-none",
        ghost: "hover:bg-overlay-strong hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        subtle: "bg-canopy-bg text-canopy-text/60 hover:bg-overlay-strong hover:text-canopy-text",
        pill: "rounded-full bg-canopy-bg/50 border border-canopy-border text-canopy-text/60 hover:bg-overlay-strong hover:text-canopy-text/80",
        "ghost-danger":
          "text-status-error hover:bg-status-error/10 focus-visible:ring-status-error",
        "ghost-success": "text-status-success hover:bg-status-success/10",
        "ghost-info": "text-status-info hover:bg-status-info/10",
        info: "bg-status-info text-canopy-bg bg-gradient-to-b from-white/12 to-transparent border border-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.5)] hover:brightness-110 active:shadow-[inset_0_2px_3px_rgba(0,0,0,0.2)] active:brightness-95",
      },
      size: {
        default: "h-8 px-3 gap-2 text-sm [&_svg]:size-4",
        sm: "h-7 px-2.5 gap-1.5 text-xs [&_svg]:size-3.5",
        xs: "h-6 px-2 gap-1 text-xs [&_svg]:size-3",
        lg: "h-9 px-4 gap-2 text-sm [&_svg]:size-4",
        icon: "h-8 w-8 [&_svg]:size-4",
        "icon-sm": "h-7 w-7 [&_svg]:size-3.5",
        "icon-xs": "h-6 w-6 [&_svg]:size-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
