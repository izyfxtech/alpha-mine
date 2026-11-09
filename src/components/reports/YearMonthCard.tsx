import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { SkeletonGhost } from "@/components/ui/skeleton";
import { fmtMoney } from "@/lib/pnl/metrics";
import { cn } from "@/lib/utils";

const GRID = "grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground";
export const YEAR_GRID = "grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

const weekdayInitials = (weekStartsOn: number) =>
  weekStartsOn === 0 ? ["S", "M", "T", "W", "T", "F", "S"] : ["M", "T", "W", "T", "F", "S", "S"];

/**
 * One month of the Annual Overview. Without `daily` (the day-by-day results) the days are placeholders: same weeks, same
 * circles, no colours.
 */
export function YearMonthCard({
  year,
  monthIndex,
  weekStartsOn,
  daily,
  currency,
  onOpen,
}: {
  year: number;
  monthIndex: number;
  weekStartsOn: 0 | 1;
  daily?: ReadonlyMap<string, number>;
  currency?: string;
  onOpen?: (month: string) => void;
}) {
  const month = new Date(year, monthIndex, 1);
  const key = format(month, "yyyy-MM");
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn }),
  });
  const net = daily
    ? [...daily.entries()].filter(([k]) => k.startsWith(key)).reduce((a, [, v]) => a + v, 0)
    : 0;
  return (
    <Button
      variant="ghost"
      onClick={() => onOpen?.(key)}
      className="h-auto min-w-0 flex-col items-stretch rounded-md p-2 text-left transition hover:bg-muted/60"
      aria-label={`Open ${format(month, "MMMM yyyy")}`}
    >
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium">{format(month, "MMMM")}</span>
        {net !== 0 && (
          <span
            className={cn("text-xs font-semibold tabular", net > 0 ? "text-profit" : "text-loss")}
          >
            {fmtMoney(net, currency)}
          </span>
        )}
      </div>
      <div className={GRID}>
        {weekdayInitials(weekStartsOn).map((d, i) => (
          <span key={i}>{d}</span>
        ))}
        {days.map((d) => {
          const inMonth = isSameMonth(d, month);
          const v = daily?.get(format(d, "yyyy-MM-dd"));
          const label = format(d, "d");
          if (!daily)
            return inMonth ? (
              <span
                key={d.toISOString()}
                className="flex aspect-square items-center justify-center"
              >
                <SkeletonGhost className="rounded-full">{label}</SkeletonGhost>
              </span>
            ) : (
              <span key={d.toISOString()} className="aspect-square" />
            );
          return (
            <span
              key={d.toISOString()}
              className={cn(
                "flex aspect-square items-center justify-center rounded-full tabular",
                !inMonth && "opacity-0",
                inMonth && v == null && "text-foreground/70",
                inMonth && v != null && v > 0 && "bg-profit text-primary-foreground",
                inMonth && v != null && v < 0 && "bg-loss text-primary-foreground",
                inMonth && v === 0 && "bg-muted text-foreground",
              )}
            >
              {label}
            </span>
          );
        })}
      </div>
    </Button>
  );
}
