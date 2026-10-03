import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { AccentStat } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useTrades } from "@/lib/journal-context";
import { computeStats, dayKey, fmtMoney, fmtPct } from "@/lib/metrics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports/annual")({
  head: () => ({ meta: [{ title: "Annual Overview — AlphaMine" }, { name: "description", content: "Twelve month calendars showing winning and losing days for the year." }, { property: "og:title", content: "Annual Overview — AlphaMine" }, { property: "og:description", content: "Twelve month calendars showing winning and losing days for the year." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>): { year?: number } => {
    const y = Number(s.year);
    return Number.isInteger(y) && y > 1900 && y < 3000 ? { year: y } : {};
  },
  component: Annual,
});

function Annual() {
  const { trades, journal, cashflow } = useTrades();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const year = search.year ?? new Date().getFullYear();
  const years = useMemo(() => {
    const ys = new Set(trades.map((t) => Number(t.entry_at.slice(0, 4))));
    ys.add(new Date().getFullYear());
    return [...ys].sort();
  }, [trades]);
  const yearTrades = useMemo(() => trades.filter((t) => t.entry_at.startsWith(String(year))), [trades, year]);
  const daily = useMemo(() => {
    const m = new Map<string, number>();
    yearTrades.forEach((t) => m.set(dayKey(t.entry_at), (m.get(dayKey(t.entry_at)) ?? 0) + t.net_pnl));
    return m;
  }, [yearTrades]);
  const s = computeStats(yearTrades, journal?.starting_balance ?? 0, cashflow);
  const cur = journal?.currency;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <div className="mb-5 flex justify-center">
          <div className="inline-flex overflow-hidden rounded-md border text-xs font-medium">
             {years.map((y) => <Button key={y} variant="ghost" size="sm" onClick={() => navigate({ to: "/reports/annual", search: { year: y } })} className={cn("rounded-none", y === year && "bg-ink text-ink-foreground")}>{y}</Button>)}
          </div>
        </div>
         <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, mi) => {
            const month = new Date(year, mi, 1);
            const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
            const mNet = [...daily.entries()].filter(([k]) => k.startsWith(format(month, "yyyy-MM"))).reduce((a, [, v]) => a + v, 0);
            return (
               <Button variant="ghost" key={mi} onClick={() => navigate({ to: "/reports/calendar", search: { m: format(month, "yyyy-MM") } })} className="h-auto min-w-0 flex-col items-stretch rounded-md p-2 text-left transition hover:bg-muted/60" aria-label={`Open ${format(month, "MMMM yyyy")}`}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-sm font-medium">{format(month, "MMMM")}</span>
                  {mNet !== 0 && <span className={cn("text-[10px] font-semibold tabular", mNet > 0 ? "text-profit" : "text-loss")}>{fmtMoney(mNet, cur)}</span>}
                </div>
                <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-muted-foreground">
                  {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
                  {days.map((d) => {
                    const v = daily.get(format(d, "yyyy-MM-dd"));
                    const inM = isSameMonth(d, month);
                    return (
                      <span key={d.toISOString()} className={cn("flex aspect-square items-center justify-center rounded-full tabular",
                        !inM && "opacity-0", inM && v == null && "text-foreground/70",
                        inM && v != null && v > 0 && "bg-profit text-primary-foreground", inM && v != null && v < 0 && "bg-loss text-primary-foreground", inM && v === 0 && "bg-muted text-foreground")}>
                        {format(d, "d")}
                      </span>
                    );
                  })}
                </div>
               </Button>
            );
          })}
        </div>
      </section>
      <div className="flex flex-wrap gap-3">
        <AccentStat label="Number of Trades" value={s.count} />
        <AccentStat label="Winning Days" value={s.winDays} />
        <AccentStat label="Losing Days" value={s.lossDays} />
        <AccentStat label="Winrate" value={`${Math.round(s.winRate)}%`} />
        <AccentStat label="Net P&L" value={fmtMoney(s.net, cur)} tone={s.net < 0 ? "neg" : "pos"} />
        <AccentStat label="ROI" value={fmtPct(s.roi)} tone={s.roi < 0 ? "neg" : "pos"} />
      </div>
    </div>
  );
}
