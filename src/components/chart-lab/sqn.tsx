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
import { useJournalFlows } from "@/lib/journal/journal-context";
import { computeStats, fmtNum, groupBy, sqnOf, type Trade } from "@/lib/pnl/metrics";
import { AccentStat, axis, yScale } from "@/components/kit";
import { cn } from "@/lib/utils";
import {
  XModeSelect,
  pointTitle,
  tradeTime,
  useXMode,
  xAxisLabel,
  xAxisProps,
} from "@/components/analytics/x-axis";
import { ChartCard, Dot, Stats, sorted } from "@/components/chart-lab/chart-kit";

export function SQN({ trades, start }: { trades: Trade[]; start: number }) {
  const [xm, setXm] = useXMode();
  const s = computeStats(trades, start, useJournalFlows());
  const rate = (q: number) =>
    q < 1.6
      ? "Poor"
      : q < 2
        ? "Below average"
        : q < 2.5
          ? "Average"
          : q < 3
            ? "Good"
            : q < 5
              ? "Excellent"
              : "Superb";
  const rating = rate(s.sqn);
  const bySetup = [...groupBy(trades, (t) => t.setup || "No setup").entries()]
    .map(([k, ts]) => {
      const rs = ts.map((t) => t.r).filter((v): v is number => v != null);
      const avg = rs.length ? rs.reduce((a, x) => a + x, 0) / rs.length : 0;
      return { k, n: rs.length, avg, sqn: sqnOf(rs) };
    })
    .sort((a, b) => b.sqn - a.sqn);
  const roll = sorted(trades).map((_, i, arr) => {
    const w = arr
      .slice(Math.max(0, i - 29), i + 1)
      .map((t) => t.r)
      .filter((v): v is number => v != null);
    return { x: i + 1, t: tradeTime(arr[i]!), v: w.length > 2 ? +sqnOf(w).toFixed(2) : 0 };
  });
  return (
    <div className="space-y-4">
      <ChartCard
        controls={<XModeSelect value={xm} onChange={setXm} />}
        legend={<Dot c="bg-chart-5">Rolling SQN (30 trades)</Dot>}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={roll} margin={{ top: 8, right: 8, left: 4, bottom: 18 }}>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis
              tick={axis}
              tickLine={false}
              axisLine={false}
              {...xAxisProps(xm, roll.length ? Math.max(...roll.map((r) => r.x)) : 1)}
              label={{ value: xAxisLabel(xm), position: "insideBottom", offset: -12, style: axis }}
            />
            <YAxis
              tick={axis}
              tickLine={false}
              axisLine={false}
              width={50}
              {...yScale(roll.map((r) => r.v))}
              label={{
                value: "SQN",
                angle: -90,
                position: "insideLeft",
                style: { ...axis, textAnchor: "middle" },
              }}
            />
            <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
            <Tooltip
              contentStyle={{
                background: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelFormatter={(l, pl) =>
                pointTitle(xm, {
                  x: (pl?.[0]?.payload as { x?: number } | undefined)?.x ?? Number(l),
                  t: xm === "date" ? Number(l) : undefined,
                })
              }
            />
            <Line
              type="monotone"
              dataKey="v"
              name="SQN"
              stroke="var(--color-chart-5)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats>
        <AccentStat label="SQN" value={fmtNum(s.sqn)} />
        <AccentStat label="Rating" value={rating} />
        <AccentStat label="Trades" value={s.count} />
        <AccentStat label="Avg. R" value={`${fmtNum(s.avgR)}R`} />
      </Stats>
      <section className="rounded-xl border bg-card">
        <h3 className="border-b px-4 py-3 text-sm font-semibold">SQN by Setup</h3>
        <table className="w-full text-sm tabular">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              {["Setup", "Trades", "Avg. R", "SQN", "Rating"].map((h) => (
                <th key={h} className="px-4 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bySetup.map((g) => (
              <tr key={g.k} className="border-b last:border-0">
                <td className="px-4 py-2">{g.k}</td>
                <td className="px-4 py-2">{g.n}</td>
                <td className="px-4 py-2">{fmtNum(g.avg)}R</td>
                <td
                  className={cn(
                    "px-4 py-2 font-semibold",
                    g.sqn < 0 ? "text-loss" : g.sqn >= 2 ? "text-profit" : "",
                  )}
                >
                  {g.n > 1 ? fmtNum(g.sqn) : "–"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {g.n > 1 ? rate(g.sqn) : "Need 2+ trades with R"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
