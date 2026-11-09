import {
  Area as RArea,
  Line as RLine,
  ReferenceLine as RRef,
  ComposedChart as RComposed,
} from "recharts";
import { useId } from "react";
import { Bar, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { axis } from "@/components/kit";

export type EquityPoint = {
  x: number | string;
  v: number;
  v2?: number;
  ma20?: number;
  ma50?: number;
  tilt?: number;
  label?: string;
  id?: string;
};

/** Tooltip for the equity chart: the value (and optional second value) at the hovered point. */
function EquityTip({
  active,
  payload,
  baseline,
  valueName,
  value2Name,
  fmt,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  baseline: number;
  valueName: string;
  value2Name?: string;
  fmt: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload as EquityPoint;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{p.label ?? `Trade #${p.x}`}</p>
      <p className="flex items-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", p.v >= baseline ? "bg-profit" : "bg-loss")} />
        {valueName}: <b className="tabular">{fmt(p.v)}</b>
      </p>
      {p.v2 !== undefined && value2Name && (
        <p className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-chart-4" />
          {value2Name}: <b className="tabular">{fmt(p.v2)}</b>
        </p>
      )}
    </div>
  );
}

export function EquityChart({
  data,
  height = 280,
  xLabel,
  yLabel,
  compact,
  valueName = "Return ($)",
  value2Name,
  fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 }),
  showTilt,
  baseline = 0,
  onPointClick,
  xMode = "trade",
}: {
  data: EquityPoint[];
  height?: number | `${number}%`;
  xLabel?: string;
  yLabel?: string;
  compact?: boolean;
  valueName?: string;
  value2Name?: string;
  fmt?: (n: number) => string;
  showTilt?: boolean;
  baseline?: number;
  onPointClick?: (p: EquityPoint) => void;
  /** "date": every point's x is a timestamp (ms) and the axis is a real time axis; "trade": x is the running trade number. */
  xMode?: "trade" | "date";
}) {
  const id = useId().replace(/:/g, "");
  const vals = data.flatMap((d) => [d.v, d.v2 ?? d.v]);
  const max = Math.max(baseline, ...vals);
  const min = Math.min(baseline, ...vals);
  const dateMode = xMode === "date";
  const pts =
    !dateMode && data.length && data[0].x !== 0
      ? [
          { x: 0, v: baseline, v2: data[0].v2 !== undefined ? baseline : undefined } as EquityPoint,
          ...data,
        ]
      : data;
  const span = Math.max(1, max - min);
  // More scale marks than before (audit): ~10 intervals on big charts, ~7 on the compact Home chart.
  const raw = span / (compact ? 7 : 10);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(+t.toFixed(6));
  // Colour split. A gradient with objectBoundingBox units is stretched over the *drawn path*, not over
  // the axis, so the split must be computed from each path's own extent:
  //  - the line spans the data's min..max,
  //  - the fill also reaches the baseline.
  // Red is therefore only used below the starting balance.
  const dMin = pts.length ? Math.min(...pts.map((p) => p.v)) : baseline,
    dMax = pts.length ? Math.max(...pts.map((p) => p.v)) : baseline;
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const offLine =
    dMax === dMin ? (dMax >= baseline ? 1 : 0) : clamp01((dMax - baseline) / (dMax - dMin));
  const fMin = Math.min(dMin, baseline),
    fMax = Math.max(dMax, baseline);
  const offFill = fMax === fMin ? 1 : clamp01((fMax - baseline) / (fMax - fMin));
  // At a split of 0 or 1 one colour owns the whole gradient; keeping the second colour's stops would paint a stray band at the edge.
  const fillOnly = offFill >= 1 ? "up" : offFill <= 0 ? "down" : null;
  const lineOnly = offLine >= 1 ? "up" : offLine <= 0 ? "down" : null;
  const tickFmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const numericX = !dateMode && pts.length > 1 && typeof pts[0]!.x === "number";
  const xMax = numericX ? Math.max(...pts.map((p) => Number(p.x))) : 0;
  const xStep = numericX
    ? ([1, 2, 5, 6, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((st) => xMax / st <= 18) ?? 1000)
    : 1;
  const xTicks =
    numericX && !compact
      ? Array.from({ length: Math.floor(xMax / xStep) + 1 }, (_, i) => i * xStep)
      : undefined;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RComposed
        data={pts}
        margin={{
          top: 8,
          right: compact ? 4 : 12,
          left: compact ? -12 : 4,
          bottom: xLabel ? 18 : 0,
        }}
        className={onPointClick ? "cursor-pointer" : undefined}
        onClick={
          onPointClick
            ? (e: { activeIndex?: number | string | null }) => {
                const p = pts[Number(e?.activeIndex)];
                if (p?.id) onPointClick(p);
              }
            : undefined
        }
      >
        <defs>
          <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
            {fillOnly === "up" ? (
              <>
                <stop offset={0} stopColor="var(--color-chart-1)" stopOpacity={0.6} />
                <stop offset={1} stopColor="var(--color-chart-1)" stopOpacity={0.04} />
              </>
            ) : fillOnly === "down" ? (
              <>
                <stop offset={0} stopColor="var(--color-chart-2)" stopOpacity={0.04} />
                <stop offset={1} stopColor="var(--color-chart-2)" stopOpacity={0.6} />
              </>
            ) : (
              <>
                <stop offset={0} stopColor="var(--color-chart-1)" stopOpacity={0.6} />
                <stop offset={offFill} stopColor="var(--color-chart-1)" stopOpacity={0.04} />
                <stop offset={offFill} stopColor="var(--color-chart-2)" stopOpacity={0.04} />
                <stop offset={1} stopColor="var(--color-chart-2)" stopOpacity={0.6} />
              </>
            )}
          </linearGradient>
          <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
            {lineOnly ? (
              <>
                <stop
                  offset={0}
                  stopColor={lineOnly === "up" ? "var(--color-chart-1)" : "var(--color-chart-2)"}
                />
                <stop
                  offset={1}
                  stopColor={lineOnly === "up" ? "var(--color-chart-1)" : "var(--color-chart-2)"}
                />
              </>
            ) : (
              <>
                <stop offset={offLine} stopColor="var(--color-chart-1)" />
                <stop offset={offLine} stopColor="var(--color-chart-2)" />
              </>
            )}
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--color-grid)" />
        <XAxis
          dataKey="x"
          hide={compact}
          type={xTicks || dateMode ? "number" : "category"}
          scale={dateMode ? "time" : undefined}
          domain={dateMode ? ["dataMin", "dataMax"] : xTicks ? [0, "dataMax"] : undefined}
          ticks={xTicks}
          tickFormatter={
            dateMode
              ? (n: number) =>
                  new Date(n).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "2-digit",
                  })
              : undefined
          }
          tick={axis}
          tickLine={false}
          axisLine={{ stroke: "var(--color-border)" }}
          minTickGap={compact ? 20 : 40}
          label={
            xLabel
              ? { value: xLabel, position: "insideBottom", offset: -12, style: axis }
              : undefined
          }
        />
        <YAxis
          yAxisId="eq"
          tick={axis}
          tickLine={false}
          axisLine={{ stroke: "var(--color-border)" }}
          width={compact ? 48 : 58}
          tickFormatter={tickFmt}
          domain={[lo, hi]}
          ticks={ticks}
          interval={0}
          label={
            yLabel
              ? {
                  value: yLabel,
                  angle: -90,
                  position: "insideLeft",
                  offset: 6,
                  style: { ...axis, textAnchor: "middle" },
                }
              : undefined
          }
        />
        {showTilt && <YAxis yAxisId="t" orientation="right" hide domain={[-4, 4]} />}
        <RRef
          yAxisId="eq"
          y={baseline}
          stroke="var(--color-muted-foreground)"
          strokeOpacity={0.6}
        />
        <Tooltip
          cursor={{ stroke: "var(--color-border)" }}
          content={
            <EquityTip
              baseline={baseline}
              valueName={valueName}
              value2Name={value2Name}
              fmt={fmt}
            />
          }
        />
        {showTilt && (
          <Bar yAxisId="t" dataKey="tilt" barSize={3}>
            {pts.map((d, i) => (
              <Cell
                key={i}
                fill={(d.tilt ?? 0) >= 0 ? "var(--color-chart-1)" : "var(--color-chart-2)"}
                fillOpacity={0.5}
              />
            ))}
          </Bar>
        )}
        <RArea
          yAxisId="eq"
          baseValue={baseline}
          type="monotone"
          dataKey="v"
          stroke={`url(#s${id})`}
          strokeWidth={compact ? 1.5 : 2}
          fill={`url(#f${id})`}
          dot={false}
          activeDot={{ r: 4, fill: "var(--color-chart-1)", stroke: "var(--color-card)" }}
          isAnimationActive={false}
        />
        {pts.some((p) => p.v2 !== undefined) && (
          <RLine
            yAxisId="eq"
            type="monotone"
            dataKey="v2"
            stroke="var(--color-chart-4)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        )}
        {pts.some((p) => p.ma20 !== undefined) && (
          <RLine
            yAxisId="eq"
            type="monotone"
            dataKey="ma20"
            stroke="var(--color-chart-5)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        )}
        {pts.some((p) => p.ma50 !== undefined) && (
          <RLine
            yAxisId="eq"
            type="monotone"
            dataKey="ma50"
            stroke="var(--color-chart-3)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        )}
      </RComposed>
    </ResponsiveContainer>
  );
}
