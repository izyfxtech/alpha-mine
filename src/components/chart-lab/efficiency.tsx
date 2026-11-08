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
import { fmtNum, isLoss, isWin, type Trade } from "@/lib/pnl/metrics";
import { AccentStat, Empty, axis, pctScale } from "@/components/kit";
import {
  XModeSelect,
  pointTitle,
  tradeTime,
  useXMode,
  xAxisLabel,
  xAxisProps,
} from "@/components/analytics/x-axis";
import { ChartCard, Stats, sorted, PointTip } from "@/components/chart-lab/chart-kit";

export function Efficiency({ trades }: { trades: Trade[] }) {
  const drawer = useTradeDrawer();
  const [xm, setXm] = useXMode();
  // Only commented trades can be judged; the others are unknown and would inflate the line.
  const s = sorted(trades).filter((t) => t.comments.length > 0);
  const ordered = s;
  const mistake = (t: Trade, phase?: string) =>
    t.comments.some((c) => c.sentiment === "negative" && (!phase || c.phase === phase));
  let clean = 0;
  const data = s.map((t, i) => {
    if (!mistake(t)) clean++;
    return { x: i + 1, t: tradeTime(t), v: +((clean / (i + 1)) * 100).toFixed(2) };
  });
  if (!data.length)
    return <Empty>Add comments to your trades to see how often you follow your plan.</Empty>;
  const best = Math.max(...data.map((d) => d.v));
  let bestIdx = 0;
  data.forEach((d, i) => {
    if (d.v === best) bestIdx = i;
  });
  const pct = (f: (t: Trade) => boolean, ts = s) =>
    ts.length ? (ts.filter(f).length / ts.length) * 100 : 0;
  const rows = (["entry", "exit", "management"] as const).map((p) => ({
    k: p === "entry" ? "Entries" : p === "exit" ? "Exits" : "Management",
    m: pct((t) => mistake(t, p)),
    f: pct((t) => t.comments.some((c) => c.phase === p && c.sentiment === "positive")),
  }));
  return (
    <div className="space-y-4">
      <ChartCard size="md" controls={<XModeSelect value={xm} onChange={setXm} />}>
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
              <linearGradient id="effg" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor="var(--color-chart-1)" stopOpacity={0.75} />
                <stop offset={1} stopColor="var(--color-chart-1)" stopOpacity={0.05} />
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
              width={50}
              {...pctScale}
              label={{
                value: "Efficiency (%)",
                angle: -90,
                position: "insideLeft",
                style: { ...axis, textAnchor: "middle" },
              }}
            />
            <Tooltip
              content={
                <PointTip<{ x: number; t: number; v: number }>
                  describe={(p) => ({
                    title: pointTitle(xm, p),
                    lines: [["Efficiency", `${p.v}%`]],
                  })}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke="var(--color-chart-1)"
              strokeWidth={1.5}
              fill="url(#effg)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
      <section className="max-w-md rounded-xl border bg-card">
        <table className="w-full text-xs tabular">
          <thead>
            <tr className="border-b">
              {["", "Total Mistakes (%)", "Followed Trade Plan (%)"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-right font-semibold first:text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2">{r.k}</td>
                <td className="px-3 py-2 text-right">{fmtNum(r.m)}%</td>
                <td className="px-3 py-2 text-right">{fmtNum(r.f)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Stats>
        <AccentStat label="Best efficiency" value={`${fmtNum(best)}%`} />
        <AccentStat label="Trades since efficiency high" value={data.length - 1 - bestIdx} />
        <AccentStat label="Current Efficiency" value={`${fmtNum(data[data.length - 1].v)}%`} />
        <AccentStat label="Trades Without Mistake" value={`${fmtNum(pct((t) => !mistake(t)))}%`} />
        <AccentStat
          label="Winners With Mistake"
          value={`${fmtNum(pct((t) => mistake(t), s.filter(isWin)))}%`}
        />
        <AccentStat
          label="Losers With Mistake"
          value={`${fmtNum(pct((t) => mistake(t), s.filter(isLoss)))}%`}
        />
      </Stats>
    </div>
  );
}
