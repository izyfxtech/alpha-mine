import { Skeleton } from "@/components/ui/skeleton";

const CARD = "rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]";

/** The shape most pages share: a title, a row of figures, a chart and a table. Shown while a journal's trades load. */
export function PageSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="space-y-5">
      <span className="sr-only">Loading…</span>
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={CARD}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-28" />
          </div>
        ))}
      </div>
      <div className={CARD}>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-4 h-56 w-full" />
      </div>
      <div className={CARD}>
        <Skeleton className="h-4 w-28" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
