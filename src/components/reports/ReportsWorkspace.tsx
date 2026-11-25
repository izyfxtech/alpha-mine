import { format } from "date-fns";
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { CHARTS } from "@/lib/nav";
import { useTrades } from "@/lib/journal/journal-context";
import { cumulative, Panel } from "@/components/kit";
import { EquityChart, PnlBars } from "@/components/charts";
import { KpiCards } from "@/components/analytics/KpiCards";
import { ProfitCalendar } from "@/components/analytics/ProfitCalendar";
import { MonthSwitcher } from "@/components/portfolio/MonthSwitcher";
import { RecentTrades } from "@/components/home/RecentTrades";
import { TradeBreakdown } from "@/routes/_authenticated/analytics";
import { EquityReport } from "@/routes/_authenticated/equity";
import { ChartReport } from "@/routes/_authenticated/chart-lab.$chart";
import { computeStats, fmtMoney, groupPerformance } from "@/lib/pnl/metrics";
import { localDay } from "@/lib/time/local-time";
import { cn } from "@/lib/utils";

export type ReportsView = "overview" | "breakdown" | "equity" | "calendar" | "chart-lab";

type ReportsWorkspaceProps = {
  view: ReportsView;
  chart: string;
  month: Date;
  onViewChange: (view: ReportsView) => void;
  onChartChange: (chart: string) => void;
  onMonthChange: (month: Date) => void;
};

const reportViews: { value: ReportsView; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "breakdown", label: "Trade breakdown" },
  { value: "equity", label: "Equity" },
  { value: "calendar", label: "Calendar" },
  { value: "chart-lab", label: "Chart Lab" },
];

const money = (value: number, currency: string) => fmtMoney(value, currency);

export function ReportsWorkspace({
  view,
  chart,
  month,
  onViewChange,
  onChartChange,
  onMonthChange,
}: ReportsWorkspaceProps) {
  const { trades, journal, flows } = useTrades();
  const stats = useMemo(
    () => computeStats(trades, journal?.starting_balance ?? 0, flows),
    [trades, journal, flows],
  );
  const currency = journal?.currency ?? "USD";
  const formatValue = (value: number) => money(value, currency);
  const equity = cumulative(trades);
  const byInstrument = groupPerformance(trades, (trade) => trade.instrument).sort(
    (a, b) => b.pnl - a.pnl,
  );
  const bySetup = groupPerformance(trades, (trade) => trade.setup).sort((a, b) => b.pnl - a.pnl);
  const daily = groupPerformance(trades, (trade) => localDay(trade.entry_at))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-14);
  const selectedChart = CHARTS.some(([slug]) => slug === chart) ? chart : CHARTS[0]![0];

  return (
    <div className="mx-auto max-w-[1460px] space-y-4 pb-8">
      <header className="flex flex-col gap-2 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-info">
            Performance review
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {journal?.name ?? "Your active journal"} · {trades.length} trades
          </p>
        </div>
      </header>

      <nav
        aria-label="Report views"
        className="flex min-w-0 gap-1 overflow-x-auto border-b border-border/70"
      >
        {reportViews.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={view === item.value}
            onClick={() => onViewChange(item.value)}
            className={cn(
              "shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
              view === item.value && "border-sidebar-primary font-semibold text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <KpiCards
        trades={trades}
        s={stats}
        fmt={(value) => money(value, currency)}
        avgWinLabel={money(stats.avgWin, currency)}
        avgLossLabel={money(stats.avgLoss, currency)}
      />

      {view === "overview" && (
        <>
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <Panel title="Equity curve" className="border border-border/70 p-4 shadow-none">
              <EquityChart
                data={equity}
                height={320}
                compact
                fmt={(value) => money(value, currency)}
              />
            </Panel>
            <Panel title="Performance by setup" className="border border-border/70 p-4 shadow-none">
              <PnlBars data={bySetup} x="key" fmt={formatValue} height={320} />
            </Panel>
          </section>
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Panel
              title="Performance by instrument"
              className="border border-border/70 p-4 shadow-none"
            >
              <PnlBars data={byInstrument} x="key" fmt={formatValue} height={280} />
            </Panel>
            <Panel title="Recent daily P&L" className="border border-border/70 p-4 shadow-none">
              <PnlBars data={daily} x="key" fmt={formatValue} height={280} />
            </Panel>
          </section>
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <Panel title="Profit calendar" className="border border-border/70 p-4 shadow-none">
              <ProfitCalendar
                tall
                trades={trades}
                month={month}
                fmt={(pnl) => money(pnl, currency)}
              />
            </Panel>
            <RecentTrades trades={trades} currency={currency} />
          </section>
          <MoreReports />
        </>
      )}

      {view === "breakdown" && <TradeBreakdown embedded />}
      {view === "equity" && <EquityReport />}
      {view === "calendar" && (
        <Panel
          title={`Calendar · ${format(month, "MMMM yyyy")}`}
          className="border border-border/70 p-4 shadow-none"
          action={<MonthSwitcher month={month} onMonthChange={onMonthChange} />}
        >
          <div className="mx-auto max-w-[1040px]">
            <ProfitCalendar
              tall
              trades={trades}
              month={month}
              fmt={(pnl) => money(pnl, currency)}
            />
          </div>
        </Panel>
      )}
      {view === "chart-lab" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Chart Lab</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Select a view to investigate a specific part of your results.
              </p>
            </div>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Report
              <select
                aria-label="Chart Lab report"
                value={selectedChart}
                onChange={(event) => onChartChange(event.target.value)}
                className="h-9 min-w-[220px] rounded-md border bg-card px-3 text-sm text-foreground"
              >
                {CHARTS.map(([slug, label]) => (
                  <option key={slug} value={slug}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="min-w-0 rounded-xl border border-border/70 bg-card p-4">
            <ChartReport chart={selectedChart} />
          </div>
        </section>
      )}
    </div>
  );
}

function MoreReports() {
  const links = [
    ["Monthly report", "/reports/monthly"],
    ["Annual overview", "/reports/annual"],
    ["Chart book", "/reports/chart-book"],
    ["Edge Finder", "/edge-finder"],
    ["Rule compliance", "/rules"],
    ["Prop challenge", "/prop-challenge"],
    ["Milestones", "/milestones"],
    ["Strategy Lab", "/strategy-lab/backtester"],
  ] as const;
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold">More reports and tools</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Specialized reviews stay grouped here instead of crowding the sidebar.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {links.map(([label, to]) => (
          <Link
            key={to}
            to={to as never}
            className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
          >
            {label}
            <span aria-hidden="true" className="text-muted-foreground">
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
