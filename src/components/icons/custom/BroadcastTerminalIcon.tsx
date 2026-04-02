import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

export function BroadcastTerminalIcon({ className, ...props }: IconProps) {
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
      <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10" />
      <polyline points="7 12 9.5 14.5 7 17" />
      <line x1="12" y1="17" x2="15" y2="17" />
      <path d="M18.5 7a3 3 0 0 0 2.5-3" />
      <path d="M18.5 9.5a6 6 0 0 0 4.5-5.5" />
    </svg>
  );
}
