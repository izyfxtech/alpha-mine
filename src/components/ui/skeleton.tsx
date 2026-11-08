import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** A grey placeholder block shown where content is still loading. It pulses unless the person prefers reduced motion. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}
