import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A placeholder block shown where content is still loading. A soft highlight sweeps across it from left to right; people who
 * prefer reduced motion get a plain block (see `.skeleton` in styles.css).
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("skeleton rounded-md", className)} {...props} />;
}
