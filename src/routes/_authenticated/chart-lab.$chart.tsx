import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTrades } from "@/lib/journal/journal-context";
import { CHARTS } from "@/lib/nav";
import { type Trade } from "@/lib/pnl/metrics";
import { Empty } from "@/components/kit";
import { Comments } from "@/components/chart-lab/comments";
import { Compare } from "@/components/chart-lab/compare";
import { Consecutive } from "@/components/chart-lab/consecutive";
import { CustomStatistics } from "@/components/chart-lab/custom-statistics";
import { Drawdown } from "@/components/chart-lab/drawdown";
import { Efficiency } from "@/components/chart-lab/efficiency";
import { ExitAnalysis } from "@/components/chart-lab/exit-analysis";
import { GroupChart } from "@/components/chart-lab/group-chart";
import { HoldingTime } from "@/components/chart-lab/holding-time";
import { Ratios } from "@/components/chart-lab/ratios";
import { RiskDistribution } from "@/components/chart-lab/risk-distribution";
import { SQN } from "@/components/chart-lab/sqn";
import { PerformanceByDay, PerformanceByTime } from "@/components/chart-lab/performance-by-time";
import { TradeManagement } from "@/components/chart-lab/trade-management";
import { WinRate } from "@/components/chart-lab/win-rate";

export const Route = createFileRoute("/_authenticated/chart-lab/$chart")({
  loader: ({ params }) => {
    const c = CHARTS.find(([k]) => k === params.chart);
    if (!c) throw notFound();
    return { title: c[1] };
  },
  head: ({ loaderData }) => {
    const title = `${loaderData?.title ?? "Chart Lab"} — AlphaMine`;
    const description = "Chart Lab analysis of your trades.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: ChartPage,
  notFoundComponent: () => <Empty>That chart doesn't exist.</Empty>,
  errorComponent: ({ error }) => <Empty>{(error as Error).message}</Empty>,
});

function ChartPage() {
  const { chart } = Route.useParams();
  const { trades, journal } = useTrades();
  const cur = journal?.currency ?? "USD";
  const start = journal?.starting_balance ?? 0;
  const bySetup = useMemo(() => (t: Trade) => [t.setup], []);
  const byInst = useMemo(() => (t: Trade) => [t.instrument], []);
  if (!trades.length) return <Empty>No trades to analyse yet.</Empty>;
  switch (chart) {
    case "compare":
      return <Compare trades={trades} cur={cur} start={start} />;
    case "consecutive":
      return <Consecutive trades={trades} cur={cur} start={start} />;
    case "custom-statistics":
      return <CustomStatistics trades={trades} start={start} cur={cur} />;
    case "drawdown":
      return <Drawdown trades={trades} cur={cur} start={start} />;
    case "efficiency":
      return <Efficiency trades={trades} />;
    case "exit-analysis":
      return <ExitAnalysis trades={trades} />;
    case "holding-time":
      return <HoldingTime trades={trades} cur={cur} />;
    case "instrument":
      return (
        <GroupChart
          trades={trades}
          start={start}
          cur={cur}
          by={byInst}
          noun="Instrument"
          drill={(k) => ({ instrument: [k] })}
        />
      );
    case "setup":
      return (
        <GroupChart
          trades={trades}
          start={start}
          cur={cur}
          by={bySetup}
          noun="Setup"
          drill={(k) => ({ setup: [k] })}
        />
      );
    case "time":
      return <PerformanceByTime trades={trades} start={start} cur={cur} />;
    case "day":
      return <PerformanceByDay trades={trades} cur={cur} />;
    case "ratios":
      return <Ratios trades={trades} start={start} />;
    case "risk-distribution":
      return <RiskDistribution trades={trades} start={start} />;
    case "sqn":
      return <SQN trades={trades} start={start} />;
    case "trade-comments":
      return <Comments trades={trades} start={start} cur={cur} />;
    case "trade-management":
      return <TradeManagement trades={trades} />;
    case "win-rate":
      return <WinRate trades={trades} />;
  }
  return null;
}
