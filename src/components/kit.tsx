import { byEntry } from "@/lib/pnl/sort";
import type { ReactNode, Ref } from "react";
import { Info } from "lucide-react";
import type { EquityPoint } from "@/components/charts/equity-chart";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  action,
  children,
  className,
  sectionRef,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  sectionRef?: Ref<HTMLElement>;
}) {
  return (
    <section
      ref={sectionRef}
      className={cn(
        "rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]",
        className,
      )}
    >
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

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
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

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="flex h-[44px] items-center justify-between text-[12px]">
      <span className="text-t2">{label}</span>
      <span
        className={cn(
          "tabular font-semibold text-t1",
          tone === "pos" && "text-profit",
          tone === "neg" && "text-loss",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export const pnlTone = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : undefined);
export const pnlText = (v: number) => (v > 0 ? "text-profit" : v < 0 ? "text-loss" : "");

export const axis = { fontSize: 10, fill: "var(--color-t4)" };
export const tooltipStyle = {
  contentStyle: {
    background: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 12,
  },
};

/** Round-number ticks (1 / 2 / 2.5 / 5 x 10^n) that always include 0, like the reference charts. */
export function niceTicks(min: number, max: number, count = 6) {
  const lo0 = Math.min(0, min),
    hi0 = Math.max(0, max);
  const raw = Math.max(1e-9, (hi0 - lo0) / count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? 10 * mag;
  const lo = Math.floor(lo0 / step) * step,
    hi = Math.ceil(hi0 / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(+t.toFixed(6));
  return { ticks, lo, hi };
}
/** Axis label: whole numbers as-is, fractional marks (2,5 / 7,5) keep their decimals instead of being rounded. */

/** Props for a numeric Y axis with round scale marks (e.g. 0, 5, 10, 15) so a value like 12.34 is simply drawn between marks. */
export function yScale(
  values: (number | null | undefined)[],
  opts: { count?: number; integer?: boolean } = {},
) {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const lo0 = v.length ? Math.min(0, ...v) : 0,
    hi0 = v.length ? Math.max(0, ...v) : 1;
  const { ticks, lo, hi } = niceTicks(lo0, hi0 === lo0 ? lo0 + 1 : hi0, opts.count ?? 8);
  let t = ticks;
  if (opts.integer) {
    const step = Math.max(1, Math.ceil((hi - lo) / (opts.count ?? 8)));
    const nice =
      [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((n) => n >= step) ??
      step;
    const a = Math.floor(lo0 / nice) * nice,
      b = Math.ceil(Math.max(hi0, 1) / nice) * nice;
    t = [];
    for (let x = a; x <= b; x += nice) t.push(x);
    return {
      ticks: t,
      domain: [a, b] as [number, number],
      interval: 0 as const,
      allowDecimals: false,
    };
  }
  return { ticks: t, domain: [lo, hi] as [number, number], interval: 0 as const };
}
/** Round scale marks for values that should NOT be forced to include zero (e.g. account balances). */
function yFree(values: number[], count = 8) {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length) return { ticks: [0, 1], domain: [0, 1] as [number, number], interval: 0 as const };
  const min = Math.min(...v),
    max = Math.max(...v);
  const raw = Math.max(1e-9, (max - min || Math.abs(max) || 1) / count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step,
    hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(+t.toFixed(6));
  return { ticks, domain: [lo, hi] as [number, number], interval: 0 as const };
}
/** yFree() over every numeric column of the rows except the x key(s). */
export const yRange = (rows: Record<string, number>[], skip: string[] = ["i", "n"]) =>
  yFree(
    rows.flatMap((r) =>
      Object.entries(r)
        .filter(([k]) => !skip.includes(k))
        .map(([, x]) => x),
    ),
  );
/** Same, for percentage axes that always run 0-100. */
export const pctScale = {
  ticks: [0, 20, 40, 60, 80, 100],
  domain: [0, 100] as [number, number],
  interval: 0 as const,
};
/** X axis for charts plotted per trade: numeric, starting at 0, with round marks (0, 10, 20 ...). */
export function tradeAxis(max: number, target = 18) {
  const step =
    [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => max / s <= target) ?? 1000;
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  return {
    type: "number" as const,
    domain: [0, Math.max(1, max)] as [number, number],
    ticks,
    interval: 0 as const,
    allowDecimals: false,
  };
}
/** Collect the numeric values of the given series keys, for yScale(). */
export const seriesValues = (data: Record<string, unknown>[], keys: string[]) =>
  data.flatMap((d) => keys.map((k) => d[k] as number));

export function TiltMeter({ value, className }: { value: number; className?: string }) {
  const w = Math.min(26, Math.round(Math.abs(value) * 9) + 4);
  return (
    <span className={cn("inline-flex h-[6px] w-[54px] items-center", className)}>
      <span className="flex h-full flex-1 justify-end">
        {value < 0 && <span className="h-full rounded-l-[1px] bg-chart-2" style={{ width: w }} />}
      </span>
      <span
        className={cn("w-[3px] rounded-[1px]", value === 0 ? "h-[8px] bg-t4" : "h-[8px] bg-t4")}
      />
      <span className="flex h-full flex-1">
        {value > 0 && <span className="h-full rounded-r-[1px] bg-chart-1" style={{ width: w }} />}
      </span>
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function DataTable({
  cols,
  rows,
}: {
  cols: { k: string; l: string; money?: boolean; pct?: boolean }[];
  rows: Record<string, unknown>[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            {cols.map((c) => (
              <th key={c.k} className="py-2 pr-4 font-medium">
                {c.l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {cols.map((c) => {
                const v = r[c.k];
                const n = typeof v === "number";
                return (
                  <td
                    key={c.k}
                    className={cn("py-2 pr-4 tabular", c.money && n && pnlText(v as number))}
                  >
                    {n
                      ? c.pct
                        ? `${v}%`
                        : (v as number).toLocaleString(undefined, { maximumFractionDigits: 2 })
                      : String(v ?? "")}
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

/** Cumulative net P&L per trade starting at 0 — the shape used by every equity graph. */
export function cumulative(
  trades: { net_pnl: number; entry_at: string; id?: string }[],
): EquityPoint[] {
  let c = 0;
  return [...trades].sort(byEntry).map((t, i) => {
    c += t.net_pnl;
    return { x: i + 1, v: +c.toFixed(2) };
  });
}

/** Small stat card with coloured left accent bar (Equity Graph footer) */
/**
 * Row of stat tiles. A grid (not flex-wrap) so every tile has the same width and, when the window is
 * narrow or zoomed in, wrapped rows line up in the same columns instead of the last row stretching.
 */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid justify-start gap-[14px] [grid-template-columns:repeat(auto-fill,minmax(130px,150px))]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AccentStat({
  label,
  value,
  className,
  info,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  info?: string;
}) {
  return (
    <div
      className={cn(
        "relative min-w-0 rounded-md bg-card py-4 pl-5 pr-3 shadow-[0_1px_5px_rgba(60,40,90,0.07)]",
        className,
      )}
    >
      <span
        className={cn("absolute bottom-2.5 left-2 top-2.5 w-[3px] rounded-full", "bg-chart-1")}
      />
      <p className="text-xs text-t2">{label}</p>
      <p className="mt-2.5 flex items-center gap-1.5 text-[13px] font-semibold tabular text-t1">
        {value}
        {info && (
          <span title={info} aria-label={info}>
            <Info className="h-3.5 w-3.5 font-normal" />
          </span>
        )}
      </p>
    </div>
  );
}
