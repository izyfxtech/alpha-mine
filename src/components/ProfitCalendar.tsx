import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { useJournal } from "@/lib/journal-context";
import { dayKey, type Trade } from "@/lib/metrics";
import { TiltMeter } from "@/components/kit";
import { useProfile } from "@/lib/profile-settings";
import { cn } from "@/lib/utils";

type Day = { pnl: number; n: number; tilt: number; r: number; pct: number };

/** Month grid with daily P&L, trade count, tiltmeter and weekly totals. Clicking a day opens the Journal for it. */
export function ProfitCalendar({ trades, month, fmt }: { trades: Trade[]; month: Date; fmt: (pnl: number, r: number, pct: number) => string }) {
  const { setFilters } = useJournal();
  const navigate = useNavigate();
  const daily = useMemo(() => {
    const m = new Map<string, Day>();
    trades.forEach((t) => {
      const k = dayKey(t.entry_at);
      const d = m.get(k) ?? { pnl: 0, n: 0, tilt: 0, r: 0, pct: 0 };
      d.pnl += t.net_pnl; d.n++; d.tilt += t.tilt; d.r += t.r ?? 0; d.pct += t.retPct;
      m.set(k, d);
    });
    return m;
  }, [trades]);
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  let days = eachDayOfInterval({ start, end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  while (days.length < 42) days = eachDayOfInterval({ start, end: new Date(days[days.length - 1].getTime() + 7 * 864e5) });
  const rows: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
  const today = new Date();

  const cell = (x: Day | undefined, inMonth: boolean) =>
    cn("flex h-[78px] min-w-0 flex-col overflow-hidden rounded-md p-1.5 text-left transition",
      !inMonth && "hatch border border-border/40 bg-card text-muted-foreground",
      inMonth && !x && "bg-muted/55",
      x && inMonth && x.pnl > 0 && "bg-profit-soft",
      x && inMonth && x.pnl < 0 && "bg-loss-soft",
      x && inMonth && x.pnl === 0 && "bg-muted");

  const weekly = useProfile().settings.showWeeklyTotals;
  return (
    <div className={cn("grid gap-1.5", weekly ? "grid-cols-8" : "grid-cols-7", " text-center text-xs text-muted-foreground")}>
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", ...(weekly ? ["Total"] : [])].map((d) => <div key={d} className="pb-1">{d}</div>)}
      {rows.map((week, wi) => {
        const tot = week.filter((d) => isSameMonth(d, month)).reduce((a, d) => { const x = daily.get(format(d, "yyyy-MM-dd")); return x ? { pnl: a.pnl + x.pnl, n: a.n + x.n, tilt: a.tilt + x.tilt, r: a.r + x.r, pct: a.pct + x.pct } : a; }, { pnl: 0, n: 0, tilt: 0, r: 0, pct: 0 });
        return [
          ...week.map((d) => {
            const k = format(d, "yyyy-MM-dd");
            const inM = isSameMonth(d, month);
            const x = daily.get(k);
            return (
              <button key={k} disabled={!x} onClick={() => { setFilters({ day: k }); navigate({ to: "/journal" }); }}
                className={cn(cell(x, inM), x && "hover:ring-1 hover:ring-ring", inM && isSameDay(d, today) && "ring-1 ring-foreground")}>
                <span className={cn("text-[10px]", inM ? "text-foreground" : "text-muted-foreground")}>{format(d, inM ? "d" : "MMM d")}</span>
                {x ? (
                  <span className="m-auto text-center">
                    <span className={cn("block text-[13px] font-semibold tabular", x.pnl > 0 ? "text-profit" : x.pnl < 0 ? "text-loss" : "text-foreground")}>{fmt(x.pnl, x.r, x.pct)}</span>
                    <span className="block text-[10px] text-muted-foreground">{x.n} trade{x.n > 1 ? "s" : ""}</span>
                    <TiltMeter value={x.tilt} className="mt-1" />
                  </span>
                ) : <span className="m-auto text-xs">No Trades</span>}
              </button>
            );
          }),
          weekly && <div key={`t${wi}`} className={cn("flex h-[78px] min-w-0 flex-col items-center justify-center overflow-hidden rounded-md", tot.n ? (tot.pnl >= 0 ? "bg-profit-soft" : "bg-loss-soft") : "bg-muted/60")}>
            {tot.n ? (<><span className={cn("text-[13px] font-semibold tabular", tot.pnl >= 0 ? "text-profit" : "text-loss")}>{fmt(tot.pnl, tot.r, tot.pct)}</span><span className="text-[10px]">{tot.n} trades</span><TiltMeter value={tot.tilt} className="mt-1" /></>) : <span className="text-xs">No Trades</span>}
          </div>,
        ];
      })}
    </div>
  );
}
