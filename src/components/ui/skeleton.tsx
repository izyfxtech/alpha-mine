import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A placeholder block shown where content is still loading. A soft highlight sweeps across it from left to right; people who
 * prefer reduced motion get a plain block (see `.skeleton` in styles.css). It is a span so it can sit inside text as well as
 * beside it; give it the width and height of the thing it stands in for.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span aria-hidden="true" className={cn("skeleton block rounded-md", className)} {...props} />
  );
}
