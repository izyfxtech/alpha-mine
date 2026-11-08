import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useJournal, useTrades } from "@/lib/journal/journal-context";
import { PageSkeleton, type SkeletonVariant } from "@/components/layout/PageSkeleton";
import { useDelayedFlag } from "@/lib/use-delayed-flag";

/** Pages that never read trades, so they open at once instead of waiting for them. */
const NO_TRADES = ["/settings", "/plans", "/diary/notebook"];

export const needsTrades = (path: string) =>
  !NO_TRADES.some((p) => path === p || path.startsWith(`${p}/`));

/** Which placeholder layout a page gets, by the start of its path. Anything not listed looks like the dashboard. */
const VARIANTS: [prefix: string, variant: SkeletonVariant][] = [
  ["/journal", "table"],
  ["/open-trades", "table"],
  ["/missed-trades", "table"],
  ["/diary", "table"],
  ["/rules", "table"],
  ["/strategy-lab/alternatives", "table"],
  ["/equity", "chart"],
  ["/analytics", "chart"],
  ["/chart-lab", "chart"],
  ["/edge-finder", "chart"],
  ["/strategy-lab", "chart"],
  ["/reports", "report"],
];

export const skeletonFor = (path: string): SkeletonVariant =>
  VARIANTS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? "dashboard";

/** How long loading must last before the skeleton appears, so a fast or cached load never flashes it. */
export const SKELETON_DELAY_MS = 250;

/** Shows a skeleton until the journal and its trades have loaded the first time, then the page. Later refreshes keep the page. */
export function RouteGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { journal } = useJournal();
  // Same query as every page's own useTrades call, so this adds no request.
  const { isLoading } = useTrades({ unfiltered: true, includeOpen: true });
  const waiting = needsTrades(pathname) && (!journal || isLoading);
  const showSkeleton = useDelayedFlag(waiting, SKELETON_DELAY_MS);
  if (!waiting) return <>{children}</>;
  return showSkeleton ? <PageSkeleton variant={skeletonFor(pathname)} /> : null;
}
