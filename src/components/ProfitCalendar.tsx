import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { useJournal } from "@/lib/journal-context";
import { dayKey, type Trade } from "@/lib/metrics";
import { TiltMeter } from "@/components/kit";
import { useProfile } from "@/lib/profile-settings";
import { cn } from "@/lib/utils";

type Day = { pnl: number; n: number; tilt: number; r: number; pct: number; w: number };

/** Month grid with daily P&L, trade count, tiltmeter and weekly totals. Clicking a day opens the Journal for it. */
export function ProfitCalendar({ trades, month, fmt, tall }: { trades: Trade[]; month: Date; fmt: (pnl: number, r: number, pct: number) => string; tall?: boolean }) {
  const { setFilters } = useJournal();
  const navigate = useNavigate();
  const daily = useMemo(() => {
    const m = new Map<string, Day>();
    trades.forEach((t) => {
      const k = dayKey(t.entry_at);
      const d = m.get(k) ?? { pnl: 0, n: 0, tilt: 0, r: 0, pct: 0, w: 0 };
      d.pnl += t.net_pnl; d.n++; if (t.net_pnl > 0) d.w++; d.tilt += t.tilt; d.r += t.r ?? 0; d.pct += t.retPct;
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
    cn("relative flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-md text-center transition", tall ? "h-[96px]" : "h-[76px]",
      !inMonth && "hatch bg-card text-t4",
      inMonth && !x && "bg-muted",
      x && inMonth && x.pnl > 0 && "bg-profit-soft",
      x && inMonth && x.pnl < 0 && "bg-loss-soft",
      x && inMonth && x.pnl === 0 && "bg-card");

  const { showWeeklyTotals: weekly, showCalendarWinrate: showWr } = useProfile().settings;
  const countLabel = (n: number, w: number) => `${n} trade${n === 1 ? "" : "s"}${showWr ? ` · ${Math.round((w / n) * 100)}%` : ""}`;
  return (
    <div className={cn("grid gap-x-[6px] gap-y-[6px]", weekly ? "grid-cols-8" : "grid-cols-7", "text-center text-[10px] text-t4")}>
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", ...(weekly ? ["Total"] : [])].map((d) => <div key={d} className="pb-[10px] pt-[6px]">{d}</div>)}
      {rows.map((week, wi) => {
        const tot = week.filter((d) => isSameMonth(d, month)).reduce((a, d) => { const x = daily.get(format(d, "yyyy-MM-dd")); return x ? { pnl: a.pnl + x.pnl, n: a.n + x.n, w: a.w + x.w, tilt: a.tilt + x.tilt, r: a.r + x.r, pct: a.pct + x.pct } : a; }, { w: 0, pnl: 0, n: 0, tilt: 0, r: 0, pct: 0 });
        return [
          ...week.map((d) => {
            const k = format(d, "yyyy-MM-dd");
            const inM = isSameMonth(d, month);
            const x = daily.get(k);
            return (
              <button key={k} disabled={!x} aria-label={x ? `${format(d, "MMMM d")}: ${countLabel(x.n, x.w)}` : `${format(d, "MMMM d")}: no trades`} onClick={() => { setFilters({ day: k }); navigate({ to: "/journal" }); }}
                className={cn(cell(x, inM), x && "hover:ring-1 hover:ring-ring", isSameDay(d, today) && "ring-2 ring-foreground")}>
                <span className="absolute right-[4px] top-[4px] flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-card px-0.5 text-[9px] font-medium text-t2 shadow-[0_0_0_1px_rgba(60,40,90,0.10)]">{format(d, "d")}</span>
                {x ? (
                  <span className="text-center">
                    <span className={cn("block text-[12px] font-semibold tabular", !inM ? "font-medium text-t4" : x.pnl > 0 ? "text-profit" : x.pnl < 0 ? "text-loss" : "text-foreground")}>{fmt(x.pnl, x.r, x.pct)}</span>
                    <span className="block text-[10px] text-t3">{countLabel(x.n, x.w)}</span>
                    <TiltMeter value={x.tilt} className="mt-[3px]" />
                  </span>
                ) : null}
              </button>
            );
          }),
          weekly && <div key={`t${wi}`} className={cn("flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-md", tall ? "h-[96px]" : "h-[76px]", tot.n ? (tot.pnl >= 0 ? "bg-profit-soft" : "bg-loss-soft") : "hatch bg-card")}>
            {tot.n ? (<><span className={cn("text-[12px] font-semibold tabular", tot.pnl >= 0 ? "text-profit" : "text-loss")}>{fmt(tot.pnl, tot.r, tot.pct)}</span><span className="text-[10px] text-t3">{countLabel(tot.n, tot.w)}</span><TiltMeter value={tot.tilt} className="mt-[3px]" /></>) : null}
          </div>,
        ];
      })}
    </div>
  );
}
