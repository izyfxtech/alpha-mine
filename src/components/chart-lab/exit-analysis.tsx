import {
  Bar,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import { useTradeDrawer } from "@/components/journal/TradeDrawer";
import { fmtNum, isWin, type Trade } from "@/lib/pnl/metrics";
import { AccentStat, Empty, axis, niceTicks } from "@/components/kit";
import { ChartCard, Dot, Stats, sorted, PointTip } from "@/components/chart-lab/chart-kit";

/** The marker for a trade's exit point on the updraw/drawdown chart. */
function ExitDot({ cx, cy }: { cx?: number; cy?: number }) {
  return <circle cx={cx} cy={cy} r={2.5} fill="var(--color-foreground)" />;
}

export function ExitAnalysis({ trades }: { trades: Trade[] }) {
  const drawer = useTradeDrawer();
  const rows = sorted(trades).filter(
    (t) =>
      t.stop_loss != null &&
      t.take_profit != null &&
      t.high_price != null &&
      t.low_price != null &&
      t.exit_price != null,
  );
  if (!rows.length)
    return (
      <Empty>
        Add stop loss, take profit and the highest / lowest price during the trade (Advanced Data)
        to see exit analysis.
      </Empty>
    );
  const data = rows.slice(-30).map((t, i) => {
    const long = t.direction === "long";
    const tp = Math.abs(Number(t.take_profit) - t.entry_price) || 1;
    const sl = Math.abs(t.entry_price - Number(t.stop_loss)) || 1;
    const up = long ? Number(t.high_price) - t.entry_price : t.entry_price - Number(t.low_price);
    const dn = long ? t.entry_price - Number(t.low_price) : Number(t.high_price) - t.entry_price;
    const ex = long ? t.exit_price! - t.entry_price : t.entry_price - t.exit_price!;
    return {
      x: i + 1,
      up: +((Math.max(0, up) / tp) * 100).toFixed(1),
      dn: -+((Math.max(0, dn) / sl) * 100).toFixed(1),
      exit: +((ex >= 0 ? ex / tp : ex / sl) * 100).toFixed(1),
      win: isWin(t),
      trade: t,
    };
  });
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const W = data.filter((d) => d.win),
    L = data.filter((d) => !d.win);
  const yt = niceTicks(
    Math.min(-100, ...data.map((d) => Math.min(d.dn, d.exit))),
    Math.max(100, ...data.map((d) => Math.max(d.up, d.exit))),
    6,
  );
  return (
    <div className="space-y-4">
      <ChartCard
        size="full"
        legend={
          <>
            <Dot c="bg-profit">Updraw</Dot>
            <Dot c="bg-loss">Drawdown</Dot>
            {rows.length > 30 && (
              <span className="text-xs text-muted-foreground">Last 30 of {rows.length} trades</span>
            )}
          </>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            stackOffset="sign"
            margin={{ top: 8, right: 8, left: 4, bottom: 18 }}
            className="cursor-pointer"
            onClick={(e: { activeIndex?: number | string | null }) => {
              const d = data[Number(e?.activeIndex)];
              if (d) drawer.open(d.trade);
            }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis
              dataKey="x"
              tick={axis}
              tickLine={false}
              axisLine={false}
              label={{ value: "Trades", position: "insideBottom", offset: -12, style: axis }}
            />
            <YAxis
              tick={axis}
              tickLine={false}
              axisLine={false}
              width={50}
              ticks={yt.ticks}
              domain={[yt.lo, yt.hi]}
              interval={0}
              label={{
                value: "Updraw / Drawdown",
                angle: -90,
                position: "insideLeft",
                style: { ...axis, textAnchor: "middle" },
              }}
            />
            <ReferenceLine y={100} stroke="var(--color-chart-1)" />
            <ReferenceLine y={-100} stroke="var(--color-chart-2)" />
            <ReferenceLine y={0} stroke="var(--color-foreground)" />
            <Tooltip
              content={
                <PointTip<{ x: number; up: number; dn: number; exit: number }>
                  describe={(p) => ({
                    title: `Trade ${p.x}`,
                    lines: [
                      ["Updraw", `${p.up}%`],
                      ["Drawdown", `${p.dn}%`],
                      ["Exit", `${p.exit}%`],
                    ],
                  })}
                />
              }
            />
            <Bar dataKey="up" stackId="a" fill="var(--color-chart-1)" isAnimationActive={false} />
            <Bar dataKey="dn" stackId="a" fill="var(--color-chart-2)" isAnimationActive={false} />
            <Scatter
              dataKey="exit"
              fill="var(--color-foreground)"
              shape={ExitDot}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats>
        <AccentStat
          info="Share of trades whose price reached the take profit"
          label="Trades Hit TP"
          value={`${fmtNum((data.filter((d) => d.up >= 100).length / data.length) * 100)}%`}
        />
        <AccentStat
          info="Share of trades whose price reached the stop loss"
          label="Trades Hit SL"
          value={`${fmtNum((data.filter((d) => d.dn <= -100).length / data.length) * 100)}%`}
        />
        <AccentStat label="Avg. Updraw Winner" value={`${Math.round(avg(W.map((d) => d.up)))}%`} />
        <AccentStat label="Avg. Updraw Loser" value={`${Math.round(avg(L.map((d) => d.up)))}%`} />
        <AccentStat
          label="Avg. Drawdown Winner"
          value={`${Math.round(avg(W.map((d) => d.dn)))}%`}
        />
        <AccentStat label="Avg. Drawdown Loser" value={`${Math.round(avg(L.map((d) => d.dn)))}%`} />
        <AccentStat label="Avg. Exit Winner" value={`${fmtNum(avg(W.map((d) => d.exit)))}%`} />
        <AccentStat label="Avg. Exit Loser" value={`${fmtNum(avg(L.map((d) => d.exit)))}%`} />
      </Stats>
    </div>
  );
}
