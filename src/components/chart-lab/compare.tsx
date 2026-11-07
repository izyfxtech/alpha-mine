import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { computeStats, fmtMoney, fmtNum, type Trade } from "@/lib/pnl/metrics";
import { Empty, axis, seriesValues, tradeAxis, yScale } from "@/components/kit";
import { COMPARE_ALL, groupValues, resolveValue, runningTotal } from "@/lib/compare";
import { DAYS } from "@/components/chart-lab/calendar-labels";
import { ChartCard, Dot, Select, Tip, sorted, tickFmt } from "@/components/chart-lab/chart-kit";

/* ---------------- Compare Charts: two trade groups side by side ---------------- */
const DIMS = ["All Trades", "Setup", "Instrument", "Weekday", "Direction"] as const;
type Dim = (typeof DIMS)[number];
const dimKey = (d: Dim, t: Trade) =>
  d === "Setup"
    ? t.setup
    : d === "Instrument"
      ? t.instrument
      : d === "Weekday"
        ? DAYS[(new Date(t.entry_at).getDay() + 6) % 7]
        : d === "Direction"
          ? t.direction === "short"
            ? "Short"
            : "Long"
          : "All";

function GroupPicker({
  label,
  dim,
  val,
  setDim,
  setVal,
  trades,
}: {
  label: string;
  dim: Dim;
  val: string;
  setDim: (d: Dim) => void;
  setVal: (v: string) => void;
  trades: Trade[];
}) {
  const vals = useMemo(() => groupValues(trades, (t) => dimKey(dim, t)), [trades, dim]);
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">{label}</span>
      <Select
        label="Group by"
        value={dim}
        options={DIMS}
        onChange={(d) => {
          setDim(d);
          setVal(
            d === "All Trades" ? COMPARE_ALL : (groupValues(trades, (t) => dimKey(d, t))[0] ?? ""),
          );
        }}
        width="w-32"
      />
      {dim !== "All Trades" && (
        <Select label={dim} value={resolveValue(vals, val)} options={vals} onChange={setVal} />
      )}
    </div>
  );
}

export function Compare({ trades, cur, start }: { trades: Trade[]; cur: string; start: number }) {
  const [dA, setDA] = useState<Dim>("Direction");
  const [pA, setVA] = useState("Long");
  const [dB, setDB] = useState<Dim>("Direction");
  const [pB, setVB] = useState("Short");
  // A pick can disappear (journal switched, filters changed): fall back to a group that has trades instead of drawing an empty line.
  const vA =
    dA === "All Trades"
      ? COMPARE_ALL
      : resolveValue(
          groupValues(trades, (t) => dimKey(dA, t)),
          pA,
        );
  const vB =
    dB === "All Trades"
      ? COMPARE_ALL
      : resolveValue(
          groupValues(trades, (t) => dimKey(dB, t)),
          pB,
        );
  const gA = useMemo(() => sorted(trades.filter((t) => dimKey(dA, t) === vA)), [trades, dA, vA]);
  const gB = useMemo(() => sorted(trades.filter((t) => dimKey(dB, t) === vB)), [trades, dB, vB]);
  const nameA = dA === "All Trades" ? "All Trades" : vA,
    nameB = dB === "All Trades" ? "All Trades" : vB;
  const same = dA === dB && vA === vB;
  const tA = runningTotal(gA.map((t) => t.net_pnl)),
    tB = runningTotal(gB.map((t) => t.net_pnl));
  const data = Array.from({ length: Math.max(tA.length, tB.length) }, (_, i) => ({
    n: i,
    A: i < tA.length ? tA[i] : null,
    B: i < tB.length ? tB[i] : null,
  }));
  // Deposits and withdrawals belong to the whole account, not to a slice of it, so they stay out of a group's own statistics.
  const sA = computeStats(gA, start, []),
    sB = computeStats(gB, start, []);
  const rows: [string, (s: typeof sA) => string][] = [
    ["Trades", (s) => String(s.count)],
    ["Net Return", (s) => fmtMoney(s.net, cur)],
    ["Winrate", (s) => `${s.winRate.toFixed(2)}%`],
    ["Profit Factor", (s) => (Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞")],
    ["Avg. P&L", (s) => fmtMoney(s.avgPnl, cur)],
    ["Avg. Winner", (s) => fmtMoney(s.avgWin, cur)],
    ["Avg. Loser", (s) => fmtMoney(s.avgLoss, cur)],
    ["Avg. R", (s) => fmtNum(s.avgR)],
    ["Max Drawdown", (s) => `${s.maxDD.toFixed(2)}%`],
  ];
  return (
    <div className="space-y-4">
      <ChartCard
        controls={
          <div className="flex flex-wrap gap-6">
            <GroupPicker
              label="A"
              dim={dA}
              val={vA}
              setDim={setDA}
              setVal={setVA}
              trades={trades}
            />
            <GroupPicker
              label="B"
              dim={dB}
              val={vB}
              setDim={setDB}
              setVal={setVB}
              trades={trades}
            />
          </div>
        }
        legend={
          <>
            <Dot c="bg-chart-1">{nameA}</Dot>
            <Dot c="bg-info">{nameB}</Dot>
          </>
        }
      >
        {same && (
          <p className="mb-2 text-xs text-muted-foreground">
            Both sides are the same group, so the two lines sit on top of each other. Pick a
            different group for B.
          </p>
        )}
        {!gA.length || !gB.length ? (
          <Empty>{!gA.length ? nameA : nameB} has no trades with the current filters.</Empty>
        ) : (
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-grid)" />
                <XAxis
                  dataKey="n"
                  tick={axis}
                  tickLine={false}
                  axisLine={false}
                  {...tradeAxis(data.length - 1)}
                  label={{ value: "Trades", position: "insideBottom", offset: -2, style: axis }}
                />
                <YAxis
                  tick={axis}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  tickFormatter={tickFmt}
                  {...yScale(
                    seriesValues(data as unknown as Record<string, unknown>[], ["A", "B"]),
                  )}
                />
                <ReferenceLine y={0} stroke="var(--color-foreground)" />
                <Tooltip
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <Tip
                        title={Number(label) === 0 ? "Start" : `Trade ${label}`}
                        lines={payload.map(
                          (p) =>
                            [p.dataKey === "A" ? nameA : nameB, fmtMoney(Number(p.value), cur)] as [
                              string,
                              string,
                            ],
                        )}
                      />
                    ) : null
                  }
                />
                <Line
                  dataKey="A"
                  type="linear"
                  dot={false}
                  strokeWidth={2}
                  stroke="var(--color-chart-1)"
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="B"
                  type="linear"
                  dot={false}
                  strokeWidth={2}
                  stroke="var(--color-info)"
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
      <section className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm tabular">
          <thead>
            <tr className="border-b text-left">
              <th className="px-4 py-2.5 font-semibold">Statistic</th>
              <th className="px-4 text-right font-semibold">{nameA}</th>
              <th className="px-4 text-right font-semibold">{nameB}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([l, f]) => (
              <tr key={l} className="border-b border-border/40">
                <td className="px-4 py-2">{l}</td>
                <td className="px-4 text-right">{f(sA)}</td>
                <td className="px-4 text-right">{f(sB)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
