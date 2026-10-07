import { Area as RArea, AreaChart as RAreaChart, Line as RLine, ReferenceLine as RRef, ComposedChart as RComposed } from "recharts";
import { useId } from "react";
import type { ReactNode, Ref } from "react";
import { Info } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

export function Panel({ title, action, children, className, sectionRef }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; sectionRef?: Ref<HTMLElement> }) {
  return (
    <section ref={sectionRef} className={cn("rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div className="flex h-[44px] items-center justify-between text-[12px]">
      <span className="text-t2">{label}</span>
      <span className={cn("tabular font-semibold text-t1", tone === "pos" && "text-profit", tone === "neg" && "text-loss")}>{value}</span>
    </div>
  );
}

export const pnlTone = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : undefined);
export const pnlText = (v: number) => (v > 0 ? "text-profit" : v < 0 ? "text-loss" : "");

export const axis = { fontSize: 10, fill: "var(--color-t4)" };
export const tooltipStyle = { contentStyle: { background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 } };

/** Round-number ticks (1 / 2 / 2.5 / 5 x 10^n) that always include 0, like the reference charts. */
export function niceTicks(min: number, max: number, count = 6) {
  const lo0 = Math.min(0, min), hi0 = Math.max(0, max);
  const raw = Math.max(1e-9, (hi0 - lo0) / count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? 10 * mag;
  const lo = Math.floor(lo0 / step) * step, hi = Math.ceil(hi0 / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(+t.toFixed(6));
  return { ticks, lo, hi };
}
/** Axis label: whole numbers as-is, fractional marks (2,5 / 7,5) keep their decimals instead of being rounded. */
export const deNum = (n: number) => (Math.abs(n) >= 100000 ? `${(n / 1000).toFixed(0)}k` : n.toLocaleString("de-DE", { maximumFractionDigits: 2 }));

/** Props for a numeric Y axis with round scale marks (e.g. 0, 5, 10, 15) so a value like 12.34 is simply drawn between marks. */
export function yScale(values: (number | null | undefined)[], opts: { count?: number; integer?: boolean } = {}) {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const lo0 = v.length ? Math.min(0, ...v) : 0, hi0 = v.length ? Math.max(0, ...v) : 1;
  const { ticks, lo, hi } = niceTicks(lo0, hi0 === lo0 ? lo0 + 1 : hi0, opts.count ?? 8);
  let t = ticks;
  if (opts.integer) {
    const step = Math.max(1, Math.ceil((hi - lo) / (opts.count ?? 8)));
    const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((n) => n >= step) ?? step;
    const a = Math.floor(lo0 / nice) * nice, b = Math.ceil(Math.max(hi0, 1) / nice) * nice;
    t = []; for (let x = a; x <= b; x += nice) t.push(x);
    return { ticks: t, domain: [a, b] as [number, number], interval: 0 as const, allowDecimals: false };
  }
  return { ticks: t, domain: [lo, hi] as [number, number], interval: 0 as const };
}
/** Round scale marks for values that should NOT be forced to include zero (e.g. account balances). */
export function yFree(values: number[], count = 8) {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length) return { ticks: [0, 1], domain: [0, 1] as [number, number], interval: 0 as const };
  const min = Math.min(...v), max = Math.max(...v);
  const raw = Math.max(1e-9, (max - min || Math.abs(max) || 1) / count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(+t.toFixed(6));
  return { ticks, domain: [lo, hi] as [number, number], interval: 0 as const };
}
/** yFree() over every numeric column of the rows except the x key(s). */
export const yRange = (rows: Record<string, number>[], skip: string[] = ["i", "n"]) => yFree(rows.flatMap((r) => Object.entries(r).filter(([k]) => !skip.includes(k)).map(([, x]) => x)));
/** Same, for percentage axes that always run 0-100. */
export const pctScale = { ticks: [0, 20, 40, 60, 80, 100], domain: [0, 100] as [number, number], interval: 0 as const };
/** X axis for charts plotted per trade: numeric, starting at 0, with round marks (0, 10, 20 ...). */
export function tradeAxis(max: number, target = 18) {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => max / s <= target) ?? 1000;
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  return { type: "number" as const, domain: [0, Math.max(1, max)] as [number, number], ticks, interval: 0 as const, allowDecimals: false };
}
/** Collect the numeric values of the given series keys, for yScale(). */
export const seriesValues = (data: Record<string, unknown>[], keys: string[]) => data.flatMap((d) => keys.map((k) => d[k] as number));

export function PnlBars({ data, x, y = "pnl", height = 260, fmt, angle }: { data: Record<string, unknown>[]; x: string; y?: string; height?: number; fmt?: (n: number) => string; angle?: boolean }) {
  const tilt = angle ?? data.length > 6;
  const f = fmt ?? ((n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const vals = data.map((d) => Number(d[y]) || 0);
  const { ticks, lo, hi } = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 5);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="var(--color-grid)" />
        <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} interval={0} angle={tilt ? -45 : -15} textAnchor="end" height={tilt ? 58 : 42} tickMargin={6} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={42} ticks={ticks} domain={[lo, hi]} tickFormatter={deNum} interval={0} />
        <RRef y={0} stroke="var(--color-axis-line)" />
        <Tooltip cursor={{ fill: "rgba(90,186,80,0.08)" }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const d = payload[0].payload as Record<string, unknown>;
          const v = Number(d[y]);
          const has = (k: string) => typeof d[k] === "number";
          return (
            <div className="min-w-[150px] rounded-md bg-popover px-3 py-2 text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.15)]">
              <p className="mb-1 font-semibold">{String(d[x])}</p>
              <p className="mb-1.5 flex items-center justify-between gap-4"><span className={cn("h-2 w-2 rounded-full", v >= 0 ? "bg-profit" : "bg-loss")} /><b className="tabular">{f(v)}</b></p>
              {has("trades") && <p className="flex justify-between gap-4"><span>Number of trades:</span><b className="tabular">{String(d["trades"])}</b></p>}
              {has("wins") && <p className="flex justify-between gap-4"><span>Winners:</span><b className="tabular">{String(d["wins"])}</b></p>}
              {has("losses") && <p className="flex justify-between gap-4"><span>Losers:</span><b className="tabular">{String(d["losses"])}</b></p>}
              {has("be") && <p className="flex justify-between gap-4"><span>Break evens:</span><b className="tabular">{String(d["be"])}</b></p>}
            </div>
          );
        }} />
        <Bar dataKey={y} maxBarSize={30}>
          {data.map((d, i) => <Cell key={i} fill={Number(d[y]) >= 0 ? "var(--color-chart-1)" : "var(--color-chart-2)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TiltMeter({ value, className }: { value: number; className?: string }) {
  const w = Math.min(26, Math.round(Math.abs(value) * 9) + 4);
  return (
    <span className={cn("inline-flex h-[6px] w-[54px] items-center", className)}>
      <span className="flex h-full flex-1 justify-end">{value < 0 && <span className="h-full rounded-l-[1px] bg-chart-2" style={{ width: w }} />}</span>
      <span className={cn("w-[3px] rounded-[1px]", value === 0 ? "h-[8px] bg-t4" : "h-[8px] bg-t4")} />
      <span className="flex h-full flex-1">{value > 0 && <span className="h-full rounded-r-[1px] bg-chart-1" style={{ width: w }} />}</span>
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{children}</div>;
}

export function DataTable({ cols, rows }: { cols: { k: string; l: string; money?: boolean; pct?: boolean }[]; rows: Record<string, unknown>[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs text-muted-foreground">{cols.map((c) => <th key={c.k} className="py-2 pr-4 font-medium">{c.l}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {cols.map((c) => {
                const v = r[c.k];
                const n = typeof v === "number";
                return (
                  <td key={c.k} className={cn("py-2 pr-4 tabular", c.money && n && pnlText(v as number))}>
                    {n ? (c.pct ? `${v}%` : (v as number).toLocaleString(undefined, { maximumFractionDigits: 2 })) : String(v ?? "")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Equity chart: green above zero, red below, soft gradient fills (matches reference) ---------- */

export type EquityPoint = { x: number | string; v: number; v2?: number; ma20?: number; ma50?: number; tilt?: number; label?: string; id?: string };

export function EquityChart({
  data, height = 280, xLabel, yLabel, compact, valueName = "Return ($)", value2Name, fmt = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 }), showTilt, baseline = 0, onPointClick,
}: {
  data: EquityPoint[]; height?: number | `${number}%`; xLabel?: string; yLabel?: string; compact?: boolean; valueName?: string; value2Name?: string; fmt?: (n: number) => string; showTilt?: boolean; baseline?: number; onPointClick?: (p: EquityPoint) => void;
}) {
  const id = useId().replace(/:/g, "");
  const vals = data.flatMap((d) => [d.v, d.v2 ?? d.v]);
  const max = Math.max(baseline, ...vals);
  const min = Math.min(baseline, ...vals);
  const pts = data.length && data[0].x !== 0 ? [{ x: 0, v: baseline, v2: data[0].v2 !== undefined ? baseline : undefined } as EquityPoint, ...data] : data;
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
  const dMin = pts.length ? Math.min(...pts.map((p) => p.v)) : baseline, dMax = pts.length ? Math.max(...pts.map((p) => p.v)) : baseline;
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const offLine = dMax === dMin ? (dMax >= baseline ? 1 : 0) : clamp01((dMax - baseline) / (dMax - dMin));
  const fMin = Math.min(dMin, baseline), fMax = Math.max(dMax, baseline);
  const offFill = fMax === fMin ? 1 : clamp01((fMax - baseline) / (fMax - fMin));
  const tickFmt = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  const numericX = pts.length > 1 && typeof pts[0]!.x === "number";
  const xMax = numericX ? Math.max(...pts.map((p) => Number(p.x))) : 0;
  const xStep = numericX ? [1, 2, 5, 6, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((st) => xMax / st <= 18) ?? 1000 : 1;
  const xTicks = numericX && !compact ? Array.from({ length: Math.floor(xMax / xStep) + 1 }, (_, i) => i * xStep) : undefined;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RComposed data={pts} margin={{ top: 8, right: compact ? 4 : 12, left: compact ? -12 : 4, bottom: xLabel ? 18 : 0 }} className={onPointClick ? "cursor-pointer" : undefined} onClick={onPointClick ? (e: { activeIndex?: number | string | null }) => { const p = pts[Number(e?.activeIndex)]; if (p?.id) onPointClick(p); } : undefined}>
        <defs>
          <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor="var(--color-chart-1)" stopOpacity={0.6} />
            <stop offset={offFill} stopColor="var(--color-chart-1)" stopOpacity={0.04} />
            <stop offset={offFill} stopColor="var(--color-chart-2)" stopOpacity={0.04} />
            <stop offset={1} stopColor="var(--color-chart-2)" stopOpacity={0.6} />
          </linearGradient>
          <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={offLine} stopColor="var(--color-chart-1)" />
            <stop offset={offLine} stopColor="var(--color-chart-2)" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--color-grid)" />
        <XAxis dataKey="x" hide={compact} type={xTicks ? "number" : "category"} domain={xTicks ? [0, "dataMax"] : undefined} ticks={xTicks} tick={axis} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} minTickGap={compact ? 20 : 40}
          label={xLabel ? { value: xLabel, position: "insideBottom", offset: -12, style: axis } : undefined} />
        <YAxis yAxisId="eq" tick={axis} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} width={compact ? 48 : 58} tickFormatter={tickFmt}
          domain={[lo, hi]} ticks={ticks} interval={0}
          label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", offset: 6, style: { ...axis, textAnchor: "middle" } } : undefined} />
        {showTilt && <YAxis yAxisId="t" orientation="right" hide domain={[-4, 4]} />}
        <RRef yAxisId="eq" y={baseline} stroke="var(--color-muted-foreground)" strokeOpacity={0.6} />
        <Tooltip
          cursor={{ stroke: "var(--color-border)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as EquityPoint;
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="mb-1 font-semibold">{p.label ?? `Trade #${p.x}`}</p>
                <p className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", p.v >= baseline ? "bg-profit" : "bg-loss")} />{valueName}: <b className="tabular">{fmt(p.v)}</b></p>
                {p.v2 !== undefined && value2Name && <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-4" />{value2Name}: <b className="tabular">{fmt(p.v2)}</b></p>}
              </div>
            );
          }}
        />
        {showTilt && (
          <Bar yAxisId="t" dataKey="tilt" barSize={3}>
            {pts.map((d, i) => <Cell key={i} fill={(d.tilt ?? 0) >= 0 ? "var(--color-chart-1)" : "var(--color-chart-2)"} fillOpacity={0.5} />)}
          </Bar>
        )}
        <RArea yAxisId="eq" type="monotone" dataKey="v" stroke={`url(#s${id})`} strokeWidth={compact ? 1.5 : 2} fill={`url(#f${id})`} dot={false} activeDot={{ r: 4, fill: "var(--color-chart-1)", stroke: "var(--color-card)" }} isAnimationActive={false} />
        {pts.some((p) => p.v2 !== undefined) && <RLine yAxisId="eq" type="monotone" dataKey="v2" stroke="var(--color-chart-4)" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
        {pts.some((p) => p.ma20 !== undefined) && <RLine yAxisId="eq" type="monotone" dataKey="ma20" stroke="var(--color-chart-5)" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
        {pts.some((p) => p.ma50 !== undefined) && <RLine yAxisId="eq" type="monotone" dataKey="ma50" stroke="var(--color-chart-3)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />}
      </RComposed>
    </ResponsiveContainer>
  );
}

/** Cumulative net P&L per trade starting at 0 — the shape used by every equity graph. */
export function cumulative(trades: { net_pnl: number; entry_at: string; id?: string }[]): EquityPoint[] {
  let c = 0;
  return [...trades].sort((a, b) => a.entry_at.localeCompare(b.entry_at)).map((t, i) => {
    c += t.net_pnl;
    return { x: i + 1, v: +c.toFixed(2) };
  });
}

/** Spark line for KPI widgets */
export function Spark({ data, height = 40, width = 90, line }: { data: number[]; height?: number; width?: number; line?: boolean }) {
  const id = useId().replace(/:/g, "");
  const pts = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs><linearGradient id={`k${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset={0} stopColor="var(--color-chart-1)" stopOpacity={0.45} /><stop offset={1} stopColor="var(--color-chart-1)" stopOpacity={0} /></linearGradient></defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <RArea type="monotone" dataKey="v" stroke="var(--color-chart-1)" strokeWidth={1.5} fill={line ? "none" : `url(#k${id})`} dot={false} isAnimationActive={false} />
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Small stat card with coloured left accent bar (Equity Graph footer) */
/**
 * Row of stat tiles. A grid (not flex-wrap) so every tile has the same width and, when the window is
 * narrow or zoomed in, wrapped rows line up in the same columns instead of the last row stretching.
 */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid justify-start gap-[14px] [grid-template-columns:repeat(auto-fill,minmax(130px,150px))]", className)}>{children}</div>;
}

export function AccentStat({ label, value, tone, className, info }: { label: string; value: ReactNode; tone?: "pos" | "neg"; className?: string; info?: string }) {
  return (
    <div className={cn("relative min-w-0 rounded-md bg-card py-4 pl-5 pr-3 shadow-[0_1px_5px_rgba(60,40,90,0.07)]", className)}>
      <span className={cn("absolute bottom-2.5 left-2 top-2.5 w-[3px] rounded-full", "bg-chart-1")} />
      <p className="text-[10px] text-t2">{label}</p>
      <p className="mt-2.5 flex items-center gap-1.5 text-[13px] font-semibold tabular text-t1">{value}{info && <span title={info} aria-label={info}><Info className="h-3.5 w-3.5 font-normal" /></span>}</p>
    </div>
  );
}
