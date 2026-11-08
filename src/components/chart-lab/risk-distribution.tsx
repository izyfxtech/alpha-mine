import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtNum, type Trade } from "@/lib/pnl/metrics";
import { AccentStat, axis, yScale } from "@/components/kit";
import { ChartCard, Select, Stats, Tip } from "@/components/chart-lab/chart-kit";

export function RiskDistribution({ trades, start }: { trades: Trade[]; start: number }) {
  const [display, setDisplay] = useState<"Return (%)" | "R Multiple (R)">("Return (%)");
  const step = display === "Return (%)" ? 0.25 : 0.5;
  const lim = display === "Return (%)" ? 10 : 10;
  const buckets: { k: string; lo: number; hi: number; n: number }[] = [
    { k: `< -${lim}`, lo: -Infinity, hi: -lim, n: 0 },
  ];
  for (let x = -lim; x < lim; x += step)
    buckets.push({ k: `${+x.toFixed(2)} to ${+(x + step).toFixed(2)}`, lo: x, hi: x + step, n: 0 });
  buckets.push({ k: `> ${lim}`, lo: lim, hi: Infinity, n: 0 });
  const vals = trades
    .map((t) => (display === "Return (%)" ? (start ? (t.net_pnl / start) * 100 : 0) : t.r))
    .filter((v): v is number => v != null);
  vals.forEach((v) => {
    const b = buckets.find((x) => v >= x.lo && v < x.hi);
    if (b) b.n++;
  });
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const suf = display === "Return (%)" ? "%" : "R";
  return (
    <div className="space-y-4">
      <ChartCard
        controls={
          <Select
            label="Display"
            value={display}
            options={["Return (%)", "R Multiple (R)"] as const}
            onChange={setDisplay}
          />
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 8, right: 8, left: 10, bottom: 30 }}>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis
              dataKey="k"
              tick={{ ...axis, fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-50}
              textAnchor="end"
              height={60}
              label={{
                value: display === "Return (%)" ? "Return, gain sum (%)" : "R Multiple",
                position: "insideBottom",
                offset: -24,
                style: axis,
              }}
            />
            <YAxis
              tick={axis}
              tickLine={false}
              axisLine={false}
              width={40}
              {...yScale(
                buckets.map((b) => b.n),
                { integer: true },
              )}
              label={{
                value: "Number of Trades",
                angle: -90,
                position: "insideLeft",
                style: { ...axis, textAnchor: "middle" },
              }}
            />
            <Tooltip
              cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <Tip
                    title={(payload[0].payload as { k: string }).k}
                    lines={[["Trades", String((payload[0].payload as { n: number }).n)]]}
                  />
                ) : null
              }
            />
            <Bar dataKey="n" isAnimationActive={false}>
              {buckets.map((b, i) => (
                <Cell key={i} fill={b.hi <= 0 ? "var(--color-chart-2)" : "var(--color-chart-1)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats>
        <AccentStat label={`Avg ${display}`} value={`${fmtNum(avg(vals))}${suf}`} />
        <AccentStat
          label={`Total ${display}`}
          value={`${fmtNum(vals.reduce((a, b) => a + b, 0))}${suf}`}
        />
        <AccentStat
          label={`Avg ${display} Winner`}
          value={`${fmtNum(avg(vals.filter((v) => v > 0)))}${suf}`}
        />
        <AccentStat
          label={`Avg ${display} Loser`}
          value={`${fmtNum(avg(vals.filter((v) => v < 0)))}${suf}`}
        />
      </Stats>
    </div>
  );
}
