import { cloneElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { enrichTrade, type Trade, type TradeRow } from "@/lib/pnl/metrics";

vi.mock("recharts", async (original) => ({
  ...(await original<typeof import("recharts")>()),
  // jsdom has no layout, so give charts a fixed size and they draw for real.
  ResponsiveContainer: ({ children }: { children: ReactElement }) => (
    <div>{cloneElement(children, { width: 800, height: 400 } as object)}</div>
  ),
}));
vi.mock("@/lib/journal/journal-context", async (original) => ({
  ...(await original<typeof import("@/lib/journal/journal-context")>()),
  useJournalFlows: () => [],
  useLookups: () => ({ data: undefined }),
}));
vi.mock("@/components/journal/TradeDrawer", () => ({ useTradeDrawer: () => ({ open: vi.fn() }) }));
vi.mock("@/lib/journal/drilldown", () => ({ useDrillDown: () => vi.fn() }));

import { Compare } from "@/components/chart-lab/compare";
import { Comments } from "@/components/chart-lab/comments";
import { Consecutive } from "@/components/chart-lab/consecutive";
import { CustomStatistics } from "@/components/chart-lab/custom-statistics";
import { Drawdown } from "@/components/chart-lab/drawdown";
import { Efficiency } from "@/components/chart-lab/efficiency";
import { ExitAnalysis } from "@/components/chart-lab/exit-analysis";
import { GroupChart } from "@/components/chart-lab/group-chart";
import { HoldingTime } from "@/components/chart-lab/holding-time";
import { PerformanceByDay, PerformanceByTime } from "@/components/chart-lab/performance-by-time";
import { Ratios } from "@/components/chart-lab/ratios";
import { RiskDistribution } from "@/components/chart-lab/risk-distribution";
import { SQN } from "@/components/chart-lab/sqn";
import { TradeManagement } from "@/components/chart-lab/trade-management";
import { WinRate } from "@/components/chart-lab/win-rate";

const NETS = [
  120, -60, 45, -30, 80, -75, 150, -40, 20, 95, -55, 60, -25, 110, -90, 35, 70, -45, 25, 130,
];

/** Twenty varied trades over a few weeks, enough for every chart to have something to draw. */
const trades: Trade[] = NETS.map((net, i) => {
  const day = String(1 + Math.floor(i / 2)).padStart(2, "0");
  const hour = String(6 + (i % 9)).padStart(2, "0");
  const row = {
    id: `t${i}`,
    journal_id: "j",
    instrument_id: null,
    setup_id: null,
    trading_plan_id: null,
    direction: i % 3 ? "long" : "short",
    trade_type: "Spot",
    entry_at: `2026-10-${day}T${hour}:00:00Z`,
    exit_at: `2026-10-${day}T${String(Number(hour) + 1).padStart(2, "0")}:30:00Z`,
    entry_price: 1.1,
    exit_price: net > 0 ? 1.1 + net / 10000 : 1.1 + net / 10000,
    quantity: 0.1,
    stop_loss: 1.095,
    take_profit: 1.11,
    high_price: 1.105,
    low_price: 1.09,
    otp_hit: null,
    gross_pnl: net + 1,
    fees: 1,
    net_pnl: net,
    risk_amount: null,
    is_favorite: false,
    notes: null,
    created_at: `2026-10-${day}T10:00:00Z`,
    is_break_even: false,
    trade_no: i + 1,
    pnl_manual: true,
    source: "manual",
    external_id: null,
    raw_symbol: "EURUSD",
    commission: -1,
    swap: 0,
  } as unknown as TradeRow;
  return enrichTrade(
    row,
    new Map([["i1", { id: "i1", symbol: "EURUSD", asset_class: "forex" }]]) as never,
    new Map(),
    [],
  );
});
const props = { trades, cur: "USD", start: 10000 };

describe("Chart Lab charts", () => {
  const cases: [string, ReactElement][] = [
    ["Compare", <Compare key="a" {...props} />],
    ["Consecutive", <Consecutive key="a" {...props} />],
    ["Drawdown", <Drawdown key="a" {...props} />],
    ["Efficiency", <Efficiency key="a" trades={trades} />],
    ["ExitAnalysis", <ExitAnalysis key="a" trades={trades} />],
    ["HoldingTime", <HoldingTime key="a" trades={trades} cur="USD" />],
    ["Ratios", <Ratios key="a" trades={trades} start={10000} />],
    ["RiskDistribution", <RiskDistribution key="a" trades={trades} start={10000} />],
    ["SQN", <SQN key="a" trades={trades} start={10000} />],
    ["WinRate", <WinRate key="a" trades={trades} />],
    ["Comments", <Comments key="a" {...props} />],
    ["TradeManagement", <TradeManagement key="a" trades={trades} />],
    ["PerformanceByTime", <PerformanceByTime key="a" {...props} />],
    ["PerformanceByDay", <PerformanceByDay key="a" trades={trades} cur="USD" />],
    ["CustomStatistics", <CustomStatistics key="a" {...props} />],
    [
      "GroupChart",
      <GroupChart
        key="a"
        {...props}
        by={(t: Trade) => [t.setup]}
        noun="Setup"
        drill={(k: string) => ({ setup: [k] })}
      />,
    ],
  ];
  it.each(cases)("%s renders with trades", (_name, element) => {
    const { container } = render(element);
    expect(container.textContent?.length).toBeGreaterThan(0);
  });
});
