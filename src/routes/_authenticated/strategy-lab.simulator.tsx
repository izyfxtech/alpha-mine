import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import seedrandom from "seedrandom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { axis, tooltipStyle, tradeAxis, yRange } from "@/components/kit";
import {
  SIMULATOR_CHART_HEIGHT,
  SIMULATOR_DEFAULTS,
  SIMULATOR_SHOWN,
  SimulatorField,
  SimulatorFrame,
  SimulatorResults,
  resultKey,
  simulatorFields,
  type SimulatorParams,
} from "@/components/strategy/SimulatorLayout";
import { useTrades } from "@/lib/journal/journal-context";
import { computeStats, fmtMoney, fmtNum } from "@/lib/pnl/metrics";

export const Route = createFileRoute("/_authenticated/strategy-lab/simulator")({
  head: () => ({
    meta: [
      { title: "Simulator — AlphaMine" },
      { name: "description", content: "Monte Carlo simulation of future account growth." },
      { property: "og:title", content: "Simulator — AlphaMine" },
      { property: "og:description", content: "Monte Carlo simulation of future account growth." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Simulator,
});

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-1)",
];

function Simulator() {
  const { trades, journal, flows } = useTrades();
  const base = computeStats(trades, journal?.starting_balance ?? 10000, flows);
  const cur = journal?.currency;
  // Starting values come from the journal's own trades: the measured average win and loss in currency, not an assumed 1R.
  // Whatever the trader types replaces the measured value for that field.
  const measured = useMemo(() => {
    const wins = trades.filter((t) => t.net_pnl > 0).map((t) => t.net_pnl);
    const losses = trades.filter((t) => t.net_pnl < 0).map((t) => -t.net_pnl);
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    return {
      balance: Math.round(base.balance),
      // Wins over wins + losses: avgLoss is measured on losers only, so break-evens must not dilute the rate.
      winRate: +(
        wins.length + losses.length
          ? (wins.length / (wins.length + losses.length)) * 100
          : base.winRate
      ).toFixed(1),
      avgWin: +avg(wins).toFixed(2),
      avgLoss: +avg(losses).toFixed(2),
    };
  }, [trades, base.balance, base.winRate]);
  const [edits, setEdits] = useState<Partial<SimulatorParams>>({});
  const p: SimulatorParams = {
    ...SIMULATOR_DEFAULTS,
    ...(trades.length
      ? {
          balance: measured.balance,
          winRate: measured.winRate,
          avgWin: measured.avgWin || SIMULATOR_DEFAULTS.avgWin,
          avgLoss: measured.avgLoss || SIMULATOR_DEFAULTS.avgLoss,
        }
      : {}),
    ...edits,
  };
  // Each run is drawn from a seeded generator, so the same inputs and seed always give the same picture; "Run again" changes the seed.
  const [seed, setSeed] = useState(0);

  const sim = useMemo(() => {
    const random = seedrandom(String(seed));
    const paths: number[][] = [];
    let longestWin = 0,
      longestLoss = 0,
      winners = 0,
      losers = 0;
    for (let k = 0; k < p.sims; k++) {
      let bal = p.balance,
        ws = 0,
        ls = 0;
      const path = [bal];
      for (let i = 0; i < p.trades; i++) {
        if (random() * 100 < p.winRate) {
          bal += p.avgWin;
          winners++;
          ws++;
          ls = 0;
        } else {
          bal -= p.avgLoss;
          losers++;
          ls++;
          ws = 0;
        }
        longestWin = Math.max(longestWin, ws);
        longestLoss = Math.max(longestLoss, ls);
        path.push(+bal.toFixed(2));
      }
      paths.push(path);
    }
    const finals = paths.map((x) => x[x.length - 1]).sort((a, b) => a - b);
    const dd = paths
      .map((x) => {
        let peak = x[0],
          m = 0;
        x.forEach((v) => {
          peak = Math.max(peak, v);
          m = Math.max(m, peak > 0 ? (peak - v) / peak : 0);
        });
        return m * 100;
      })
      .sort((a, b) => a - b);
    const chart = Array.from({ length: p.trades + 1 }, (_, i) => {
      const row: Record<string, number> = { i };
      paths.slice(0, SIMULATOR_SHOWN).forEach((x, k) => (row[`p${k}`] = x[i]));
      return row;
    });
    return {
      finals,
      dd,
      chart,
      longestWin,
      longestLoss,
      winners,
      losers,
      profitable: (finals.filter((f) => f > p.balance).length / Math.max(1, p.sims)) * 100,
    };
  }, [p.sims, p.trades, p.balance, p.winRate, p.avgWin, p.avgLoss, seed]);

  const pct = (a: number[], q: number) => a[Math.floor((a.length - 1) * q)] ?? 0;
  const num =
    (k: keyof SimulatorParams, min = 0, max = Infinity) =>
    (e: { target: { value: string } }) =>
      setEdits((prev) => ({ ...prev, [k]: Math.min(max, Math.max(min, Number(e.target.value))) }));
  const exp = (p.winRate / 100) * p.avgWin - (1 - p.winRate / 100) * p.avgLoss;
  const total = sim.winners + sim.losers || 1;

  const values: Record<string, ReactNode> = {
    [resultKey("Longest winning streak", "Trades in a row")]: sim.longestWin,
    [resultKey("Longest losing streak", "Trades in a row")]: sim.longestLoss,
    [resultKey("Winners", "Total")]: sim.winners,
    [resultKey("Winners", "Share")]: `${fmtNum((sim.winners / total) * 100, 1)}%`,
    [resultKey("Losers", "Total")]: sim.losers,
    [resultKey("Losers", "Share")]: `${fmtNum((sim.losers / total) * 100, 1)}%`,
    [resultKey("Final balance", "Worst 5%")]: fmtMoney(pct(sim.finals, 0.05), cur),
    [resultKey("Final balance", "Median")]: fmtMoney(pct(sim.finals, 0.5), cur),
    [resultKey("Final balance", "Best 5%")]: fmtMoney(pct(sim.finals, 0.95), cur),
    [resultKey("Final balance", "Chance of profit")]: `${fmtNum(sim.profitable, 1)}%`,
    [resultKey("Maximum drawdown", "Median")]: `${fmtNum(pct(sim.dd, 0.5), 1)}%`,
    [resultKey("Maximum drawdown", "Worst 5%")]: `${fmtNum(pct(sim.dd, 0.95), 1)}%`,
    [resultKey("Maximum drawdown", "Worst case")]: `${fmtNum(sim.dd[sim.dd.length - 1] ?? 0, 1)}%`,
  };

  return (
    <SimulatorFrame
      sims={p.sims}
      action={
        <Button variant="outline" onClick={() => setSeed(seed + 1)}>
          Re-run
        </Button>
      }
      inputs={simulatorFields(cur ?? "USD").map((f) => (
        <SimulatorField key={f.key} label={f.label}>
          <Input
            type="number"
            step={"step" in f ? f.step : undefined}
            value={p[f.key]}
            onChange={num(f.key, "min" in f ? f.min : 0, "max" in f ? f.max : Infinity)}
          />
        </SimulatorField>
      ))}
      note={
        <>
          Prefilled from your journal. Expectancy: <b>{fmtMoney(exp, cur)}</b> per trade.
        </>
      }
      chart={
        <ResponsiveContainer width="100%" height={SIMULATOR_CHART_HEIGHT}>
          <LineChart data={sim.chart}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis
              dataKey="i"
              tick={axis}
              tickLine={false}
              axisLine={false}
              {...tradeAxis(p.trades)}
            />
            <YAxis
              tick={axis}
              tickLine={false}
              axisLine={false}
              width={70}
              {...yRange(sim.chart as Record<string, number>[])}
            />
            <Tooltip {...tooltipStyle} />
            {Array.from({ length: Math.min(SIMULATOR_SHOWN, p.sims) }, (_, k) => (
              <Line
                key={k}
                dataKey={`p${k}`}
                stroke={COLORS[k % COLORS.length]}
                strokeOpacity={0.6}
                dot={false}
                strokeWidth={1}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      }
      results={<SimulatorResults values={values} />}
    />
  );
}
