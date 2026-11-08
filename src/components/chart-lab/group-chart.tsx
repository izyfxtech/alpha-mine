import { compareKeys, pushTo } from "@/lib/group";
import { useDrillDown } from "@/lib/journal/drilldown";
import type { Filters } from "@/lib/journal/journal-context";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney, fmtNum, isWin, type Trade } from "@/lib/pnl/metrics";
import { AccentStat, Empty, axis, niceTicks } from "@/components/kit";
import {
  ChartCard,
  DISPLAY,
  Display,
  SORT,
  Select,
  Sort,
  Stats,
  Tip,
  fmtD,
  tickFmt,
  valueOf,
} from "@/components/chart-lab/chart-kit";

export function BarsBig({
  data,
  yLabel,
  fmt,
  extra,
  hideTicks,
  rotate,
  onBar,
}: {
  onBar?: (k: string) => void;
  data: { k: string; v: number; n?: number }[];
  yLabel: string;
  fmt: (v: number) => string;
  extra?: (d: { k: string; v: number; n?: number }) => [string, string][];
  hideTicks?: boolean;
  rotate?: boolean;
}) {
  const vals = data.map((d) => d.v);
  const { ticks, lo, hi } = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 8);
  const tilt = rotate ?? !!hideTicks;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: 4, bottom: 4 }}
        barCategoryGap={hideTicks ? "18%" : "22%"}
      >
        <CartesianGrid vertical={false} stroke="var(--color-grid)" />
        <XAxis
          dataKey="k"
          tick={axis}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={tilt ? -60 : 0}
          textAnchor={tilt ? "end" : "middle"}
          height={tilt ? 70 : 30}
          tickMargin={6}
          tickFormatter={(s: string) => (s.length > 12 && !tilt ? s.slice(0, 11) + "…" : s)}
        />
        <YAxis
          tick={axis}
          tickLine={false}
          axisLine={false}
          width={58}
          ticks={ticks}
          domain={[lo, hi]}
          interval={0}
          tickFormatter={tickFmt}
          label={{
            value: yLabel,
            angle: -90,
            position: "insideLeft",
            style: { ...axis, textAnchor: "middle" },
          }}
        />
        <ReferenceLine y={0} stroke="var(--color-axis-line)" />
        <Tooltip
          cursor={{ fill: "rgba(90,186,80,0.08)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <Tip
                title={(payload[0].payload as { k: string }).k}
                lines={[
                  [yLabel, fmt((payload[0].payload as { v: number }).v)],
                  ...(extra ? extra(payload[0].payload as never) : []),
                ]}
              />
            ) : null
          }
        />
        <Bar
          dataKey="v"
          maxBarSize={130}
          isAnimationActive={false}
          cursor={onBar ? "pointer" : undefined}
          onClick={
            onBar
              ? (d: unknown) =>
                  onBar(
                    (d as { payload?: { k?: string }; k?: string }).payload?.k ??
                      (d as { k: string }).k,
                  )
              : undefined
          }
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.v >= 0 ? "var(--color-chart-1)" : "var(--color-chart-2)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function GroupTable({
  rows,
  cur,
  onRow,
}: {
  rows: { k: string; ts: Trade[] }[];
  cur: string;
  onRow?: (k: string) => void;
}) {
  return (
    <section className="max-h-72 max-w-2xl overflow-auto rounded-xl border bg-card">
      <table className="w-full text-xs tabular">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b">
            {["", "Trades", "Winrate (%)", "Avg. P&L ($)", "Total Gain ($)"].map((h) => (
              <th key={h} className="px-3 py-2.5 text-right font-semibold first:text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ k, ts }) => {
            const sum = ts.reduce((a, t) => a + t.net_pnl, 0);
            return (
              <tr
                key={k}
                className={`border-b border-border/50 last:border-0${onRow ? " cursor-pointer hover:bg-muted/50" : ""}`}
                onClick={onRow ? () => onRow(k) : undefined}
              >
                <td className="px-3 py-2">{k}</td>
                <td className="px-3 py-2 text-right">{ts.length}</td>
                <td className="px-3 py-2 text-right">
                  {fmtNum((ts.filter(isWin).length / ts.length) * 100)}
                </td>
                <td className="px-3 py-2 text-right">{fmtNum(sum / ts.length)}</td>
                <td className="px-3 py-2 text-right">{fmtNum(sum)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <span className="sr-only">{cur}</span>
    </section>
  );
}

/** Performance by Setup / Instrument / Time / Day / Custom stats / Trade comments */
export function GroupChart({
  trades,
  start,
  cur,
  by,
  noun,
  order,
  extraControl,
  showTable = true,
  drill,
}: {
  drill?: (k: string) => Filters | null;
  trades: Trade[];
  start: number;
  cur: string;
  by: (t: Trade) => string[];
  noun: string;
  order?: string[];
  extraControl?: ReactNode;
  showTable?: boolean;
}) {
  const goDrill = useDrillDown();
  const click = drill
    ? (k: string) => {
        const p = drill(k);
        if (p) goDrill(p);
      }
    : undefined;
  const [display, setDisplay] = useState<Display>("Return ($)");
  const [sort, setSort] = useState<Sort>(order ? "By Name" : "By Value");
  const groups = useMemo(() => {
    const m = new Map<string, Trade[]>();
    trades.forEach((t) => by(t).forEach((k) => pushTo(m, k, t)));
    let rows = [...m.entries()].map(([k, ts]) => ({
      k,
      ts,
      v: +valueOf(ts, display, start).toFixed(2),
      n: ts.length,
    }));
    if (sort === "By Value") rows.sort((a, b) => b.v - a.v);
    else if (sort === "By Trades") rows.sort((a, b) => b.n - a.n);
    else
      rows.sort((a, b) =>
        order?.length ? order.indexOf(a.k) - order.indexOf(b.k) : compareKeys(a.k, b.k),
      );
    return rows;
  }, [trades, by, display, sort, start, order]);
  if (!groups.length) return <Empty>No data for this chart yet.</Empty>;
  const sums = groups.map((g) => ({
    k: g.k,
    sum: g.ts.reduce((a, t) => a + t.net_pnl, 0),
    avg: g.ts.reduce((a, t) => a + t.net_pnl, 0) / g.ts.length,
  }));
  const best = [...sums].sort((a, b) => b.sum - a.sum)[0],
    worst = [...sums].sort((a, b) => a.sum - b.sum)[0];
  const bestA = [...sums].sort((a, b) => b.avg - a.avg)[0],
    worstA = [...sums].sort((a, b) => a.avg - b.avg)[0];
  return (
    <div className="space-y-4">
      <ChartCard
        size="sm"
        controls={
          <>
            <Select label="Display" value={display} options={DISPLAY} onChange={setDisplay} />
            <Select label="Sort By" value={sort} options={SORT} onChange={setSort} />
            {extraControl}
          </>
        }
      >
        <BarsBig
          data={groups}
          yLabel={display}
          fmt={(v) => fmtD(display, v, cur)}
          extra={(d) => [["Number of trades", String(d.n)]]}
          onBar={click}
        />
      </ChartCard>
      {click && (
        <p className="text-xs text-muted-foreground">
          Click a bar{showTable ? " or row" : ""} to open those trades in the journal.
        </p>
      )}
      {showTable && <GroupTable rows={groups} cur={cur} onRow={click} />}
      <Stats>
        <AccentStat
          info={showTable ? undefined : `${noun} with the highest total return`}
          label={`Best ${noun} Sum`}
          value={fmtMoney(best.sum, cur)}
        />
        <AccentStat
          info={showTable ? undefined : `${noun} with the lowest total return`}
          label={`Worst ${noun} Sum`}
          value={fmtMoney(worst.sum, cur)}
        />
        <AccentStat
          info={showTable ? undefined : `${noun} with the highest average return`}
          label={`Best ${noun} Avg`}
          value={fmtMoney(bestA.avg, cur)}
        />
        <AccentStat
          info={showTable ? undefined : `${noun} with the lowest average return`}
          label={`Worst ${noun} Avg`}
          value={fmtMoney(worstA.avg, cur)}
        />
        {showTable && <AccentStat label={`Number of ${noun}s`} value={groups.length} />}
      </Stats>
    </div>
  );
}
