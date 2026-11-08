import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney, isLoss, isWin, type Trade } from "@/lib/pnl/metrics";
import { axis, yScale } from "@/components/kit";
import { ChartCard, Select, sorted, tickFmt, PointTip } from "@/components/chart-lab/chart-kit";

/* ---------------- individual charts ---------------- */
export function Consecutive({
  trades,
  cur,
  start,
}: {
  trades: Trade[];
  cur: string;
  start: number;
}) {
  const [kind, setKind] = useState<"Winners" | "Losers">("Winners");
  const [avg, setAvg] = useState<"Return ($)" | "Return (%)" | "Frequency">("Return ($)");
  const data = useMemo(() => {
    const runs: Trade[][] = [];
    let run: Trade[] = [];
    sorted(trades).forEach((t) => {
      const hit = kind === "Winners" ? isWin(t) : isLoss(t);
      if (hit) run.push(t);
      else {
        if (run.length) runs.push(run);
        run = [];
      }
    });
    if (run.length) runs.push(run);
    return [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((len) => {
      const rs = runs.filter((r) => (len === 11 ? r.length > 10 : r.length === len));
      const avgRet = rs.length
        ? rs.reduce((a, r) => a + r.reduce((s, t) => s + t.net_pnl, 0), 0) / rs.length
        : 0;
      const v =
        avg === "Frequency"
          ? rs.length
          : avg === "Return (%)"
            ? start
              ? (avgRet / start) * 100
              : 0
            : avgRet;
      return { k: len === 11 ? "> 10" : String(len), v: +v.toFixed(2), n: rs.length };
    });
  }, [trades, kind, avg, start]);
  return (
    <ChartCard
      size="full"
      controls={
        <>
          <Select
            label="Consecutive"
            value={kind}
            options={["Winners", "Losers"] as const}
            onChange={setKind}
          />
          <Select
            label="Average"
            value={avg}
            options={["Return ($)", "Return (%)", "Frequency"] as const}
            onChange={setAvg}
          />
        </>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 18 }}>
          <CartesianGrid vertical={false} stroke="var(--color-grid)" />
          <XAxis
            dataKey="k"
            tick={axis}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
            label={{
              value: `Consecutive ${kind}`,
              position: "insideBottom",
              offset: -12,
              style: axis,
            }}
          />
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            width={58}
            tickFormatter={tickFmt}
            {...yScale(
              data.map((d) => d.v),
              { integer: avg === "Frequency" },
            )}
            label={{
              value: avg === "Frequency" ? "Frequency" : `Average ${avg}`,
              angle: -90,
              position: "insideLeft",
              style: { ...axis, textAnchor: "middle" },
            }}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
            content={
              <PointTip<{ k: string; v: number; n: number }>
                describe={(p) => ({
                  title: `Consecutive ${kind}: ${p.k}`,
                  lines: [
                    [
                      avg,
                      avg === "Frequency"
                        ? String(p.v)
                        : avg === "Return ($)"
                          ? fmtMoney(p.v, cur)
                          : `${p.v}%`,
                    ],
                    ["Frequency", String(p.n)],
                  ],
                })}
              />
            }
          />
          <Bar
            dataKey="v"
            fill={kind === "Winners" ? "var(--color-chart-1)" : "var(--color-chart-2)"}
            maxBarSize={120}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
