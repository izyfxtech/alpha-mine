import { useMemo } from "react";
import { Columns3 } from "lucide-react";
import {
  COLS,
  alignRight,
  columnWidth,
  tableWidth,
  visibleColumns,
} from "@/components/journal/journal-columns";
import {
  JOURNAL_BOX,
  JOURNAL_HEAD_ROW,
  JOURNAL_ROW,
  JournalFooter,
  JournalToolbar,
} from "@/components/journal/JournalFrame";
import { Skeleton, SkeletonGhost, SkeletonText } from "@/components/ui/skeleton";
import { activeFilterCount, useJournal } from "@/lib/journal/journal-context";
import { useJournalTableLayout } from "@/lib/journal/journal-table-layout";
import { useFillViewport } from "@/lib/use-fill-viewport";
import { useStoredString } from "@/lib/use-stored-value";
import { cn } from "@/lib/utils";

/** Rows drawn: more than any window shows, and the box clips the rest. */
const PLACEHOLDER_ROWS = 40;

/**
 * The Journal's table view with its rows blank: the page's own toolbar and footer, the columns you chose and sized, and rows
 * as tall as real ones, in a box sized to the window the same way. Cards and Gallery views have no skeleton.
 */
export function JournalSkeleton() {
  const { filters, journal } = useJournal();
  const keys = useMemo(() => COLS.map((c) => c.k), []);
  const [layout] = useJournalTableLayout(journal?.id, keys);
  const [storedView] = useStoredString("am.journal-view");
  const fillRef = useFillViewport<HTMLDivElement>();
  if (storedView === "cards" || storedView === "gallery") return null;
  const cols = visibleColumns(layout);
  return (
    <div ref={fillRef} className={JOURNAL_BOX}>
      <JournalToolbar
        selected={0}
        day={filters.day}
        query={filters.q ?? ""}
        activeFilters={activeFilterCount(filters)}
        view="table"
      />
      <div className="relative flex min-h-0 flex-1 border-t">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <table
            className="whitespace-nowrap text-[12px]"
            style={{ tableLayout: "fixed", width: tableWidth(layout, cols) }}
          >
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: 28 }} />
              <col style={{ width: 28 }} />
              {cols.map((c) => (
                <col key={c.k} style={{ width: columnWidth(layout, c) }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-card">
              <tr className={JOURNAL_HEAD_ROW}>
                <th className="w-10 p-3" />
                <th className="w-8" />
                <th className="w-8" />
                {cols.map((c) => (
                  <th
                    key={c.k}
                    className={cn(
                      "relative overflow-hidden px-3 text-[12px] font-semibold text-foreground",
                      alignRight(c.k) && "text-right",
                    )}
                  >
                    <span className="inline-flex items-center gap-1">{c.l}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
                <tr key={i} className={cn(JOURNAL_ROW, "tabular")}>
                  <td className="px-3">
                    <Skeleton className="h-4 w-4" />
                  </td>
                  <td>
                    <Skeleton className="h-[17px] w-[17px]" />
                  </td>
                  <td className="px-1" />
                  {cols.map((c) => (
                    <td
                      key={c.k}
                      className={cn("overflow-hidden px-3", alignRight(c.k) && "text-right")}
                    >
                      <SkeletonText className={cn("max-w-full", alignRight(c.k) && "ml-auto")} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex w-7 shrink-0 items-center justify-center border-l bg-card text-xs font-semibold [writing-mode:vertical-rl]">
          <Columns3 className="mb-1 h-3.5 w-3.5" />
          Columns
        </div>
      </div>
      <JournalFooter
        pageSize={50}
        from={<SkeletonGhost>1</SkeletonGhost>}
        to={<SkeletonGhost>50</SkeletonGhost>}
        total={<SkeletonGhost>000</SkeletonGhost>}
        page={0}
        pages={1}
      />
    </div>
  );
}
