import { cn } from "@/lib/utils";

interface OpenCodeIconProps {
  className?: string;
  size?: number;
  brandColor?: string;
}

export function OpenCodeIcon({ className, size = 16, brandColor }: OpenCodeIconProps) {
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
        fill={brandColor || "currentColor"}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm2 0h14v14H5V5zm3.293 4.293a1 1 0 011.414 0L12 11.586l2.293-2.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414zM8 15a1 1 0 100 2h8a1 1 0 100-2H8z"
      />
    </svg>
  );
}

export default OpenCodeIcon;
