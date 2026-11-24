import { Link, createFileRoute } from "@tanstack/react-router";
import { localDay } from "@/lib/time/local-time";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { format, startOfMonth } from "date-fns";
import { ProfitCalendar } from "@/components/analytics/ProfitCalendar";
import { ChevronRight, Rocket, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { downloadElementPng } from "@/lib/media/capture";
import { useEdgeInsights } from "@/lib/pnl/use-edge-insights";
import { useTrades } from "@/lib/journal/journal-context";
import {
  bucketPerformance,
  computeStats,
  fmtHold,
  fmtMoney,
  fmtNum,
  fmtPct,
  groupPerformance,
} from "@/lib/pnl/metrics";
import { KpiCards } from "@/components/analytics/KpiCards";
import { Empty, Panel, Stat, cumulative } from "@/components/kit";
import { EquityChart, PnlBars } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { seedDemoTrades } from "@/lib/journal/demo";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateData } from "@/lib/journal/query-cache";
import { CalendarToolbar } from "@/components/home/CalendarToolbar";
import { UnitToggle, type Unit } from "@/components/home/UnitToggle";
import {
  EVALUATION_LABELS,
  HOME_CHART_HEIGHT,
  HOME_CHART_ROWS,
  type EvaluationLabel,
} from "@/lib/home-layout";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home — EdgeWhiz" },
      { name: "description", content: "Your trading performance at a glance." },
      { property: "og:title", content: "Home — EdgeWhiz" },
      { property: "og:description", content: "Your trading performance at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

import { GettingStarted } from "@/components/onboarding/GettingStarted";
import { PerformanceRadar, performanceRadarData } from "@/components/home/PerformanceRadar";
import { RecentTrades } from "@/components/home/RecentTrades";
import { useTradeDrawer } from "@/components/journal/TradeDrawer";

function Home() {
  const { trades, journal, isLoading, flows } = useTrades();
  const drawer = useTradeDrawer();
  const qc = useQueryClient();
  const [unit, setUnit] = useState<Unit>("cur");
  const edgeCount = useEdgeInsights().length;
  const calRef = useRef<HTMLElement>(null);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const s = useMemo(
    () => computeStats(trades, journal?.starting_balance ?? 0, flows),
    [trades, journal, flows],
  );
  const cur = journal?.currency ?? "USD";
  const fmt = (v: number, r?: number | null, pct?: number) =>
    unit === "cur" ? fmtMoney(v, cur) : unit === "pct" ? fmtPct(pct ?? 0) : `${fmtNum(r ?? 0)}R`;

  if (!isLoading && journal && trades.length === 0)
    return (
      <div className="space-y-6">
        <GettingStarted />
        <Empty>
          <p className="text-base font-semibold text-foreground">No trades in this journal yet</p>
          <p className="mt-1">
            Add your first trade from the sidebar, import a CSV, to get started.
          </p>
          {import.meta.env.DEV && (
            <Button
              className="mt-4"
              onClick={async () => {
                await seedDemoTrades(journal.id);
                invalidateData(qc, "trades", "lookups", "cashflows", "progress");
              }}
            >
              Load sample trades (dev only)
            </Button>
          )}
        </Empty>
      </div>
    );

  const byInst = groupPerformance(trades, (t) => t.instrument).sort((a, b) => b.pnl - a.pnl);
  const byDay = bucketPerformance(
    trades,
    (t) => new Date(t.entry_at).getDay(),
    [1, 2, 3, 4, 5, 6, 0].map((d) => ({ k: d, label: FULL_DAYS[d] })),
  );
  const curve = cumulative(trades);
  const byHour = bucketPerformance(
    trades,
    (t) => new Date(t.entry_at).getHours(),
    Array.from({ length: 24 }, (_, h) => ({ k: h, label: `${String(h).padStart(2, "0")}:00` })),
  );
  const bySetup = groupPerformance(trades, (t) => t.setup).sort((a, b) => b.pnl - a.pnl);
  const dailyPnl = groupPerformance(trades, (t) => localDay(t.entry_at))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-14);
  const dailyCurve = cumulative(dailyPnl.map((day) => ({ net_pnl: day.pnl, entry_at: day.key })));
  const barFmt = (n: number) => fmtMoney(n, cur);
  // Evaluation rows follow the selected display unit (currency, Return %, R multiple)
  const pcts = trades.map((t) => t.retPct);
  const rs = trades.map((t) => t.r).filter((x): x is number => x != null);
  const sumR = rs.reduce((a, b) => a + b, 0);
  const tradingDays = new Set(trades.map((t) => localDay(t.entry_at))).size || 1;
  const ev = (money: number, pct: number, r: number) =>
    unit === "cur" ? fmtMoney(money, cur) : unit === "pct" ? fmtPct(pct) : `${fmtNum(r)}R`;

  const evaluation: Record<EvaluationLabel, ReactNode> = {
    "Total Number of Trades": s.count,
    "Avg. Profit per Trading Day": ev(s.avgPerDay, s.roi / tradingDays, sumR / tradingDays),
    "Biggest Winner": ev(
      s.biggestWin,
      pcts.length ? Math.max(...pcts) : 0,
      rs.length ? Math.max(...rs) : 0,
    ),
    "Biggest Loser": ev(
      s.biggestLoss,
      pcts.length ? Math.min(...pcts) : 0,
      rs.length ? Math.min(...rs) : 0,
    ),
    "Followed Trade Plan": fmtPct(s.followedPlanPct),
    "Winrate w/o BE": fmtPct(s.winRateNoBE),
    "Max Drawdown": fmtPct(s.maxDD),
    "Return/Drawdown": fmtNum(s.maxDD ? s.roi / s.maxDD : s.roi),
    "Winning / Losing Days": `${s.winDays} / ${s.lossDays}`,
    "Trades per Day / Week": `${fmtNum(s.perDay)} / ${fmtNum(s.perWeek)}`,
    "Avg. Hold Time": fmtHold(s.avgHoldMin),
    "Total Fees": fmtMoney(s.fees, cur),
    ROI: fmtPct(s.roi),
    "Current Streak": (
      <span className="flex gap-[3px]">
        {s.streak.map((x, i) => (
          <span
            key={i}
            className={cn(
              "rounded px-1 text-xs font-bold",
              x === "W"
                ? "bg-profit-soft text-profit"
                : x === "L"
                  ? "bg-loss-soft text-loss"
                  : "bg-muted",
            )}
          >
            {x}
          </span>
        ))}
      </span>
    ),
  };
  const charts: Record<(typeof HOME_CHART_ROWS)[number][number], ReactNode> = {
    "Performance by Instrument": (
      <PnlBars data={byInst} x="key" fmt={barFmt} height={HOME_CHART_HEIGHT} />
    ),
    "Performance by Weekday": (
      <PnlBars data={byDay} x="key" fmt={barFmt} height={HOME_CHART_HEIGHT} />
    ),
    "Equity Graph": (
      <EquityChart data={curve} height={HOME_CHART_HEIGHT} compact fmt={(n) => fmtMoney(n, cur)} />
    ),
    "Performance by Hour": (
      <PnlBars data={byHour} x="key" fmt={barFmt} height={HOME_CHART_HEIGHT} />
    ),
    "Performance by Setup": (
      <PnlBars data={bySetup} x="key" fmt={barFmt} height={HOME_CHART_HEIGHT} />
    ),
  };

  return (
    <div className="mx-auto max-w-[1460px] space-y-4 pb-8">
      <GettingStarted />
      <header className="flex flex-col gap-4 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-info">
            Trading workspace
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2 rounded-md border border-sidebar-primary/30 bg-sidebar-accent px-2.5 py-1.5 font-medium text-foreground">
              <span className="size-2 rounded-full bg-sidebar-primary" aria-hidden="true" />
              {journal?.name ?? "Select a journal"}
            </span>
            <span>{s.count} trades</span>
            <span>Balance {fmtMoney(s.balance, cur)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <UnitToggle unit={unit} currency={cur} onChange={setUnit} />
          <Button variant="ink" onClick={() => drawer.open()} className="gap-2">
            <Rocket data-icon="inline-start" />
            Start my day
          </Button>
        </div>
      </header>

      {edgeCount > 0 && (
        <Link
          to={"/edge-finder" as never}
          className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-[12px] shadow-sm transition-colors hover:bg-muted"
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>
            Edge Finder found{" "}
            <b>
              {edgeCount} insight{edgeCount === 1 ? "" : "s"}
            </b>{" "}
            in your journal
          </span>
          <ChevronRight className="ml-auto h-4 w-4" />
        </Link>
      )}

      <KpiCards
        trades={trades}
        s={s}
        fmt={fmt}
        avgWinLabel={fmtMoney(s.avgWin, cur)}
        avgLossLabel={fmtMoney(s.avgLoss, cur)}
      />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <PerformanceRadar data={performanceRadarData(s)} score={s.score} />
        <Panel title="Daily cumulative P&L" className="border border-border/70 p-4 shadow-none">
          <EquityChart
            data={dailyCurve}
            height={250}
            compact
            fmt={(value) => fmtMoney(value, cur)}
          />
        </Panel>
        <Panel title="Net daily P&L" className="border border-border/70 p-4 shadow-none">
          <PnlBars data={dailyPnl} x="key" fmt={barFmt} height={250} />
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.55fr)]">
        <RecentTrades trades={trades} currency={cur} />
        <Panel
          title="Profit calendar"
          sectionRef={calRef}
          className="border border-border/70 p-4 shadow-none"
          action={
            <CalendarToolbar
              month={month}
              onMonthChange={setMonth}
              onSave={() => {
                if (calRef.current)
                  downloadElementPng(
                    calRef.current,
                    `profit-calendar-${format(month, "yyyy-MM")}.png`,
                  ).catch(() => toast.error("Could not create the image"));
              }}
            />
          }
        >
          <ProfitCalendar trades={trades} month={month} fmt={(pnl, r, pct) => fmt(pnl, r, pct)} />
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Performance breakdown</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Explore the setups, instruments and sessions behind your edge.
              </p>
            </div>
            <Link
              to="/analytics"
              className="shrink-0 text-xs font-medium text-info hover:underline"
            >
              Open analytics
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(
              [
                "Performance by Instrument",
                "Performance by Weekday",
                "Performance by Hour",
                "Performance by Setup",
              ] as const
            ).map((title) => (
              <Panel key={title} title={title} className="border border-border/70 p-4 shadow-none">
                {charts[title]}
              </Panel>
            ))}
          </div>
        </div>
        <Panel title="Evaluation" className="h-fit border border-border/70 p-4 shadow-none">
          <div className="divide-y divide-border/60">
            {EVALUATION_LABELS.map((label) => (
              <Stat key={label} label={label} value={evaluation[label]} />
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}
