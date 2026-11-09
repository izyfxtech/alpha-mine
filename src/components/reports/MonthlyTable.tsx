import { SkeletonText } from "@/components/ui/skeleton";

export const MONTHLY_COLUMNS = [
  "Month",
  "Week",
  "Trades",
  "Tiltmeter",
  "Return ($)",
  "Return (%)",
  "Winrate (%)",
  "Avg. P&L ($)",
  "Profit Factor",
  "Avg. R Multiple",
  "Sum. R Multiple",
  "Biggest Win ($)",
  "Week Start",
  "Biggest Loss ($)",
  "Efficiency (%)",
  "W",
  "L",
] as const;

/** The report's box: at least a window tall. */
export const MONTHLY_BOX =
  "min-h-[calc(100vh-7rem)] overflow-x-auto rounded-lg bg-card pb-6 shadow-[0_1px_5px_rgba(60,40,90,0.07)]";
export const MONTHLY_TABLE = "w-full min-w-[1250px] text-xs tabular";
export const MONTHLY_ROW = "h-[31px]";

export function MonthlyTableHead() {
  return (
    <thead className="sticky top-0 bg-card text-left">
      <tr className="h-[38px]">
        {MONTHLY_COLUMNS.map((x) => (
          <th key={x} className="whitespace-nowrap px-2 font-semibold first:pl-4">
            {x}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/** Rows drawn: the report lists one row per month, newest first. */
const PLACEHOLDER_ROWS = 3;

/** The Monthly report with its rows blank. */
export function MonthlySkeleton() {
  return (
    <div className={MONTHLY_BOX}>
      <table className={MONTHLY_TABLE}>
        <MonthlyTableHead />
        <tbody>
          {Array.from({ length: PLACEHOLDER_ROWS }, (_, row) => (
            <tr key={row} className={MONTHLY_ROW}>
              {MONTHLY_COLUMNS.map((x, i) => (
                <td key={x} className="whitespace-nowrap px-2 first:pl-4">
                  <SkeletonText className={i === 0 ? "w-28" : "w-10"} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
