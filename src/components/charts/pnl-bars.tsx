import { ReferenceLine as RRef } from "recharts";
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
import { cn } from "@/lib/utils";
import { axis, niceTicks } from "@/components/kit";

/** Axis tick: whole thousands up to 100k, then 123k. en-US like every other figure in the app. */
const axisNum = (n: number) =>
  Math.abs(n) >= 100000
    ? `${(n / 1000).toFixed(0)}k`
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Tooltip for the PnL bar chart. Recharts passes `active` and `payload`; the rest says which fields to read and how to format. */
function PnlBarsTip({
  active,
  payload,
  x,
  y,
  f,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  x: string;
  y: string;
  f: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]!.payload as Record<string, unknown>;
  const v = Number(d[y]);
  const has = (k: string) => typeof d[k] === "number";
  return (
    <div className="min-w-[150px] rounded-md bg-popover px-3 py-2 text-xs shadow-[0_2px_10px_rgba(0,0,0,0.15)]">
      <p className="mb-1 font-semibold">{String(d[x])}</p>
      <p className="mb-1.5 flex items-center justify-between gap-4">
        <span className={cn("h-2 w-2 rounded-full", v >= 0 ? "bg-profit" : "bg-loss")} />
        <b className="tabular">{f(v)}</b>
      </p>
      {has("trades") && (
        <p className="flex justify-between gap-4">
          <span>Number of trades:</span>
          <b className="tabular">{String(d["trades"])}</b>
        </p>
      )}
      {has("wins") && (
        <p className="flex justify-between gap-4">
          <span>Winners:</span>
          <b className="tabular">{String(d["wins"])}</b>
        </p>
      )}
      {has("losses") && (
        <p className="flex justify-between gap-4">
          <span>Losers:</span>
          <b className="tabular">{String(d["losses"])}</b>
        </p>
      )}
      {has("be") && (
        <p className="flex justify-between gap-4">
          <span>Break evens:</span>
          <b className="tabular">{String(d["be"])}</b>
        </p>
      )}
    </div>
  );
}

export function PnlBars({
  data,
  x,
  y = "pnl",
  height = 260,
  fmt,
  angle,
}: {
  data: Record<string, unknown>[];
  x: string;
  y?: string;
  height?: number;
  fmt?: (n: number) => string;
  angle?: boolean;
}) {
  const tilt = angle ?? data.length > 6;
  const f = fmt ?? ((n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const vals = data.map((d) => Number(d[y]) || 0);
  const { ticks, lo, hi } = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 5);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="var(--color-grid)" />
        <XAxis
          dataKey={x}
          tick={axis}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={tilt ? -45 : -15}
          textAnchor="end"
          height={tilt ? 58 : 42}
          tickMargin={6}
        />
        <YAxis
          tick={axis}
          tickLine={false}
          axisLine={false}
          width={42}
          ticks={ticks}
          domain={[lo, hi]}
          tickFormatter={axisNum}
          interval={0}
        />
        <RRef y={0} stroke="var(--color-axis-line)" />
        <Tooltip
          cursor={{ fill: "rgba(90,186,80,0.08)" }}
          content={<PnlBarsTip x={x} y={y} f={f} />}
        />
        <Bar dataKey={y} maxBarSize={30}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={Number(d[y]) >= 0 ? "var(--color-chart-1)" : "var(--color-chart-2)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
