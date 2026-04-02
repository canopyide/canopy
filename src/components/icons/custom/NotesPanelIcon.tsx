import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

export function NotesPanelIcon({ className, ...props }: IconProps) {
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
      <path d="M12 20a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 9.1 5 11 5 13a7 7 0 0 0 7 7z" />
      <line x1="12" y1="20" x2="12" y2="22.5" />
      <line x1="9" y1="10.5" x2="15" y2="10.5" />
      <line x1="10" y1="14" x2="14" y2="14" />
    </svg>
  );
}
