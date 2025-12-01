/**
 * Canopy Brand Icon Component
 *
 * Custom SVG icon for the Canopy application.
 * Rendered as monochrome to inherit text color via currentColor.
 */

import { cn } from "@/lib/utils";

interface CanopyIconProps {
  className?: string;
  size?: number;
}

export function CanopyIcon({ className, size = 16 }: CanopyIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12 2L5.5 13H9l-3.5 9h13l-3.5-9h3.5L12 2z"
      />
    </svg>
  );
}

export default CanopyIcon;
