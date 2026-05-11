import { useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
} from "./dropdown-menu";

interface SplitButtonMenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
}

interface SplitButtonProps {
  primaryLabel: string;
  primaryIcon?: React.ReactNode;
  onPrimaryClick: () => void;
  menuItems: SplitButtonMenuItem[];
  ariaDisabled?: boolean;
  disabledReason?: React.ReactNode;
  isBusy?: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}

export function SplitButton({
  primaryLabel,
  primaryIcon,
  onPrimaryClick,
  menuItems,
  ariaDisabled = false,
  disabledReason,
  isBusy = false,
  variant = "default",
  size = "sm",
  className,
}: SplitButtonProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const blocked = ariaDisabled || isBusy;

  const handlePrimaryClick = useCallback(() => {
    if (blocked) return;
    onPrimaryClick();
  }, [blocked, onPrimaryClick]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (blocked) return;
      setDropdownOpen(next);
    },
    [blocked]
  );

  const primaryButton = (
    <Button
      variant={variant}
      size={size}
      onClick={handlePrimaryClick}
      aria-disabled={blocked || undefined}
      className={cn(
        "rounded-r-none",
        "aria-disabled:opacity-50 aria-disabled:cursor-not-allowed",
        className
      )}
    >
      {primaryIcon}
      {primaryLabel}
    </Button>
  );

  const chevronButton = (
    <DropdownMenuTrigger asChild>
      <Button
        variant={variant}
        size={size}
        aria-label="More commit actions"
        aria-disabled={blocked || undefined}
        className={cn(
          "rounded-l-none -ml-px px-1.5",
          "aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
        )}
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </Button>
    </DropdownMenuTrigger>
  );

  const buttonGroup = (
    <div className="flex w-full">
      {primaryButton}
      <DropdownMenu open={dropdownOpen} onOpenChange={handleOpenChange}>
        {chevronButton}
        <DropdownMenuContent side="bottom" align="end" sideOffset={4}>
          {menuItems.map((item) => (
            <DropdownMenuItem
              key={item.label}
              disabled={blocked}
              onClick={(e) => {
                e.preventDefault();
                if (blocked) return;
                item.onClick();
              }}
            >
              {item.icon && <span className="mr-2">{item.icon}</span>}
              {item.label}
              {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  if (ariaDisabled && disabledReason) {
    return (
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>{buttonGroup}</TooltipTrigger>
        <TooltipContent side="top" align="center" className="p-3 max-w-[260px]">
          {disabledReason}
        </TooltipContent>
      </Tooltip>
    );
  }

  return buttonGroup;
}
