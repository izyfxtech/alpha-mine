import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addMonths, format, isSameMonth, setYear, startOfMonth } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTrades } from "@/lib/journal-context";
import { computeStats, fmtMoney, fmtNum, fmtPct } from "@/lib/metrics";
import { AccentStat } from "@/components/kit";
import { ProfitCalendar } from "@/components/ProfitCalendar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports/calendar")({
  head: () => ({ meta: [{ title: "Calendar Report — AlphaMine" }, { name: "description", content: "Monthly calendar of daily trading results." }, { property: "og:title", content: "Calendar Report — AlphaMine" }, { property: "og:description", content: "Monthly calendar of daily trading results." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>): { m?: string } => (typeof s.m === "string" && /^\d{4}-\d{2}$/.test(s.m) ? { m: s.m } : {}),
  component: CalendarReport,
});

const DISPLAY = ["Return ($)", "Return (%)", "R Multiple"] as const;

function CalendarReport() {
  const { trades, journal, cashflow } = useTrades();
  const navigate = useNavigate();
  const { m } = Route.useSearch();
  const [month, setMonth] = useState(() => (m ? startOfMonth(new Date(`${m}-01T00:00:00`)) : startOfMonth(new Date())));
  const [display, setDisplay] = useState<(typeof DISPLAY)[number]>("Return ($)");
  const cur = journal?.currency ?? "USD";
  const bal = journal?.starting_balance ?? 0;
  const years = useMemo(() => {
    const ys = new Set(trades.map((t) => Number(t.entry_at.slice(0, 4))));
    ys.add(new Date().getFullYear());
    return [...ys].sort();
  }, [trades]);
  const monthTrades = trades.filter((t) => isSameMonth(new Date(t.entry_at), month));
  const s = computeStats(monthTrades, bal, cashflow);
  const fmt = (pnl: number, r: number, pct: number) => (display === "Return ($)" ? fmtMoney(pnl, cur) : display === "Return (%)" ? fmtPct(pct) : `${fmtNum(r)}R`);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-start">
          <div className="relative w-52 rounded-md border bg-card px-3 pb-1.5 pt-3">
            <span className="absolute -top-2 left-2 bg-card px-1 text-[10px] text-muted-foreground">Display</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-full items-center justify-between text-sm">{display}<ChevronDown className="h-4 w-4" /></DropdownMenuTrigger>
              <DropdownMenuContent align="start">{DISPLAY.map((d) => <button key={d} onClick={() => setDisplay(d)} className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted">{d}</button>)}</DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-md border text-xs font-medium">
              {years.map((y) => <button key={y} onClick={() => setMonth(setYear(month, y))} className={cn("px-3 py-1.5", month.getFullYear() === y && "bg-ink text-ink-foreground")}>{y}</button>)}
            </div>
            <div className="flex items-center gap-3">
              <button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-lg">{format(month, "MMMM")}</span>
              <button aria-label="Annual overview" onClick={() => navigate({ to: "/reports/annual", search: { year: month.getFullYear() } })}><X className="h-4 w-4" /></button>
              <button aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-4 max-w-4xl pb-6"><ProfitCalendar trades={trades} month={month} fmt={fmt} /></div>
      </section>
      <div className="flex flex-wrap gap-3">
        <AccentStat label="Number of Trades" value={s.count} />
        <AccentStat label="Winners" value={s.wins} />
        <AccentStat label="Losers" value={s.losses} />
        <AccentStat label="Winrate" value={`${Math.round(s.winRate)}%`} />
        <AccentStat label="Avg. Daily P&L" value={fmtMoney(s.avgPerDay, cur)} tone={s.avgPerDay < 0 ? "neg" : "pos"} />
        <AccentStat label="Total Monthly P&L" value={fmtMoney(s.net, cur)} tone={s.net < 0 ? "neg" : "pos"} />
        <AccentStat label="Avg. Winner" value={fmtMoney(s.avgWin, cur)} />
        <AccentStat label="Avg. Loser" value={fmtMoney(s.avgLoss, cur)} tone="neg" />
      </div>
    </div>
  );
}
