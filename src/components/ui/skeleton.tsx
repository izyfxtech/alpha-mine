import type { HTMLAttributes, ReactNode } from "react";
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

/**
 * A placeholder for one line of text. The block sits inside a line box of the surrounding font, so the line is exactly as
 * tall as it would be with real text, whatever the font size and line height are.
 */
export function SkeletonText({ className }: { className?: string }) {
  return (
    <span className="block">
      <Skeleton className={cn("inline-block h-3 w-12 align-middle", className)} />
    </span>
  );
}

/**
 * A placeholder shaped by sample text: the block takes the width and height the sample would have, in the surrounding
 * font, while the text itself stays hidden. Use it where the real content is a short label of roughly known length.
 */
export function SkeletonGhost({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn("skeleton inline-block rounded-md", className)}>
      <span className="invisible">{children}</span>
    </span>
  );
}
