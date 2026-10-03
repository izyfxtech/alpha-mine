import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
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
  return <div className="overflow-x-auto border bg-card min-h-[calc(100vh-7rem)]">
    <table className="w-full min-w-[1250px] text-xs tabular">
      <thead className="sticky top-0 bg-card text-left text-muted-foreground"><tr className="border-b">{["Month", "Week", "Trades", "Tiltmeter", "Return", "Return (%)", "Winrate (%)", "Avg. P&L", "Profit Factor", "Avg. R Multiple", "Sum. R Multiple", "Biggest Win", "Biggest Loss", "Efficiency (%)", "W", "L"].map((x) => <th key={x} className="whitespace-nowrap px-2 py-3 font-medium first:pl-4">{x}</th>)}</tr></thead>
      <tbody>{months.map(([month, ts]) => {
        const label = new Date(`${month}-02T12:00:00`).toLocaleString("en-US", { month: "long", year: "numeric" });
        const weeks = [...groupBy(ts, (t) => {
          const d = new Date(t.entry_at); const th = new Date(d); th.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
          const w1 = new Date(th.getFullYear(), 0, 4);
          const wk = 1 + Math.round(((th.getTime() - w1.getTime()) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
          return `${th.getFullYear()}-${String(wk).padStart(2, "0")}`;
        }).entries()].sort(([a], [b]) => b.localeCompare(a));
        return <>
          <ReportRow key={month} label={`${label} (${weeks.length})`} trades={ts} currency={journal?.currency} balance={journal?.starting_balance ?? 0} expanded={expanded.includes(month)} onToggle={() => toggle(month)} />
           {expanded.includes(month) && weeks.map(([week, wt], i) => <ReportRow key={`${month}-${week}`} label="" week={week} trades={wt} previous={weeks[i + 1]?.[1]} currency={journal?.currency} balance={journal?.starting_balance ?? 0} />)}
        </>;
      })}</tbody>
    </table>
    {!months.length && <p className="p-8 text-sm text-muted-foreground">No trades to report yet.</p>}
  </div>;
}

function ReportRow({ label, week, trades, previous, currency, balance, expanded, onToggle }: { label: string; week?: string; trades: Trade[]; previous?: Trade[]; currency?: string; balance: number; expanded?: boolean; onToggle?: () => void }) {
  const s = computeStats(trades, balance);
  const tilt = trades.reduce((v, t) => v + t.tilt, 0);
  const tone = s.net > 0 ? "text-profit" : s.net < 0 ? "text-loss" : "";
  const values = [fmtMoney(s.net, currency), fmtPct(s.roi), fmtPct(s.winRate), fmtMoney(s.avgPnl, currency), fmtNum(s.profitFactor), fmtNum(s.avgR), fmtNum(s.totalR), fmtMoney(s.biggestWin, currency), fmtMoney(s.biggestLoss, currency), fmtPct(s.wins + s.losses ? s.wins / (s.wins + s.losses) * 100 : 0), s.wins, s.losses];
  return <tr className={cn("border-b hover:bg-muted/50", s.net > 0 ? "bg-profit-soft/30" : s.net < 0 ? "bg-loss-soft/30" : "")}>
    <td className="whitespace-nowrap px-2 py-2 first:pl-4">{onToggle && <Button variant="ghost" size="icon" className="mr-1 h-5 w-5" aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`} onClick={onToggle}>{expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</Button>}<span className={cn(!week && "font-medium", tone)}>{label}</span></td>
    <td className={cn("px-2 py-2", tone)}>{week ?? ""}</td><td className={cn("px-2 py-2", tone)}>{s.count}</td>
    <td className="px-2 py-2"><TiltMeter value={tilt} /></td>
    {values.map((v, i) => {
      const prev = previous ? computeStats(previous, balance) : null;
      const before = prev && [prev.net, prev.roi, prev.winRate, prev.avgPnl, prev.profitFactor, prev.avgR, prev.totalR, prev.biggestWin, prev.biggestLoss, prev.wins + prev.losses ? prev.wins / (prev.wins + prev.losses) * 100 : 0, prev.wins, prev.losses][i];
      const after = [s.net, s.roi, s.winRate, s.avgPnl, s.profitFactor, s.avgR, s.totalR, s.biggestWin, s.biggestLoss, s.wins + s.losses ? s.wins / (s.wins + s.losses) * 100 : 0, s.wins, s.losses][i];
      return <td key={i} className={cn("whitespace-nowrap px-2 py-2", tone)}><span className="inline-flex items-center gap-1">{v}{before != null && after !== before && (after > before ? <ArrowUp aria-label="Improved from previous week" className="h-3 w-3 text-profit" /> : <ArrowDown aria-label="Declined from previous week" className="h-3 w-3 text-loss" />)}</span></td>;
    })}
  </tr>;
}
