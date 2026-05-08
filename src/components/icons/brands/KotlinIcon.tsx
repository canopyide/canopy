import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

type KotlinIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export function KotlinIcon({ className, size = 16, ...props }: KotlinIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn(className)}
      aria-hidden="true"
      {...props}
    >
      <path fill="currentColor" d="M24 24H0V0h24L12 12Z" />
    </svg>
  );
}

export default KotlinIcon;
