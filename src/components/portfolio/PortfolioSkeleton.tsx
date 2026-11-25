import { startOfMonth } from "date-fns";
import { KpiCardsSkeleton } from "@/components/analytics/KpiCards";
import { ProfitCalendarSkeleton } from "@/components/analytics/ProfitCalendar";
import { PageHeader, Panel, Stat } from "@/components/kit";
import { JournalsTrigger } from "@/components/portfolio/JournalsTrigger";
import { MonthSwitcher } from "@/components/portfolio/MonthSwitcher";
import { SegmentedToggle } from "@/components/segmented-toggle";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { useJournal } from "@/lib/journal/journal-context";
import {
  BEST_WORST_COLUMNS,
  JOURNAL_CELL,
  JOURNAL_COLUMNS,
  PORTFOLIO_BAR_TITLES,
  PORTFOLIO_CHART_HEIGHT,
  PORTFOLIO_EVALUATION_LABELS,
  PORTFOLIO_NOTE,
  PORTFOLIO_UNITS,
} from "@/lib/portfolio-layout";
import { now } from "@/lib/time/clock";

/** How many rows the Best & Worst table shows once there are ten or more trades (it holds the 5 best and 5 worst). */
const BEST_WORST_ROWS = 10;

/**
 * Portfolio with its data still blank: the page's own headings, panels, table headers and chart heights, with one row per
 * journal in the Journals table. The Best & Worst table assumes its full ten rows.
 */
export function PortfolioSkeleton() {
  const { journals } = useJournal();
  const chart = (height: number) => <Skeleton className="w-full" style={{ height }} />;
  return (
    <div className="mx-auto max-w-[1460px] space-y-4 pb-8">
      <PageHeader
        title="Portfolio"
        subtitle="Compare each journal on its own balance, then review combined performance in percent or R."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedToggle options={PORTFOLIO_UNITS} value="pct" />
        <JournalsTrigger />
      </div>

      <KpiCardsSkeleton />
      <p className="-mt-5 text-xs text-t4">{PORTFOLIO_NOTE}</p>

      <Panel title="Journals">
        <table className="w-full text-xs tabular">
          <thead>
            <tr className="text-right">
              {JOURNAL_COLUMNS.map((h, i) => (
                <th key={h + i} className={JOURNAL_CELL.head(i)}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {journals.map((j) => (
              <tr key={j.id} className="text-right">
                <td className={JOURNAL_CELL.name}>
                  <SkeletonText className="w-20" />
                </td>
                {JOURNAL_COLUMNS.slice(1, 11).map((h) => (
                  <td key={h} className={JOURNAL_CELL.value}>
                    <SkeletonText className="w-10" />
                  </td>
                ))}
                <td className={JOURNAL_CELL.bar}>
                  <div className="flex h-[14px] items-center border-l-2 border-t4" />
                </td>
              </tr>
            ))}
            <tr className="text-right font-medium">
              <td />
              <td />
              <td className="px-2 py-2">
                <SkeletonText className="w-10" />
              </td>
              {JOURNAL_COLUMNS.slice(3, 11).map((h) => (
                <td key={h} className="px-2">
                  <SkeletonText className="w-10" />
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel title="Equity Graph">{chart(PORTFOLIO_CHART_HEIGHT.equity)}</Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <Panel title="Profit Calendar" action={<MonthSwitcher month={startOfMonth(now())} />}>
          <ProfitCalendarSkeleton />
        </Panel>
        <Panel title="Performance by Weekday">{chart(PORTFOLIO_CHART_HEIGHT.weekday)}</Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <Panel title="Best & Worst Trades">
          <div className="max-h-[300px] overflow-hidden">
            <table className="w-full text-xs tabular">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left">
                  {BEST_WORST_COLUMNS.map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap border-r px-2 py-2.5 font-medium last:border-0"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: BEST_WORST_ROWS }, (_, i) => (
                  <tr key={i}>
                    <td className="max-w-[150px] truncate px-2 py-2">
                      <SkeletonText className="w-16" />
                    </td>
                    {BEST_WORST_COLUMNS.slice(1).map((h) => (
                      <td key={h} className="px-2">
                        <SkeletonText className="w-12" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Evaluation">
          {PORTFOLIO_EVALUATION_LABELS.map((label) => (
            <Stat key={label} label={label} value={<SkeletonText className="w-14" />} />
          ))}
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-[30px]">
        {PORTFOLIO_BAR_TITLES.map((title) => (
          <Panel key={title} title={title}>
            {chart(PORTFOLIO_CHART_HEIGHT.bars)}
          </Panel>
        ))}
      </div>
    </div>
  );
}
