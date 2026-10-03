import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Spark, cumulative } from "@/components/kit";
import { fmtNum, fmtPct, type Trade, type computeStats } from "@/lib/metrics";

type Stats = ReturnType<typeof computeStats>;

function Widget({ label, value, info, children }: { label: string; value: string; info?: boolean; children?: ReactNode }) {
  return (
    <div className="flex h-[84px] items-center justify-between rounded-lg bg-card px-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-xs text-foreground">{label}{info && <Info className="h-3 w-3" />}</p>
        <p className="mt-1 text-lg font-medium tabular">{value}</p>
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
  let gw = 0, gl = 0;
  const pfSeries = [...trades].sort((a, b) => a.entry_at.localeCompare(b.entry_at)).map((t) => {
    if (t.net_pnl > 0) gw += t.net_pnl; else gl -= t.net_pnl;
    return gl ? Math.min(gw / gl, 5) : 0;
  });
  const totalWL = s.wins + s.losses || 1;
  const arc = 126;
  return (
    <div className="grid grid-cols-5 gap-5">
      <Widget label="Net Return" value={fmt(s.net, s.totalR, sumPct)}><Spark data={curve.map((c) => c.v)} width={56} height={36} /></Widget>
      <Widget label="Winrate" value={fmtPct(s.winRate)}>
        <div className="relative w-[84px] text-center">
          <svg viewBox="0 0 100 56" className="h-[40px] w-[84px]">
            <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--color-loss)" strokeWidth="8" />
            <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--color-profit)" strokeWidth="8" strokeDasharray={`${(s.winRate / 100) * arc} 200`} />
          </svg>
          <p className="flex justify-between px-0.5 text-[9px] font-semibold tabular">
            <span className="text-profit">{s.wins}</span><span>{s.be}</span><span className="rounded bg-loss-soft px-1 text-loss">{s.losses}</span>
          </p>
        </div>
      </Widget>
      <Widget label="Avg P&L" value={fmt(s.avgPnl, s.avgR, avgPct)}>
        <div className="w-[84px]">
          <div className="flex h-1.5 gap-0.5 overflow-hidden">
            <div className="rounded-l-full bg-profit" style={{ width: `${(s.wins / totalWL) * 100}%` }} />
            <div className="flex-1 rounded-r-full bg-loss" />
          </div>
          <p className="mt-1 flex justify-between text-[9px] font-semibold tabular"><span className="text-profit">{avgWinLabel}</span><span className="text-loss">{avgLossLabel}</span></p>
        </div>
      </Widget>
      <Widget label="Profit Factor" value={fmtNum(s.profitFactor)}><Spark data={pfSeries} width={56} height={36} line /></Widget>
      <Widget label="AM Score" value={fmtNum(s.score)} info>
        <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-muted)" strokeWidth="2.5" />
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-profit)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(100, s.score)) / 100) * 94.2} 100`} />
        </svg>
      </Widget>
    </div>
  );
}
