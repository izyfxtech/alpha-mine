import { Area as RArea, AreaChart as RAreaChart, Line as RLine, ReferenceLine as RRef, ComposedChart as RComposed } from "recharts";
import { useId } from "react";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { equityColorOffset } from "@/lib/journal-table-layout";

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="font-semibold">{title}</h3>
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
    <div className="flex items-center justify-between border-b py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular font-semibold", tone === "pos" && "text-profit", tone === "neg" && "text-loss")}>{value}</span>
    </div>
  );
}

export const pnlTone = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : undefined);
export const pnlText = (v: number) => (v > 0 ? "text-profit" : v < 0 ? "text-loss" : "");

export const axis = { fontSize: 11, fill: "var(--color-muted-foreground)" };
export const tooltipStyle = { contentStyle: { background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 } };

export function PnlBars({ data, x, y = "pnl", height = 260, fmt, angle }: { data: Record<string, unknown>[]; x: string; y?: string; height?: number; fmt?: (n: number) => string; angle?: boolean }) {
  const tilt = angle ?? data.length > 8;
  const f = fmt ?? ((n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} interval={0} angle={tilt ? -25 : 0} textAnchor={tilt ? "end" : "middle"} height={tilt ? 50 : 30} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={50} />
        <RRef y={0} stroke="var(--color-muted-foreground)" strokeOpacity={0.5} />
        <Tooltip cursor={{ fill: "var(--color-muted)" }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const d = payload[0].payload as Record<string, unknown>;
          const v = Number(d[y]);
          const has = (k: string) => typeof d[k] === "number";
          return (
            <div className="min-w-[150px] rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
              <p className="mb-1.5 font-semibold">{String(d[x])}</p>
              <p className="flex justify-between gap-4"><span className="text-muted-foreground">Return</span><b className={cn("tabular", v > 0 ? "text-profit" : v < 0 ? "text-loss" : "")}>{f(v)}</b></p>
              {has("trades") && <p className="flex justify-between gap-4"><span className="text-muted-foreground">No. of trades</span><b className="tabular">{String(d["trades"])}</b></p>}
              {has("wins") && <p className="flex justify-between gap-4"><span className="text-muted-foreground">Winners</span><b className="tabular text-profit">{String(d["wins"])}</b></p>}
              {has("losses") && <p className="flex justify-between gap-4"><span className="text-muted-foreground">Losers</span><b className="tabular text-loss">{String(d["losses"])}</b></p>}
              {has("be") && <p className="flex justify-between gap-4"><span className="text-muted-foreground">Break-evens</span><b className="tabular">{String(d["be"])}</b></p>}
            </div>
          );
        }} />
        <Bar dataKey={y} maxBarSize={48}>
          {data.map((d, i) => <Cell key={i} fill={Number(d[y]) >= 0 ? "var(--color-profit)" : "var(--color-loss)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TiltMeter({ value, className }: { value: number; className?: string }) {
  const w = Math.round(Math.abs(value) * 20) + 2;
  return (
    <span className={cn("inline-flex h-2 w-12 items-center", className)}>
      <span className="flex h-full flex-1 justify-end">{value < 0 && <span className="h-full rounded-l-sm bg-loss" style={{ width: w }} />}</span>
      <span className="h-3 w-px bg-foreground/60" />
      <span className="flex h-full flex-1">{value > 0 && <span className="h-full rounded-r-sm bg-profit" style={{ width: w }} />}</span>
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
  const raw = span / (compact ? 4 : 7);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(+t.toFixed(6));
  const off = equityColorOffset(lo, hi, baseline);
  const tickFmt = (n: number) => Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 1)}k` : Math.round(n).toLocaleString("de-DE");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RComposed data={pts} margin={{ top: 8, right: compact ? 4 : 12, left: compact ? -12 : 4, bottom: xLabel ? 18 : 0 }} className={onPointClick ? "cursor-pointer" : undefined} onClick={onPointClick ? (e: { activeIndex?: number | string | null }) => { const p = pts[Number(e?.activeIndex)]; if (p?.id) onPointClick(p); } : undefined}>
        <defs>
          <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor="var(--color-profit)" stopOpacity={0.6} />
            <stop offset={off} stopColor="var(--color-profit)" stopOpacity={0.04} />
            <stop offset={off} stopColor="var(--color-loss)" stopOpacity={0.04} />
            <stop offset={1} stopColor="var(--color-loss)" stopOpacity={0.6} />
          </linearGradient>
          <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={off} stopColor="var(--color-profit)" />
            <stop offset={off} stopColor="var(--color-loss)" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} minTickGap={compact ? 20 : 40}
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
            {pts.map((d, i) => <Cell key={i} fill={(d.tilt ?? 0) >= 0 ? "var(--color-profit)" : "var(--color-loss)"} fillOpacity={0.5} />)}
          </Bar>
        )}
        <RArea yAxisId="eq" type="monotone" dataKey="v" stroke={`url(#s${id})`} strokeWidth={compact ? 1.5 : 2} fill={`url(#f${id})`} dot={false} activeDot={{ r: 4, fill: "var(--color-profit)", stroke: "var(--color-card)" }} isAnimationActive={false} />
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
          <defs><linearGradient id={`k${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset={0} stopColor="var(--color-profit)" stopOpacity={0.45} /><stop offset={1} stopColor="var(--color-profit)" stopOpacity={0} /></linearGradient></defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <RArea type="monotone" dataKey="v" stroke="var(--color-profit)" strokeWidth={1.5} fill={line ? "none" : `url(#k${id})`} dot={false} isAnimationActive={false} />
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Small stat card with coloured left accent bar (Equity Graph footer) */
export function AccentStat({ label, value, tone }: { label: string; value: ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div className="relative min-w-[130px] flex-1 rounded-lg border bg-card py-3 pl-5 pr-3">
      <span className={cn("absolute bottom-2 left-2 top-2 w-1 rounded-full", tone === "neg" ? "bg-loss" : "bg-profit")} />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-base font-semibold tabular">{value}</p>
    </div>
  );
}
