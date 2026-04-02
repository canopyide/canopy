import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

export function McpServerIcon({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect x="8" y="8" width="8" height="8" rx="1.5" />
      <line x1="12" y1="8" x2="12" y2="5" />
      <circle cx="12" cy="3" r="2" />
      <line x1="9" y1="15.5" x2="5.5" y2="19" />
      <circle cx="4" cy="20.5" r="2" />
      <line x1="15" y1="15.5" x2="18.5" y2="19" />
      <circle cx="20" cy="20.5" r="2" />
    </svg>
  );
}
