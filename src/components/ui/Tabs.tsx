/**
 * Tabs Component
 *
 * A reusable tab navigation component with underline-style highlighting.
 * Designed for consistent tab behavior across the app with full accessibility.
 *
 * Features:
 * - Optional icons per tab
 * - Underline-style active state
 * - Full keyboard navigation (Arrow keys, Home, End)
 * - Proper ARIA attributes for accessibility
 * - Roving tabindex (only active tab is tabbable)
 * - Support for dynamic labels
 */

import { useRef, useCallback, type ReactNode, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface TabOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface TabsProps {
  /** Currently selected tab value */
  value: string;
  /** Callback when tab selection changes */
  onChange: (value: string) => void;
  /** Tab options to display */
  options: TabOption[];
  /** Additional CSS classes for the container */
  className?: string;
  /** Whether tabs should stretch to fill available space */
  fullWidth?: boolean;
  /** ARIA label for the tablist */
  ariaLabel?: string;
  /** Optional ID prefix for generating tab and panel IDs for ARIA relationships */
  idPrefix?: string;
}

export function Tabs({
  value,
  onChange,
  options,
  className,
  fullWidth = false,
  ariaLabel = "Tab navigation",
  idPrefix,
}: TabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(index, options.length - 1));
      tabRefs.current[clampedIndex]?.focus();
    },
    [options.length]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      let handled = true;
      let newIndex = currentIndex;

      switch (event.key) {
        case "ArrowLeft":
        case "ArrowUp":
          // Move to previous tab, wrap to end
          newIndex = currentIndex === 0 ? options.length - 1 : currentIndex - 1;
          break;
        case "ArrowRight":
        case "ArrowDown":
          // Move to next tab, wrap to start
          newIndex = currentIndex === options.length - 1 ? 0 : currentIndex + 1;
          break;
        case "Home":
          // Move to first tab
          newIndex = 0;
          break;
        case "End":
          // Move to last tab
          newIndex = options.length - 1;
          break;
        default:
          handled = false;
      }

      if (handled) {
        event.preventDefault();
        // Only call onChange if the value actually changes
        const newValue = options[newIndex].value;
        if (newValue !== value) {
          onChange(newValue);
        }
        focusTab(newIndex);
      }
    },
    [focusTab, options, onChange, value]
  );

  if (options.length === 0) {
    return null;
  }

  // Find the active tab index, fallback to first tab if value not found
  const activeIndex = options.findIndex((opt) => opt.value === value);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={cn("flex border-b border-canopy-border", className)}
    >
      {options.map((option, index) => {
        const isActive = value === option.value || (activeIndex === -1 && index === 0);
        const tabId = idPrefix ? `${idPrefix}-tab-${option.value}` : undefined;
        const panelId = idPrefix ? `${idPrefix}-panel-${option.value}` : undefined;

        return (
          <button
            key={option.value}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={tabId}
            aria-selected={isActive}
            aria-controls={panelId}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy-accent focus-visible:ring-inset",
              fullWidth && "flex-1",
              isActive
                ? "text-canopy-accent border-b-2 border-canopy-accent -mb-px"
                : "text-gray-400 hover:text-gray-200"
            )}
          >
            {option.icon && <span className="mr-2">{option.icon}</span>}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
