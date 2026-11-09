import type { ReactElement, ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { useJournal, useTrades } from "@/lib/journal/journal-context";
import { AnalyticsSkeleton } from "@/components/analytics/AnalyticsSkeleton";
import { EquitySkeleton } from "@/components/equity/EquitySkeleton";
import { HomeSkeleton } from "@/components/home/HomeSkeleton";
import { MilestonesSkeleton } from "@/components/milestones/MilestoneCard";
import { AnnualSkeleton } from "@/components/reports/AnnualSkeleton";
import { CalendarSkeleton } from "@/components/reports/CalendarSkeleton";
import { MonthlySkeleton } from "@/components/reports/MonthlyTable";
import { SimulatorSkeleton } from "@/components/strategy/SimulatorLayout";
import { JournalSkeleton } from "@/components/journal/JournalSkeleton";
import { PortfolioSkeleton } from "@/components/portfolio/PortfolioSkeleton";
import { useDelayedFlag } from "@/lib/use-delayed-flag";

/** Pages that never read trades, so they open at once instead of waiting for them. */
const NO_TRADES = ["/settings", "/plans", "/diary/notebook"];

export const needsTrades = (path: string) =>
  !NO_TRADES.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Loading placeholders, one per page whose loaded layout is fixed. Each is built from the page's own components and shared
 * size constants (see `home-layout.ts`), so it is the same size and shape as the page. A page whose layout depends on the
 * data (rows, saved choices, empty states) has none: a placeholder that only approximates it would shift when the page
 * arrives, so those pages stay blank until their trades have loaded.
 */
const SKELETONS: Record<string, ReactElement> = {
  "/home": <HomeSkeleton />,
  "/portfolio": <PortfolioSkeleton />,
  "/journal": <JournalSkeleton />,
  "/equity": <EquitySkeleton />,
  "/analytics": <AnalyticsSkeleton />,
  "/milestones": <MilestonesSkeleton />,
  "/reports/annual": <AnnualSkeleton />,
  "/reports/calendar": <CalendarSkeleton />,
  "/reports/monthly": <MonthlySkeleton />,
  "/strategy-lab/simulator": <SimulatorSkeleton />,
};

export const skeletonFor = (path: string): ReactElement | undefined => SKELETONS[path];

/** How long loading must last before the skeleton appears, so a fast or cached load never flashes it. */
export const SKELETON_DELAY_MS = 250;

/** Holds the page back until the journal and its trades have loaded the first time, showing its skeleton if it has one. Later refreshes keep the page. */
export function RouteGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { journal } = useJournal();
  // Same query as every page's own useTrades call, so this adds no request.
  const { isLoading } = useTrades({ unfiltered: true, includeOpen: true });
  const waiting = needsTrades(pathname) && (!journal || isLoading);
  const showSkeleton = useDelayedFlag(waiting, SKELETON_DELAY_MS);
  if (!waiting) return <>{children}</>;
  const skeleton = skeletonFor(pathname);
  return showSkeleton && skeleton ? (
    <div role="status" aria-busy="true" aria-label="Loading" inert>
      {skeleton}
    </div>
  ) : null;
}
