import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { format, startOfWeek } from "date-fns";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTrades } from "@/lib/journal-context";
import { computeStats, fmtMoney, fmtNum, fmtPct, groupBy, type Trade } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { TiltMeter } from "@/components/kit";

export const Route = createFileRoute("/_authenticated/reports/monthly")({
  head: () => ({ meta: [{ title: "Monthly Reports — AlphaMine" }, { name: "description", content: "Compare monthly and weekly trading performance." }, { property: "og:title", content: "Monthly Reports — AlphaMine" }, { property: "og:description", content: "Compare monthly and weekly trading performance." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Monthly,
});

function Monthly() {
  const { trades, journal } = useTrades();
  const [expanded, setExpanded] = useState<string[]>([]);
  const months = [...groupBy(trades, (t) => t.entry_at.slice(0, 7)).entries()].sort(([a], [b]) => b.localeCompare(a));
  const toggle = (key: string) => setExpanded((v) => v.includes(key) ? v.filter((x) => x !== key) : [...v, key]);
  return <div className="min-h-[calc(100vh-7rem)] overflow-x-auto rounded-lg bg-card pb-6 shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
    <table className="w-full min-w-[1250px] text-[11px] tabular">
      <thead className="sticky top-0 bg-card text-left"><tr className="h-[38px]">{["Month", "Week", "Trades", "Tiltmeter", "Return ($)", "Return (%)", "Winrate (%)", "Avg. P&L ($)", "Profit Factor", "Avg. R Multiple", "Sum. R Multiple", "Biggest Win ($)", "Week Start", "Biggest Loss ($)", "Efficiency (%)", "W", "L"].map((x) => <th key={x} className="whitespace-nowrap px-2 font-semibold first:pl-4">{x}</th>)}</tr></thead>
      <tbody>{months.map(([month, ts]) => {
        const label = new Date(`${month}-02T12:00:00`).toLocaleString("en-US", { month: "long", year: "numeric" });
        const weeks = [...groupBy(ts, (t) => {
          const d = new Date(t.entry_at); const th = new Date(d); th.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
          const w1 = new Date(th.getFullYear(), 0, 4);
          const wk = 1 + Math.round(((th.getTime() - w1.getTime()) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
          return `${th.getFullYear()}-${String(wk).padStart(2, "0")}`;
        }).entries()].sort(([a], [b]) => b.localeCompare(a));
        return <Fragment key={month}>
          <ReportRow label={`${label} (${weeks.length})`} trades={ts} currency={journal?.currency} balance={journal?.starting_balance ?? 0} expanded={expanded.includes(month)} onToggle={() => toggle(month)} />
           {expanded.includes(month) && weeks.map(([week, wt], i) => <ReportRow key={`${month}-${week}`} label="" week={week} trades={wt} previous={weeks[i + 1]?.[1]} currency={journal?.currency} balance={journal?.starting_balance ?? 0} />)}
        </Fragment>;
      })}</tbody>
    </table>
    {!months.length && <p className="p-8 text-sm text-muted-foreground">No trades to report yet.</p>}
  </div>;
}

/** Share of trades that followed the plan (no negative comment) - the same notion Chart Lab's Efficiency uses. */
const efficiency = (ts: Trade[]) => (ts.length ? (ts.filter((t) => t.followedPlan).length / ts.length) * 100 : 0);

function metricList(s: ReturnType<typeof computeStats>, ts: Trade[]) {
  return [s.net, s.roi, s.winRate, s.avgPnl, s.profitFactor, s.avgR, s.totalR, s.biggestWin, null, s.biggestLoss, efficiency(ts), s.wins, s.losses];
}
/** Positive = better. Losers going up is worse, everything else going up is better. */
const betterWhenHigher = [true, true, true, true, true, true, true, true, true, true, true, true, false];

function ReportRow({ label, week, trades, previous, currency, balance, expanded, onToggle }: { label: string; week?: string; trades: Trade[]; previous?: Trade[]; currency?: string; balance: number; expanded?: boolean; onToggle?: () => void }) {
  const s = computeStats(trades, balance);
  const tilt = trades.reduce((v, t) => v + t.tilt, 0);
  const tone = s.net > 0 ? "text-profit" : s.net < 0 ? "text-loss" : "";
  const num = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmts = [(v: number) => num(v), num, num, num, num, num, num, num, null, num, num, (v: number) => String(v), (v: number) => String(v)];
  const now = metricList(s, trades);
  const before = previous ? metricList(computeStats(previous, balance), previous) : null;
  const start = week && trades.length ? format(startOfWeek(new Date(trades.map((t) => t.entry_at).sort()[0]!), { weekStartsOn: 1 }), "yyyy-MM-dd") : "";
  return <tr className={cn("h-[31px] hover:brightness-[0.98]", s.net > 0 ? "bg-row-win" : s.net < 0 ? "bg-row-loss" : "")}>
    <td className="whitespace-nowrap px-2 first:pl-4">{onToggle && <button className="mr-1 inline-flex h-5 w-5 items-center justify-center" aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`} onClick={onToggle}>{expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</button>}<span className={tone}>{label}</span></td>
    <td className={cn("px-2", tone)}>{week ?? ""}</td><td className={cn("px-2", tone)}>{s.count}</td>
    <td className="px-2"><TiltMeter value={tilt} /></td>
    {now.map((v, i) => {
      if (v == null) return <td key={i} className={cn("whitespace-nowrap px-2", tone)}>{start}</td>;
      const b = before ? before[i] : null;
      const better = betterWhenHigher[i];
      const arrow = b == null ? null : v === b ? <Minus aria-label="Unchanged from previous week" className="h-3 w-3 text-muted-foreground" />
        : (v > b) === better ? <ArrowUp aria-label="Improved from previous week" className="h-3 w-3 text-profit" /> : <ArrowDown aria-label="Declined from previous week" className="h-3 w-3 text-loss" />;
      return <td key={i} className={cn("whitespace-nowrap px-2", tone)}><span className="inline-flex items-center gap-1">{fmts[i]!(v)}{i < 11 && arrow}</span></td>;
    })}
  </tr>;
}
