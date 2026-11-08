import { sortedByEntry } from "@/lib/pnl/sort";
import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { fmtMoney, fmtNum, isWin, type Trade } from "@/lib/pnl/metrics";
import { StatGrid } from "@/components/kit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/* ---------------- shared building blocks ---------------- */
export const tickFmt = (n: number) =>
  Math.round(n * 100) / 100 === Math.round(n)
    ? Math.round(n).toLocaleString("en-US")
    : n.toLocaleString("en-US");
export const sorted = sortedByEntry<Trade>;

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  width = "w-40",
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  width?: string;
}) {
  return (
    <div className="relative rounded-md border border-line2 bg-card px-3 pb-1.5 pt-3">
      <span className="absolute -top-2 left-2 bg-card px-1 text-xs text-t2">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn("flex items-center justify-between gap-2 text-sm", width)}
        >
          <span className="truncate">{value}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {options.map((o) => (
            <button
              key={o}
              onClick={() => onChange(o)}
              className={cn(
                "block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted",
                o === value && "bg-muted font-medium",
              )}
            >
              {o}
            </button>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type CardSize = "sm" | "md" | "lg" | "full";
/** Card heights taken from the reference screens: 620 / 747 / 888 / 990 px on a 1080px-high window. */
const CARD_H: Record<CardSize, string> = {
  sm: "h-[max(520px,calc(100vh-457px))]",
  md: "h-[max(600px,calc(100vh-330px))]",
  lg: "h-[max(640px,calc(100vh-192px))]",
  full: "h-[max(700px,calc(100vh-87px))]",
};
export function ChartCard({
  controls,
  legend,
  children,
  size = "lg",
}: {
  controls?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
  size?: CardSize;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]",
        CARD_H[size],
      )}
    >
      {(controls || legend) && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {controls}
          <div className="ml-auto flex gap-4 text-[12px]">{legend}</div>
        </div>
      )}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}
export const Dot = ({ c, children }: { c: string; children: ReactNode }) => (
  <span className="flex items-center gap-1.5">
    <span className={cn("h-2 w-2 rounded-full", c)} />
    {children}
  </span>
);
export const Stats = ({ children }: { children: ReactNode }) => <StatGrid>{children}</StatGrid>;

export function Tip({ title, lines }: { title: string; lines: [string, string][] }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{title}</p>
      {lines.map(([k, v]) => (
        <p key={k}>
          {k}: <b className="tabular">{v}</b>
        </p>
      ))}
    </div>
  );
}

type TipItem = { payload?: unknown; dataKey?: unknown; value?: unknown };

/**
 * Tooltip body for a Recharts chart. Pass it as an element, `content={<PointTip describe={...} />}`: Recharts supplies
 * `active`, `payload` and `label` itself, and `describe` turns the hovered point into a title and lines. `P` is the shape
 * of the chart's data points.
 */
export function PointTip<P = unknown>({
  active,
  payload,
  label,
  describe,
}: {
  active?: boolean;
  payload?: readonly TipItem[];
  label?: string | number;
  describe: (
    point: P,
    items: readonly TipItem[],
    label: string | number | undefined,
  ) => { title: string; lines: [string, string][] };
}) {
  const first = payload?.[0];
  if (!active || !first) return null;
  const { title, lines } = describe(first.payload as P, payload, label);
  return <Tip title={title} lines={lines} />;
}

export const DISPLAY = [
  "Return ($)",
  "Average Return ($)",
  "Return (%)",
  "Average Return (%)",
  "R Multiple (R)",
  "Average R Multiple (R)",
  "Winrate (%)",
  "Number of Trades",
] as const;
export type Display = (typeof DISPLAY)[number];
export const SORT = ["By Value", "By Name", "By Trades"] as const;
export type Sort = (typeof SORT)[number];

/** Value of one group for the chosen metric. "Average ..." divides the total by the number of trades. */
export function valueOf(ts: Trade[], d: Display, start: number) {
  const n = ts.length || 1;
  const avg = d.startsWith("Average");
  const div = avg ? n : 1;
  const unit = d.includes("(%)") ? "pct" : d.includes("(R)") ? "r" : "cur";
  if (d === "Winrate (%)") return (ts.filter(isWin).length / n) * 100;
  if (d === "Number of Trades") return ts.length;
  // R only counts trades that have an R, so "Average (R)" is per trade with a stop, not diluted by trades without one.
  if (unit === "r") {
    const rs = ts.map((t) => t.r).filter((r): r is number => r != null);
    const sum = rs.reduce((a, r) => a + r, 0);
    return avg ? (rs.length ? sum / rs.length : 0) : sum;
  }
  const total =
    unit === "pct"
      ? start
        ? (ts.reduce((a, t) => a + t.net_pnl, 0) / start) * 100
        : 0
      : ts.reduce((a, t) => a + t.net_pnl, 0);
  return total / div;
}
export const fmtD = (d: Display, v: number, cur: string) =>
  d.includes("($)")
    ? fmtMoney(v, cur)
    : d.includes("(R)")
      ? `${fmtNum(v)}R`
      : d === "Number of Trades"
        ? String(v)
        : `${fmtNum(v)}%`;
