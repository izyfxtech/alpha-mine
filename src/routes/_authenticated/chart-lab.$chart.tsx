import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { lazy, Suspense, useMemo } from "react";
import { useTrades } from "@/lib/journal/journal-context";
import { CHARTS } from "@/lib/nav";
import { type Trade } from "@/lib/pnl/metrics";
import { Empty } from "@/components/kit";

// Each chart (and the charting library behind it) is fetched only when that chart is opened.
const Comments = lazy(() =>
  import("@/components/chart-lab/comments").then((m) => ({ default: m.Comments })),
);
const Compare = lazy(() =>
  import("@/components/chart-lab/compare").then((m) => ({ default: m.Compare })),
);
const Consecutive = lazy(() =>
  import("@/components/chart-lab/consecutive").then((m) => ({ default: m.Consecutive })),
);
const CustomStatistics = lazy(() =>
  import("@/components/chart-lab/custom-statistics").then((m) => ({ default: m.CustomStatistics })),
);
const Drawdown = lazy(() =>
  import("@/components/chart-lab/drawdown").then((m) => ({ default: m.Drawdown })),
);
const Efficiency = lazy(() =>
  import("@/components/chart-lab/efficiency").then((m) => ({ default: m.Efficiency })),
);
const ExitAnalysis = lazy(() =>
  import("@/components/chart-lab/exit-analysis").then((m) => ({ default: m.ExitAnalysis })),
);
const GroupChart = lazy(() =>
  import("@/components/chart-lab/group-chart").then((m) => ({ default: m.GroupChart })),
);
const HoldingTime = lazy(() =>
  import("@/components/chart-lab/holding-time").then((m) => ({ default: m.HoldingTime })),
);
const Ratios = lazy(() =>
  import("@/components/chart-lab/ratios").then((m) => ({ default: m.Ratios })),
);
const RiskDistribution = lazy(() =>
  import("@/components/chart-lab/risk-distribution").then((m) => ({ default: m.RiskDistribution })),
);
const SQN = lazy(() => import("@/components/chart-lab/sqn").then((m) => ({ default: m.SQN })));
const PerformanceByDay = lazy(() =>
  import("@/components/chart-lab/performance-by-time").then((m) => ({
    default: m.PerformanceByDay,
  })),
);
const PerformanceByTime = lazy(() =>
  import("@/components/chart-lab/performance-by-time").then((m) => ({
    default: m.PerformanceByTime,
  })),
);
const TradeManagement = lazy(() =>
  import("@/components/chart-lab/trade-management").then((m) => ({ default: m.TradeManagement })),
);
const WinRate = lazy(() =>
  import("@/components/chart-lab/win-rate").then((m) => ({ default: m.WinRate })),
);

export const Route = createFileRoute("/_authenticated/chart-lab/$chart")({
  beforeLoad: ({ params }) => {
    if (!CHARTS.some(([key]) => key === params.chart)) throw notFound();
    throw redirect({ to: "/reports", search: { view: "chart-lab", chart: params.chart } as never });
  },
  loader: ({ params }) => {
    const c = CHARTS.find(([k]) => k === params.chart);
    if (!c) throw notFound();
    return { title: c[1] };
  },
  head: ({ loaderData }) => {
    const title = `${loaderData?.title ?? "Chart Lab"} — EdgeWhiz`;
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
  return <ChartReport chart={chart} />;
}

export function ChartReport({ chart }: { chart: string }) {
  return (
    <Suspense fallback={null}>
      <ChartBody chart={chart} />
    </Suspense>
  );
}

function ChartBody({ chart }: { chart: string }) {
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
