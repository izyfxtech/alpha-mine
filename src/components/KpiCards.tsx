import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Spark, cumulative } from "@/components/kit";
import { fmtNum, fmtPct, type Trade, type computeStats } from "@/lib/metrics";

type Stats = ReturnType<typeof computeStats>;

function Widget({ label, value, info, children }: { label: string; value: string; info?: string; children?: ReactNode }) {
  return (
    <div className="flex h-[84px] min-w-[230px] flex-1 items-center justify-between gap-3 rounded-lg bg-card px-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[12px] font-medium text-t2">{label}
          {info && (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild><button type="button" aria-label={`About ${label}`} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"><Info className="h-3 w-3" /></button></TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-[11px] leading-relaxed">{info}</TooltipContent>
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

/** The five headline cards (Net Return, Winrate, Avg P&L, Profit Factor, Score) with their mini graphics. */
export function KpiCards({ trades, s, fmt, avgWinLabel, avgLossLabel }: {
  trades: Trade[]; s: Stats; fmt: (v: number, r?: number | null, pct?: number) => string; avgWinLabel: string; avgLossLabel: string;
}) {
  const curve = cumulative(trades);
  const sumPct = trades.reduce((a, t) => a + t.retPct, 0);
  const avgPct = trades.length ? sumPct / trades.length : 0;
  const avgLossAbs = Math.abs(s.avgLoss);
  const payoff = avgLossAbs > 0 ? s.avgWin / avgLossAbs : 0;
  const winShare = s.avgWin + avgLossAbs > 0 ? (s.avgWin / (s.avgWin + avgLossAbs)) * 100 : 50;
  const pf = Number.isFinite(s.profitFactor) ? s.profitFactor : 4;
  const pfFilled = Math.max(0, Math.min(9, (pf / 4) * 9));
  const scoreColour = s.score >= 75 ? "var(--color-chart-1)" : s.score >= 50 ? "var(--star)" : s.score >= 35 ? "oklch(0.75 0.17 55)" : "var(--color-chart-2)";
  const arc = 126;
  return (
    <div className="slim-scroll flex gap-[30px] overflow-x-auto pb-1">
      <Widget label="Net Return" value={fmt(s.net, s.totalR, sumPct)}><Spark data={curve.map((c) => c.v)} width={56} height={36} /></Widget>
      <Widget label="Winrate" value={fmtPct(s.winRate)}>
        <div className="relative w-[84px] text-center">
          <svg viewBox="0 0 100 56" className="h-[40px] w-[84px]">
            <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--color-loss)" strokeWidth="9" />
            <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--color-chart-1)" strokeWidth="9" strokeDasharray={`${(s.winRate / 100) * arc} 200`} />
          </svg>
          <p className="flex justify-between px-0.5 text-[9px] font-semibold tabular">
            <span className="rounded-full bg-profit-soft px-1.5 py-px text-profit">{s.wins}</span><span>{s.be}</span><span className="rounded-full bg-loss-soft px-1.5 py-px text-loss">{s.losses}</span>
          </p>
        </div>
      </Widget>
      <Widget label="Avg P&L" value={fmt(s.avgPnl, s.avgR, avgPct)}>
        <div className="w-[84px]">
          <p className="mb-1 text-center text-[10px] font-semibold tabular text-t2" title="Average winner divided by average loser">{payoff > 0 ? `${payoff.toFixed(2)}:1` : "–"}</p>
          <div className="flex h-[6px] gap-[2px] overflow-hidden">
            <div className="rounded-l-full bg-chart-1" style={{ width: `${winShare}%` }} />
            <div className="flex-1 rounded-r-full bg-chart-2" />
          </div>
          <p className="mt-1 flex justify-between text-[9px] font-semibold tabular"><span className="text-profit">{avgWinLabel}</span><span className="text-loss">{avgLossLabel}</span></p>
        </div>
      </Widget>
      <Widget label="Profit Factor" value={fmtNum(s.profitFactor)}>
        <div className="flex gap-[3px]" role="img" aria-label={`Profit factor meter, ${pfFilled.toFixed(1)} of 9 segments`}>
          {Array.from({ length: 9 }, (_, i) => { const f = Math.max(0, Math.min(1, pfFilled - i)); return <span key={i} className="h-[9px] w-[9px] overflow-hidden rounded-[2px] bg-muted"><span className="block h-full bg-chart-1" style={{ width: `${f * 100}%` }} /></span>; })}
        </div>
      </Widget>
      <Widget label="AM Score" value={fmtNum(s.score)} info="A 0-100 quality score for the journal: 40% return relative to max drawdown (capped at 5x), 40% profit factor (capped at 3), and 20% sample size (full marks at 100 trades).">
        <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-muted)" strokeWidth="2.5" />
          <circle cx="18" cy="18" r="15" fill="none" stroke={scoreColour} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(100, s.score)) / 100) * 94.2} 100`} />
        </svg>
      </Widget>
    </div>
  );
}
