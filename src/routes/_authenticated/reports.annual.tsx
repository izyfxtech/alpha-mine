import { currentYear } from "@/lib/time/clock";
import { useProfile } from "@/lib/profile-settings";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { localDay } from "@/lib/time/local-time";
import { useMemo, type ReactNode } from "react";
import { AccentStat } from "@/components/kit";
import { ANNUAL_STAT_LABELS } from "@/components/reports/AnnualSkeleton";
import { YEAR_GRID, YearMonthCard } from "@/components/reports/YearMonthCard";
import { Button } from "@/components/ui/button";
import { useTrades } from "@/lib/journal/journal-context";
import { computeStats, dayKey, fmtMoney, fmtPct, periodBase } from "@/lib/pnl/metrics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports/annual")({
  head: () => ({
    meta: [
      { title: "Annual Overview — EdgeWhiz" },
      {
        name: "description",
        content: "Twelve month calendars showing winning and losing days for the year.",
      },
      { property: "og:title", content: "Annual Overview — EdgeWhiz" },
      {
        property: "og:description",
        content: "Twelve month calendars showing winning and losing days for the year.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { year?: number } => {
    const y = Number(s.year);
    return Number.isInteger(y) && y > 1900 && y < 3000 ? { year: y } : {};
  },
  component: Annual,
});

function Annual() {
  const sow = useProfile().settings.weekStartsOn;
  const { trades, all, journal, flows } = useTrades();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const year = search.year ?? currentYear();
  const years = useMemo(() => {
    const ys = new Set(trades.map((t) => Number(localDay(t.entry_at).slice(0, 4))));
    ys.add(currentYear());
    return [...ys].sort();
  }, [trades]);
  const yearTrades = useMemo(
    () => trades.filter((t) => localDay(t.entry_at).startsWith(String(year))),
    [trades, year],
  );
  const daily = useMemo(() => {
    const m = new Map<string, number>();
    yearTrades.forEach((t) =>
      m.set(dayKey(t.entry_at), (m.get(dayKey(t.entry_at)) ?? 0) + t.net_pnl),
    );
    return m;
  }, [yearTrades]);
  const period = periodBase(
    all,
    journal?.starting_balance ?? 0,
    flows,
    `${year}-01-01`,
    `${year}-12-31`,
  );
  const s = computeStats(yearTrades, period.base, period.flows);
  const cur = journal?.currency;

  const stats: Record<(typeof ANNUAL_STAT_LABELS)[number], ReactNode> = {
    "Number of Trades": s.count,
    "Winning Days": s.winDays,
    "Losing Days": s.lossDays,
    Winrate: `${Math.round(s.winRate)}%`,
    "Net P&L": fmtMoney(s.net, cur),
    ROI: fmtPct(s.roi),
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <div className="mb-5 flex justify-center">
          <div className="inline-flex overflow-hidden rounded-md border text-xs font-medium">
            {years.map((y) => (
              <Button
                key={y}
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: "/reports/annual", search: { year: y } })}
                className={cn("rounded-none", y === year && "bg-ink text-ink-foreground")}
              >
                {y}
              </Button>
            ))}
          </div>
        </div>
        <div className={YEAR_GRID}>
          {Array.from({ length: 12 }, (_, mi) => (
            <YearMonthCard
              key={mi}
              year={year}
              monthIndex={mi}
              weekStartsOn={sow}
              daily={daily}
              currency={cur}
              onOpen={(m) => navigate({ to: "/reports/calendar", search: { m } })}
            />
          ))}
        </div>
      </section>
      <div className="flex flex-wrap gap-3">
        {ANNUAL_STAT_LABELS.map((label) => (
          <AccentStat key={label} label={label} value={stats[label]} />
        ))}
      </div>
    </div>
  );
}
