import { startOfMonth } from "date-fns";
import { KpiCardsSkeleton } from "@/components/analytics/KpiCards";
import { ProfitCalendarSkeleton } from "@/components/analytics/ProfitCalendar";
import { CalendarToolbar } from "@/components/home/CalendarToolbar";
import { UnitToggle } from "@/components/home/UnitToggle";
import { Panel, Stat } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { EVALUATION_LABELS, HOME_CHART_HEIGHT, HOME_CHART_ROWS } from "@/lib/home-layout";
import { useJournal } from "@/lib/journal/journal-context";
import { now } from "@/lib/time/clock";

/**
 * Home with its data still blank. The headings, panels, rows and chart heights are the page's own (see `home.tsx`), so
 * nothing moves when the real figures arrive.
 */
export function HomeSkeleton() {
  const { journal } = useJournal();
  return (
    <div className="mx-auto max-w-[1374px] space-y-[30px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="w-full text-xl font-semibold">Welcome back</h1>
        <div className="flex min-h-[34px] w-full flex-wrap items-center justify-between gap-3">
          <UnitToggle unit="cur" currency={journal?.currency ?? "USD"} />
        </div>
      </div>

      <KpiCardsSkeleton />

      <div className="grid grid-cols-[1fr_438px] gap-[30px]">
        <Panel title="Profit Calendar" action={<CalendarToolbar month={startOfMonth(now())} />}>
          <ProfitCalendarSkeleton />
        </Panel>
        <Panel title="Evaluation" className="flex flex-col">
          <div className="mt-2" />
          {EVALUATION_LABELS.map((label) => (
            <Stat key={label} label={label} value={<Skeleton className="h-3 w-14" />} />
          ))}
        </Panel>
      </div>

      {HOME_CHART_ROWS.map((titles) => (
        <div key={titles[0]} className="grid grid-cols-3 gap-[30px]">
          {titles.map((title) => (
            <Panel key={title} title={title}>
              <Skeleton className="w-full" style={{ height: HOME_CHART_HEIGHT }} />
            </Panel>
          ))}
        </div>
      ))}
    </div>
  );
}
