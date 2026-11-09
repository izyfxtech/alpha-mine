import { ColumnsTab, GroupTableHead } from "@/components/analytics/AnalyticsTable";
import { AnalyticsSidebar } from "@/components/analytics/AnalyticsSidebar";
import { ANALYTICS_ROW_CLASS, COLS, useCriteria } from "@/components/analytics/analytics-config";
import { SkeletonText } from "@/components/ui/skeleton";
import { useJournal } from "@/lib/journal/journal-context";

/** Rows drawn under "Overall": the grouping starts with one row per trade setup. */
const PLACEHOLDER_ROWS = 4;

/**
 * Analytics at its starting state (grouped by setup, every column shown) with the figures blank. The left panels are the
 * page's own; the table's height is set by them, so the number of placeholder rows does not change the page's size.
 */
export function AnalyticsSkeleton() {
  const { journal } = useJournal();
  const criteria = useCriteria(journal?.id);
  const setup = criteria.filter((c) => c.key === "setup");
  const available = criteria.filter((c) => c.key !== "setup");
  return (
    <div className="grid grid-cols-[240px_1fr] gap-[22px]">
      <AnalyticsSidebar crits={setup} available={available} />
      <section className="relative min-w-0 pr-7">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-xs tabular">
            <GroupTableHead columns={COLS} />
            <tbody>
              {Array.from({ length: PLACEHOLDER_ROWS + 1 }, (_, i) => (
                <tr key={i} className={ANALYTICS_ROW_CLASS}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-r bg-background px-3">
                    <SkeletonText className="w-24" />
                  </td>
                  {COLS.map((c) => (
                    <td key={c.k} className="px-3 text-right">
                      <SkeletonText className="ml-auto w-10" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ColumnsTab />
      </section>
    </div>
  );
}
