import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtNum, isWin, type Trade } from "@/lib/pnl/metrics";
import { AccentStat, axis, pctScale } from "@/components/kit";
import {
  XModeSelect,
  pointTitle,
  tradeTime,
  useXMode,
  xAxisLabel,
  xAxisProps,
} from "@/components/analytics/x-axis";
import { ChartCard, Dot, Stats, sorted } from "@/components/chart-lab/chart-kit";

export function WinRate({ trades }: { trades: Trade[] }) {
  const [xm, setXm] = useXMode();
  const s = sorted(trades);
  const d = s.map((_, i) => {
    const w = s.slice(Math.max(0, i - 19), i + 1);
    return {
      x: i + 1,
      t: tradeTime(s[i]!),
      rolling: +((w.filter(isWin).length / w.length) * 100).toFixed(1),
      overall: +((s.slice(0, i + 1).filter(isWin).length / (i + 1)) * 100).toFixed(1),
    };
  });
  const last = d[d.length - 1];
  return (
    <div className="space-y-4">
      <ChartCard
        controls={<XModeSelect value={xm} onChange={setXm} />}
        legend={
          <>
            <Dot c="bg-profit">Winrate</Dot>
            <Dot c="bg-chart-5">Rolling (20)</Dot>
          </>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={d} margin={{ top: 8, right: 8, left: 4, bottom: 18 }}>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis
              tick={axis}
              tickLine={false}
              axisLine={false}
              {...xAxisProps(xm, d.length ? Math.max(...d.map((p) => p.x)) : 1)}
              label={{ value: xAxisLabel(xm), position: "insideBottom", offset: -12, style: axis }}
            />
            <YAxis
              tick={axis}
              tickLine={false}
              axisLine={false}
              width={50}
              {...pctScale}
              label={{
                value: "Winrate (%)",
                angle: -90,
                position: "insideLeft",
                style: { ...axis, textAnchor: "middle" },
              }}
            />
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
              dataKey="overall"
              name="Winrate"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="rolling"
              name="Rolling (20)"
              stroke="var(--color-chart-5)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats>
        <AccentStat label="Current Winrate" value={`${fmtNum(last?.overall ?? 0)}%`} />
        <AccentStat label="Rolling (20)" value={`${fmtNum(last?.rolling ?? 0)}%`} />
        <AccentStat
          label="Best Rolling"
          value={`${fmtNum(Math.max(0, ...d.map((x) => x.rolling)))}%`}
        />
        <AccentStat
          label="Worst Rolling"
          value={`${fmtNum(Math.min(100, ...d.map((x) => x.rolling)))}%`}
        />
      </Stats>
    </div>
  );
}
