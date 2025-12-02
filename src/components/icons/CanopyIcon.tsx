/**
 * Canopy Brand Icon Component
 *
 * The official Canopy logo, represented as an SVG.
 */

import { cn } from "@/lib/utils";

interface CanopyIconProps {
  className?: string;
  size?: number;
}

export function CanopyIcon({ className, size = 16 }: CanopyIconProps) {
  return (
    <svg
      viewBox="0 0 148.3303 171.2764"
      aria-label="Canopy Logo"
      width={size}
      height={size}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      aria-hidden="true"
    >
      <path d="M74.165,0L0,42.8188v85.6382l74.165,42.8193,74.1653-42.8193V42.8188L74.165,0ZM74.165,11.2871l59.5024,34.354-25.4973,14.7217-34.0051-19.6323-34.0049,19.6323-25.4971-14.7217L74.165,11.2871ZM79.0527,88.46v-5.4287l-4.8877-3.0366-4.8877-2.8218-19.3418-11.1665,24.2295-13.9888,24.2297,13.9888,4.8877,2.8218v33.6201l-24.2297,13.9888v-27.9771ZM9.7754,54.1064l25.4971,14.7217,9.7754,5.6436,24.2295,13.9883v68.7075L9.7754,122.8135V54.1064ZM138.5549,122.8135l-59.5022,34.354v-29.4434l34.0049-19.6323v-39.2637l25.4973-14.7217v68.707Z"></path>
    </svg>
  );
}

export default CanopyIcon;
