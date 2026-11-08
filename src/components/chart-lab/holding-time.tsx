import { useState } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTradeDrawer } from "@/components/journal/TradeDrawer";
import { fmtMoney, fmtNum, type Trade } from "@/lib/pnl/metrics";
import { AccentStat, Empty, axis, niceTicks } from "@/components/kit";
import { ChartCard, Select, Stats, tickFmt, PointTip } from "@/components/chart-lab/chart-kit";

export function HoldingTime({ trades, cur }: { trades: Trade[]; cur: string }) {
  const drawer = useTradeDrawer();
  const [display, setDisplay] = useState<"Return ($)" | "Return (%)" | "R Multiple (R)">(
    "Return ($)",
  );
  const [unit, setUnit] = useState<"Minutes" | "Hours" | "Days">("Days");
  const div = unit === "Days" ? 1440 : unit === "Hours" ? 60 : 1;
  const pts = trades
    .filter(
      (t) =>
        t.holdMinutes != null &&
        (display === "Return ($)" || display === "Return (%)" || t.r != null),
    )
    .map((t, i) => ({
      x: +(t.holdMinutes! / div).toFixed(2),
      y: +(
        display === "Return ($)" ? t.net_pnl : display === "Return (%)" ? t.retPct : (t.r ?? 0)
      ).toFixed(2),
      id: i + 1,
      trade: t,
      exit: t.exit_at?.slice(0, 16).replace("T", " ") ?? "",
      win: t.net_pnl >= 0,
      pnl: t.net_pnl,
    }));
  if (!pts.length) return <Empty>Add exit dates to your trades to see holding time.</Empty>;
  const W = pts.filter((p) => p.win && p.pnl > 0),
    L = pts.filter((p) => p.pnl < 0);
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const big = (a: typeof pts, f: (a: number, b: number) => boolean) =>
    a.reduce<(typeof pts)[number] | null>((m, p) => (!m || f(p.pnl, m.pnl) ? p : m), null);
  const xt = niceTicks(0, Math.max(...pts.map((p) => p.x)), 15);
  const yt = niceTicks(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)), 6);
  return (
    <div className="space-y-4">
      <ChartCard
        size="lg"
        controls={
          <>
            <Select
              label="Display"
              value={display}
              options={["Return ($)", "Return (%)", "R Multiple (R)"] as const}
              onChange={setDisplay}
            />
            <Select
              label="Time Settings"
              value={unit}
              options={["Minutes", "Hours", "Days"] as const}
              onChange={setUnit}
            />
          </>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, left: 4, bottom: 18 }}>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis
              type="number"
              dataKey="x"
              ticks={xt.ticks}
              domain={[xt.lo, xt.hi]}
              interval={0}
              tick={axis}
              tickLine={false}
              axisLine={false}
              label={{ value: unit, position: "insideBottom", offset: -12, style: axis }}
            />
            <YAxis
              type="number"
              dataKey="y"
              ticks={yt.ticks}
              domain={[yt.lo, yt.hi]}
              interval={0}
              tick={axis}
              tickLine={false}
              axisLine={false}
              width={58}
              tickFormatter={tickFmt}
              label={{
                value: display,
                angle: -90,
                position: "insideLeft",
                style: { ...axis, textAnchor: "middle" },
              }}
            />
            <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
            <Tooltip
              content={
                <PointTip<(typeof pts)[number]>
                  describe={(p) => ({
                    title: `Trade #${p.id}`,
                    lines: [
                      ["Exit Date", p.exit],
                      ["Holding Time", `${p.x} ${unit.toLowerCase()}`],
                      ["Return", display === "Return ($)" ? fmtMoney(p.y, cur) : String(p.y)],
                    ],
                  })}
                />
              }
            />
            <Scatter
              data={pts}
              isAnimationActive={false}
              cursor="pointer"
              onClick={(d: { payload?: { trade?: Trade } }) =>
                d?.payload?.trade && drawer.open(d.payload.trade)
              }
            >
              {pts.map((p, i) => (
                <Cell key={i} fill={p.y >= 0 ? "var(--color-chart-1)" : "var(--color-chart-2)"} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>
      <Stats>
        <AccentStat
          label={`Winners Holding Time Avg (${unit})`}
          value={fmtNum(avg(W.map((p) => p.x)))}
        />
        <AccentStat
          label={`Losers Holding Time Avg (${unit})`}
          value={fmtNum(avg(L.map((p) => p.x)))}
        />
        <AccentStat
          label={`Winners Holding Time Sum (${unit})`}
          value={fmtNum(W.reduce((a, p) => a + p.x, 0))}
        />
        <AccentStat
          label={`Losers Holding Time Sum (${unit})`}
          value={fmtNum(L.reduce((a, p) => a + p.x, 0))}
        />
        <AccentStat
          info="Holding time of the trade with the biggest gain"
          label={`Biggest Winner (${unit})`}
          value={fmtNum(big(W, (a, b) => a > b)?.x ?? 0)}
        />
        <AccentStat
          info="Holding time of the trade with the biggest loss"
          label={`Biggest Loser (${unit})`}
          value={fmtNum(big(L, (a, b) => a < b)?.x ?? 0)}
        />
      </Stats>
    </div>
  );
}
