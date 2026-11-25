import { currentYear } from "@/lib/time/clock";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { localDay } from "@/lib/time/local-time";
import { useMemo, useState, type ReactNode } from "react";
import { endOfMonth, format, isSameMonth, startOfMonth } from "date-fns";
import { useTrades } from "@/lib/journal/journal-context";
import { computeStats, fmtMoney, fmtNum, fmtPct, periodBase } from "@/lib/pnl/metrics";
import { AccentStat, StatGrid } from "@/components/kit";
import { ProfitCalendar } from "@/components/analytics/ProfitCalendar";
import {
  CALENDAR_BODY,
  CALENDAR_SECTION,
  CALENDAR_STAT_LABELS,
  CalendarControls,
  type CalendarDisplay,
} from "@/components/reports/CalendarControls";

export const Route = createFileRoute("/_authenticated/reports/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar Report — EdgeWhiz" },
      { name: "description", content: "Monthly calendar of daily trading results." },
      { property: "og:title", content: "Calendar Report — EdgeWhiz" },
      { property: "og:description", content: "Monthly calendar of daily trading results." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { m?: string } =>
    typeof s.m === "string" && /^\d{4}-\d{2}$/.test(s.m) ? { m: s.m } : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/reports", search: { view: "calendar", month: search.m } as never });
  },
  component: CalendarReport,
});

function CalendarReport() {
  const { trades, all, journal, flows } = useTrades();
  const navigate = useNavigate();
  const { m } = Route.useSearch();
  const [month, setMonth] = useState(() =>
    m ? startOfMonth(new Date(`${m}-01T00:00:00`)) : startOfMonth(new Date()),
  );
  const [display, setDisplay] = useState<CalendarDisplay>("Return ($)");
  const cur = journal?.currency ?? "USD";
  const bal = journal?.starting_balance ?? 0;
  const years = useMemo(() => {
    const ys = new Set(trades.map((t) => Number(localDay(t.entry_at).slice(0, 4))));
    ys.add(currentYear());
    return [...ys].sort();
  }, [trades]);
  const monthTrades = trades.filter((t) => isSameMonth(new Date(t.entry_at), month));
  const period = periodBase(
    all,
    bal,
    flows,
    format(startOfMonth(month), "yyyy-MM-dd"),
    format(endOfMonth(month), "yyyy-MM-dd"),
  );
  const s = computeStats(monthTrades, period.base, period.flows);
  const fmt = (pnl: number, r: number, pct: number) =>
    display === "Return ($)"
      ? fmtMoney(pnl, cur)
      : display === "Return (%)"
        ? fmtPct(pct)
        : `${fmtNum(r)}R`;

  const stats: Record<(typeof CALENDAR_STAT_LABELS)[number], ReactNode> = {
    "Number of Trades": s.count,
    Winners: s.wins,
    Losers: s.losses,
    Winrate: `${Math.round(s.winRate)}%`,
    "Avg. Daily P&L": fmtMoney(s.avgPerDay, cur),
    "Total Monthly P&L": fmtMoney(s.net, cur),
    "Avg. Winner": fmtMoney(s.avgWin, cur),
    "Avg. Loser": fmtMoney(s.avgLoss, cur),
  };

  return (
    <div className="space-y-[22px]">
      <section className={CALENDAR_SECTION}>
        <CalendarControls
          display={display}
          years={years}
          month={month}
          onDisplayChange={setDisplay}
          onMonthChange={setMonth}
          onOpenAnnual={(year) => navigate({ to: "/reports/annual", search: { year } })}
        />
        <div className={CALENDAR_BODY}>
          <ProfitCalendar tall trades={trades} month={month} fmt={fmt} />
        </div>
      </section>
      <StatGrid>
        {CALENDAR_STAT_LABELS.map((label) => (
          <AccentStat key={label} label={label} value={stats[label]} />
        ))}
      </StatGrid>
    </div>
  );
}
