import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cumulative } from "@/components/kit";
import { Spark } from "@/components/charts";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtNum, fmtPct, type Trade, type computeStats } from "@/lib/pnl/metrics";

type Stats = ReturnType<typeof computeStats>;

function Widget({
  label,
  value,
  info,
  children,
}: {
  label: string;
  value: ReactNode;
  info?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-[88px] min-w-0 items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 shadow-none">
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[12px] font-medium text-t2">
          {label}
          {info && (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`About ${label}`}
                    className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-xs leading-relaxed">
                  {info}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </p>
        <p className="mt-2 text-[15px] font-semibold tabular text-t1">{value}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** The five cards with their headings and size, and the figures and graphics still blank. */
export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {(
        [
          ["Net P&L", "h-9 w-14"],
          ["Trade expectancy", "h-9 w-14"],
          ["Profit factor", "h-10 w-10 rounded-full"],
          ["Trade win %", "h-[58px] w-[84px]"],
          ["Avg win/loss", "h-[9px] w-[105px]"],
        ] as const
      ).map(([label, graphic]) => (
        <Widget
          key={label}
          label={label}
          value={<Skeleton className="inline-block h-[15px] w-16 align-middle" />}
        >
          <Skeleton className={graphic} />
        </Widget>
      ))}
    </div>
  );
}

/** Headline account metrics with compact trend and quality indicators. */
export function KpiCards({
  trades,
  s,
  fmt,
  avgWinLabel,
  avgLossLabel,
}: {
  trades: Trade[];
  s: Stats;
  fmt: (v: number, r?: number | null, pct?: number) => string;
  avgWinLabel: string;
  avgLossLabel: string;
}) {
  const curve = cumulative(trades);
  const sumPct = trades.reduce((a, t) => a + t.retPct, 0);
  const avgPct = trades.length ? sumPct / trades.length : 0;
  // The headline return is the ROI (net over starting balance plus deposits), the same figure on every page; the per-trade average stays an average of each trade's own %.
  const avgLossAbs = Math.abs(s.avgLoss);
  const payoff = avgLossAbs > 0 ? s.avgWin / avgLossAbs : 0;
  const winShare = s.avgWin + avgLossAbs > 0 ? (s.avgWin / (s.avgWin + avgLossAbs)) * 100 : 50;
  const pf = s.profitFactor === Infinity ? 3 : Number.isFinite(s.profitFactor) ? s.profitFactor : 0;
  const pfScore = Math.max(0, Math.min(100, (pf / 3) * 100));
  const arc = 126;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Widget label="Net P&L" value={fmt(s.net, s.rCount ? s.totalR : null, s.roi)}>
        <Spark data={curve.map((c) => c.v)} width={56} height={36} />
      </Widget>
      <Widget label="Trade expectancy" value={fmt(s.expectancy, s.rCount ? s.avgR : null, avgPct)}>
        <Spark data={curve.map((c) => c.v)} width={56} height={36} />
      </Widget>
      <Widget label="Profit factor" value={fmtNum(s.profitFactor)}>
        <svg
          viewBox="0 0 40 40"
          className="size-10 -rotate-90"
          role="img"
          aria-label={`Profit factor ${fmtNum(s.profitFactor)} of 3`}
        >
          <circle cx="20" cy="20" r="14" fill="none" stroke="var(--color-muted)" strokeWidth="4" />
          <circle
            cx="20"
            cy="20"
            r="14"
            fill="none"
            stroke="var(--color-chart-4)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(pfScore / 100) * 88} 88`}
          />
        </svg>
      </Widget>
      <Widget label="Trade win %" value={fmtPct(s.winRate)}>
        <div className="relative w-[84px] text-center">
          <svg viewBox="0 0 100 56" className="h-[40px] w-[84px]">
            <path
              d="M10 50 A40 40 0 0 1 90 50"
              fill="none"
              stroke="var(--color-loss)"
              strokeWidth="9"
            />
            <path
              d="M10 50 A40 40 0 0 1 90 50"
              fill="none"
              stroke="var(--color-chart-1)"
              strokeWidth="9"
              strokeDasharray={`${(s.winRate / 100) * arc} 200`}
            />
          </svg>
          <p className="flex justify-between px-0.5 text-xs font-semibold tabular">
            <span className="rounded-full bg-profit-soft px-1.5 py-px text-profit">{s.wins}</span>
            <span>{s.be}</span>
            <span className="rounded-full bg-loss-soft px-1.5 py-px text-loss">{s.losses}</span>
          </p>
        </div>
      </Widget>
      <Widget label="Avg win/loss" value={payoff > 0 ? `${fmtNum(payoff)}:1` : "–"}>
        <div className="w-[84px]">
          <p
            className="mb-1 text-center text-xs font-semibold tabular text-t2"
            title="Average winner divided by average loser"
          >
            {s.count} trades
          </p>
          <div className="flex h-[6px] gap-[2px] overflow-hidden">
            <div className="rounded-l-full bg-chart-1" style={{ width: `${winShare}%` }} />
            <div className="flex-1 rounded-r-full bg-chart-2" />
          </div>
          <p className="mt-1 flex justify-between text-xs font-semibold tabular">
            <span className="text-profit">{avgWinLabel}</span>
            <span className="text-loss">{avgLossLabel}</span>
          </p>
        </div>
      </Widget>
    </div>
  );
}
