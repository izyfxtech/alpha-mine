import { Skeleton } from "@/components/ui/skeleton";

const CARD = "rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]";
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** The broad page layouts in the app, so a loading page looks like the page that is coming. */
export type SkeletonVariant = "dashboard" | "table" | "chart" | "report";

function Header({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex items-center justify-between">
      <Skeleton className="h-7 w-48" />
      <div className="flex gap-2">
        {range(actions).map((i) => (
          <Skeleton key={i} className="h-8 w-28" />
        ))}
      </div>
    </div>
  );
}

function StatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {range(count).map((i) => (
        <div key={i} className={CARD}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-28" />
        </div>
      ))}
    </div>
  );
}

const ChartCard = ({ height = "h-56" }: { height?: string }) => (
  <div className={CARD}>
    <Skeleton className="h-4 w-36" />
    <Skeleton className={`mt-4 w-full ${height}`} />
  </div>
);

function TableRows({ rows, columns }: { rows: number; columns: number }) {
  return (
    <div className={CARD}>
      <div className="flex gap-4 pb-3">
        {range(columns).map((c) => (
          <Skeleton key={c} className="h-3 flex-1" />
        ))}
      </div>
      <div className="space-y-3">
        {range(rows).map((r) => (
          <div key={r} className="flex gap-4">
            {range(columns).map((c) => (
              <Skeleton key={c} className="h-5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const LAYOUTS: Record<SkeletonVariant, () => React.ReactNode> = {
  // Home, Portfolio, Milestones: figures first, a main chart, then a list beside a secondary chart.
  dashboard: () => (
    <>
      <Header />
      <StatCards />
      <ChartCard />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard height="h-40" />
        <TableRows rows={4} columns={2} />
      </div>
    </>
  ),
  // Journal, Open Trades, Sessions, Rules: a filter bar over a long table.
  table: () => (
    <>
      <Header actions={3} />
      <div className="flex flex-wrap gap-2">
        {range(5).map((i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
      <TableRows rows={9} columns={7} />
    </>
  ),
  // Equity, Analytics, Chart Lab, Strategy Lab: controls above one large chart, with a few figures under it.
  chart: () => (
    <>
      <Header />
      <div className="flex flex-wrap gap-2">
        {range(4).map((i) => (
          <Skeleton key={i} className="h-8 w-32" />
        ))}
      </div>
      <ChartCard height="h-80" />
      <StatCards />
    </>
  ),
  // Monthly, Annual, Calendar, Chart Book: a grid of equal blocks.
  report: () => (
    <>
      <Header />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        {range(12).map((i) => (
          <div key={i} className={CARD}>
            <Skeleton className="h-3 w-12" />
            <Skeleton className="mt-3 h-12 w-full" />
          </div>
        ))}
      </div>
    </>
  ),
};

/** A page-shaped placeholder shown while a journal's trades load. */
export function PageSkeleton({ variant = "dashboard" }: { variant?: SkeletonVariant }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="space-y-5">
      <span className="sr-only">Loading…</span>
      {LAYOUTS[variant]()}
    </div>
  );
}
