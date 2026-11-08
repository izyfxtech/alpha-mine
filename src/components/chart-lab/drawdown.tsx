import { cumulative } from "@/lib/numbers";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTradeDrawer } from "@/components/journal/TradeDrawer";
import { fmtMoney, type Trade } from "@/lib/pnl/metrics";
import { AccentStat, axis, yScale } from "@/components/kit";
import {
  XModeSelect,
  pointTitle,
  tradeTime,
  useXMode,
  xAxisLabel,
  xAxisProps,
} from "@/components/analytics/x-axis";
import { ChartCard, Select, Stats, Tip, sorted, tickFmt } from "@/components/chart-lab/chart-kit";

export function Drawdown({ trades, cur, start }: { trades: Trade[]; cur: string; start: number }) {
  const drawer = useTradeDrawer();
  const ordered = useMemo(() => sorted(trades), [trades]);
  const [display, setDisplay] = useState<"Return ($)" | "Return (%)">("Return ($)");
  const [xm, setXm] = useXMode();
  const { data, worst, avgDD, current, topBottom, bottomTop } = useMemo(() => {
    const ordered = sorted(trades);
    const equity = cumulative(ordered.map((t) => t.net_pnl));
    // The highest equity so far (never below the starting zero) and the trade where it was reached.
    const peaks: number[] = [];
    const peakIdxs: number[] = [];
    let peak = 0,
      peakIdx = 0;
    equity.forEach((eq, i) => {
      if (eq >= peak) {
        peak = eq;
        peakIdx = i;
      }
      peaks.push(peak);
      peakIdxs.push(peakIdx);
    });
    const pts = ordered.map((t, i) => {
      const dd = equity[i]! - peaks[i]!;
      return {
        x: i + 1,
        t: tradeTime(t),
        dd,
        ddPct: start + peaks[i]! ? (dd / (start + peaks[i]!)) * 100 : 0,
        peakIdx: peakIdxs[i]!,
      };
    });
    const min = pts.reduce(
      (m, p) => (p.dd < m.dd ? p : m),
      pts[0] ?? { dd: 0, x: 0, peakIdx: 0, ddPct: 0 },
    );
    const troughIdx = (min?.x ?? 1) - 1;
    const recover = pts.findIndex((p, i) => i > troughIdx && p.dd === 0);
    const negs = pts.filter((p) => p.dd < 0);
    return {
      data: pts.map((p) => ({
        x: p.x,
        t: p.t,
        v: +(display === "Return ($)" ? p.dd : p.ddPct).toFixed(2),
      })),
      worst: Math.abs(min?.dd ?? 0),
      avgDD: negs.length ? Math.abs(negs.reduce((a, p) => a + p.dd, 0) / negs.length) : 0,
      current: Math.abs(pts[pts.length - 1]?.dd ?? 0),
      topBottom: troughIdx - (min?.peakIdx ?? 0),
      bottomTop: recover > 0 ? recover - troughIdx : 0,
    };
  }, [trades, display, start]);
  return (
    <div className="space-y-4">
      <ChartCard
        size="full"
        controls={
          <>
            <Select
              label="Display"
              value={display}
              options={["Return ($)", "Return (%)"] as const}
              onChange={setDisplay}
            />
            <XModeSelect value={xm} onChange={setXm} />
          </>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: 4, bottom: 18 }}
            className="cursor-pointer"
            onClick={(e: { activeIndex?: number | string | null }) => {
              const t = ordered[Number(e?.activeIndex)];
              if (t) drawer.open(t);
            }}
          >
            <defs>
              <linearGradient id="ddg" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor="var(--color-chart-2)" stopOpacity={0.05} />
                <stop offset={1} stopColor="var(--color-chart-2)" stopOpacity={0.85} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis
              tick={axis}
              tickLine={false}
              axisLine={false}
              {...xAxisProps(xm, data.length)}
              label={{ value: xAxisLabel(xm), position: "insideBottom", offset: -12, style: axis }}
            />
            <YAxis
              tick={axis}
              tickLine={false}
              axisLine={false}
              width={58}
              tickFormatter={tickFmt}
              {...yScale(data.map((d) => d.v))}
              label={{
                value: `Drawdown (${display === "Return ($)" ? "$" : "%"})`,
                angle: -90,
                position: "insideLeft",
                style: { ...axis, textAnchor: "middle" },
              }}
            />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <Tip
                    title={pointTitle(xm, payload[0].payload as { x: number; t: number })}
                    lines={[
                      [
                        "Drawdown",
                        display === "Return ($)"
                          ? fmtMoney((payload[0].payload as { v: number }).v, cur)
                          : `${(payload[0].payload as { v: number }).v}%`,
                      ],
                    ]}
                  />
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke="var(--color-chart-2)"
              strokeWidth={1.5}
              fill="url(#ddg)"
              baseValue={0}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats>
        <AccentStat label="Worst Drawdown" value={fmtMoney(worst, cur)} />
        <AccentStat label="Average Drawdown" value={fmtMoney(avgDD, cur)} />
        <AccentStat label="Current Drawdown" value={fmtMoney(current, cur)} />
        <AccentStat label="Top to Bottom" value={topBottom} />
        <AccentStat label="Bottom to Top" value={bottomTop} />
      </Stats>
    </div>
  );
}
