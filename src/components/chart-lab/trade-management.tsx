import { useMemo } from "react";
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
import { useTradeDrawer } from "@/components/journal/TradeDrawer";
import { fmtNum, potentialR, type Trade } from "@/lib/pnl/metrics";
import { AccentStat, Empty, axis, seriesValues, yScale } from "@/components/kit";
import {
  XModeSelect,
  pointTitle,
  tradeTime,
  useXMode,
  xAxisLabel,
  xAxisProps,
} from "@/components/analytics/x-axis";
import { ChartCard, Dot, Stats, Tip, sorted } from "@/components/chart-lab/chart-kit";

export function TradeManagement({ trades }: { trades: Trade[] }) {
  const drawer = useTradeDrawer();
  const [xm, setXm] = useXMode();
  const rows = useMemo(
    () =>
      sorted(trades)
        .map((t) => ({ t, a: t.r, p: potentialR(t) }))
        .filter((x): x is { t: Trade; a: number; p: number } => x.a != null && x.p != null),
    [trades],
  );
  if (!rows.length)
    return (
      <Empty>
        Add a stop loss and take profit to your trades (plus whether the target was hit, or the high
        / low price) to see trade management.
      </Empty>
    );
  let A = 0,
    P = 0;
  const data = rows.map(({ t, a, p }, i) => {
    A += a;
    P += p;
    return {
      x: i + 1,
      t: tradeTime(t),
      actual: +A.toFixed(2),
      potential: +P.toFixed(2),
      effect: +(A - P).toFixed(2),
      trade: t,
    };
  });
  const managed = rows.filter((r) => Math.abs(r.a - r.p) > 1e-6);
  const good = managed.filter((r) => r.a > r.p).length;
  const last = data[data.length - 1];
  return (
    <div className="space-y-4">
      <ChartCard
        controls={<XModeSelect value={xm} onChange={setXm} />}
        legend={
          <>
            <Dot c="bg-chart-5">Actual R</Dot>
            <Dot c="bg-profit">R gained by managing</Dot>
            <Dot c="bg-muted-foreground">Potential R</Dot>
          </>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: 4, bottom: 18 }}
            className="cursor-pointer"
            onClick={(e: { activeIndex?: number | string | null }) => {
              const d = data[Number(e?.activeIndex)];
              if (d) drawer.open(d.trade);
            }}
          >
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
              width={50}
              {...yScale(
                seriesValues(data as unknown as Record<string, unknown>[], [
                  "actual",
                  "potential",
                  "effect",
                ]),
              )}
              label={{
                value: "R Multiple",
                angle: -90,
                position: "insideLeft",
                style: { ...axis, textAnchor: "middle" },
              }}
            />
            <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <Tip
                    title={pointTitle(xm, d)}
                    lines={[
                      ["Actual", `${fmtNum(d.actual)}R`],
                      ["Potential", `${fmtNum(d.potential)}R`],
                      ["Managing effect", `${fmtNum(d.effect)}R`],
                    ]}
                  />
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="var(--color-chart-5)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="effect"
              stroke="var(--color-chart-1)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="potential"
              stroke="var(--color-muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats>
        <AccentStat label="Actual R" value={`${fmtNum(last.actual)}R`} />
        <AccentStat label="Potential R" value={`${fmtNum(last.potential)}R`} />
        <AccentStat label="R gained by managing" value={`${fmtNum(last.effect)}R`} />
        <AccentStat
          label="Managed correctly"
          value={`${fmtNum(managed.length ? (good / managed.length) * 100 : 0)}%`}
        />
        <AccentStat
          label="Managed incorrectly"
          value={`${fmtNum(managed.length ? ((managed.length - good) / managed.length) * 100 : 0)}%`}
        />
      </Stats>
    </div>
  );
}
