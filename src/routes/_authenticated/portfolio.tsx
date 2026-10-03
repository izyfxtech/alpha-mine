import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { addMonths, format, startOfMonth } from "date-fns";
import { ArrowDown, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchTrades, useJournal } from "@/lib/journal-context";
import { bucketPerformance, computeStats, fmtNum, fmtPct, groupPerformance, MONTHS, WEEKDAYS, type Trade } from "@/lib/metrics";
import { EquityChart, Panel, PnlBars, Stat } from "@/components/kit";
import { KpiCards } from "@/components/KpiCards";
import { ProfitCalendar } from "@/components/ProfitCalendar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio — AlphaMine" }, { name: "description", content: "Compare journal performance and combined equity." }, { property: "og:title", content: "Portfolio — AlphaMine" }, { property: "og:description", content: "Compare journal performance and combined equity." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Portfolio,
});

const n2 = (v: number) => (isFinite(v) ? v.toFixed(2) : "∞");
const dt = (s: string | null) => (s ? s.replace("T", " ").slice(0, 16) : "");

function Portfolio() {
  const { journals, setJournalId } = useJournal();
  const [unit, setUnit] = useState<"pct" | "r">("pct");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const ids = journals.map((j) => j.id);
  const { data: allTrades = [] } = useQuery({ queryKey: ["trades", "portfolio", ids], queryFn: () => fetchTrades(ids), enabled: ids.length > 0 });
  const active = journals.filter((j) => !off.has(j.id));
  const balOf = useMemo(() => new Map(journals.map((j) => [j.id, Number(j.starting_balance) || 1])), [journals]);
  // Portfolio works in % of each journal's own balance so different currencies/sizes compare fairly.
  const trades = useMemo(() => allTrades.filter((t) => !off.has(t.journal_id)).map((t) => ({ ...t, pct: (t.net_pnl / (balOf.get(t.journal_id) ?? 1)) * 100 })), [allTrades, off, balOf]);
  const pctTrades: Trade[] = useMemo(() => trades.map((t) => ({ ...t, net_pnl: unit === "pct" ? +t.pct.toFixed(4) : t.r ?? 0 })), [trades, unit]);
  const per = useMemo(() => active.map((j) => ({ j, s: computeStats(trades.filter((t) => t.journal_id === j.id), Number(j.starting_balance)), ts: trades.filter((t) => t.journal_id === j.id) })), [active, trades]);
  const s = computeStats(pctTrades, 100);
  const fmtU = (v: number) => (unit === "pct" ? `${fmtNum(v)}%` : `${fmtNum(v)}R`);
  let c = 0;
  const curve = [...pctTrades].sort((a, b) => a.entry_at.localeCompare(b.entry_at)).map((t, i) => { c += t.net_pnl; return { x: i + 1, v: +c.toFixed(2), label: t.entry_at.slice(0, 10) }; });
  const max = Math.max(1, ...per.map((p) => Math.abs(p.s.roi)));
  const name = new Map(journals.map((j) => [j.id, j.name]));
  const best = [...trades].sort((a, b) => b.pct - a.pct);
  const totals = per.reduce((a, { s: x }) => ({ roi: a.roi + x.roi, r: a.r + x.totalR, n: a.n + x.count }), { roi: 0, r: 0, n: 0 });
  const avgPct = trades.length ? trades.reduce((a, t) => a + t.pct, 0) / trades.length : 0;
  const avgR = trades.length ? trades.reduce((a, t) => a + (t.r ?? 0), 0) / trades.length : 0;
  const days = new Set(trades.map((t) => t.entry_at.slice(0, 10))).size || 1;
  const followed = trades.filter((t) => t.followedPlan).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="inline-flex overflow-hidden rounded-md border text-[11px] font-medium">
          {([["pct", "Return (%)"], ["r", "R Multiple"]] as const).map(([k, l]) => <button key={k} onClick={() => setUnit(k)} className={cn("px-2.5 py-1", unit === k && "bg-ink text-ink-foreground")}>{l}</button>)}
        </div>
        <Popover>
          <PopoverTrigger asChild><Button variant="outline" className="h-9 w-56 justify-between font-normal">Journals <ChevronDown className="h-4 w-4" /></Button></PopoverTrigger>
          <PopoverContent align="end" className="w-56 space-y-1.5 p-3">
            {journals.map((j) => (
              <label key={j.id} className="flex items-center gap-2 text-xs">
                <Checkbox checked={!off.has(j.id)} onCheckedChange={() => setOff((o) => { const n = new Set(o); if (n.has(j.id)) n.delete(j.id); else n.add(j.id); return n; })} />{j.name}
              </label>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <KpiCards trades={pctTrades} s={s} fmt={(v) => fmtU(v)} avgWinLabel={fmtU(s.avgWin)} avgLossLabel={fmtU(s.avgLoss)} />

      <Panel title="Journals">
        <table className="w-full text-[11px] tabular">
          <thead><tr className="text-right">{["Name", "Balance", "Return (%)", "Return (R)", "Avg. P&L", "Avg. %", "Avg. R", "Profit Factor", "Winrate", "Trades #", "AM Score", ""].map((h, i) => <th key={h} className={cn("whitespace-nowrap border-r px-2 py-2.5 font-medium last:border-0", i === 0 && "text-left")}>{h}</th>)}</tr></thead>
          <tbody>
            {per.map(({ j, s: x, ts }) => {
              const tone = x.net > 0 ? "text-profit" : x.net < 0 ? "text-loss" : "";
              const ap = ts.length ? ts.reduce((a, t) => a + t.pct, 0) / ts.length : 0;
              return (
                <tr key={j.id} className={cn("text-right", tone, x.net < 0 ? "bg-loss-soft/40" : x.net > 0 ? "bg-profit-soft/25" : "")}>
                  <td className="max-w-[130px] truncate px-2 py-2 text-left"><button className="hover:underline" onClick={() => setJournalId(j.id)}>{j.name}</button></td>
                  {[x.balance.toLocaleString("en-US", { style: "currency", currency: j.currency || "USD" }), n2(x.roi), n2(x.totalR), x.avgPnl.toLocaleString("en-US", { style: "currency", currency: j.currency || "USD" }), n2(ap), n2(x.avgR), n2(x.profitFactor), n2(x.winRate), x.count, n2(x.score)].map((v, i) => <td key={i} className="whitespace-nowrap px-2 py-2">{v}</td>)}
                  <td className="w-40 px-4"><div className="flex h-3 items-center border-l-2 border-muted-foreground/60"><div className={x.net >= 0 ? "h-full bg-profit" : "h-full bg-loss"} style={{ width: `${(Math.abs(x.roi) / max) * 100}%` }} /></div></td>
                </tr>
              );
            })}
            <tr className="text-right font-medium">
              <td /><td /><td className="px-2 py-2">{n2(totals.roi)}</td><td className="px-2">{n2(totals.r)}</td><td /><td className="px-2">{n2(avgPct)}</td><td className="px-2">{n2(avgR)}</td>
              <td className="px-2">{n2(s.profitFactor)}</td><td className="px-2">{n2(s.winRate)}</td><td className="px-2">{totals.n}</td><td className="px-2">{n2(s.score)}</td><td />
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel title="Equity Graph"><EquityChart data={curve} height={420} valueName={unit === "pct" ? "Return (%)" : "R Multiple"} fmt={fmtU} /></Panel>

      <div className="grid grid-cols-[1fr_440px] gap-5">
        <Panel title="Profit Calendar" action={
          <div className="flex items-center overflow-hidden rounded-md border">
            <button className="border-r px-2 py-1.5" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></button>
            <span className="w-32 text-center text-sm">{format(month, "MMMM yyyy")}</span>
            <button className="border-l px-2 py-1.5" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></button>
          </div>
        }>
          <ProfitCalendar trades={pctTrades} month={month} fmt={(v) => fmtU(v)} />
        </Panel>
        <Panel title="Performance by Weekday">
          <PnlBars height={520} fmt={fmtU} angle data={bucketPerformance(pctTrades, (t) => new Date(t.entry_at).getDay(), [1, 2, 3, 4, 5, 6, 0].map((d) => ({ k: d, label: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d] ?? WEEKDAYS[d] })))} x="key" />
        </Panel>
      </div>

      <div className="grid grid-cols-[1fr_440px] gap-5">
        <Panel title="Best & Worst Trades">
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-[11px] tabular">
              <thead className="sticky top-0 bg-card"><tr className="text-left">{["Journal Name", "Entry Date", "Exit Date", "Instrument", "Setup", "Direction", "Return (%)", "Return (R)"].map((h) => <th key={h} className="whitespace-nowrap border-r px-2 py-2.5 font-medium last:border-0">{h === "Return (%)" ? <span className="inline-flex items-center gap-1"><ArrowDown className="h-3 w-3" />{h}</span> : h}</th>)}</tr></thead>
              <tbody>
                {best.map((t) => (
                  <tr key={t.id} className={cn(t.pct > 0 ? "bg-profit-soft/25 text-profit" : t.pct < 0 ? "bg-loss-soft/40 text-loss" : "")}>
                    <td className="max-w-[150px] truncate px-2 py-2">{name.get(t.journal_id)}</td><td className="px-2">{dt(t.entry_at)}</td><td className="px-2">{dt(t.exit_at)}</td>
                    <td className="px-2">{t.instrument}</td><td className="px-2">{t.setup}</td>
                    <td className="px-2"><span className={cn("rounded px-2 py-0.5 capitalize", t.pct >= 0 ? "bg-profit-soft" : "bg-loss-soft")}>{t.direction}</span></td>
                    <td className="px-2 text-right">{n2(t.pct)}</td><td className="px-2 text-right">{t.r == null ? "" : n2(t.r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Evaluation">
          <Stat label="Total Number of Trades" value={trades.length} />
          <Stat label="Biggest win" value={fmtPct(best[0]?.pct ?? 0)} />
          <Stat label="Biggest loss" value={fmtPct(best[best.length - 1]?.pct ?? 0)} />
          <Stat label="Avg. Profit / day" value={fmtPct(trades.reduce((a, t) => a + t.pct, 0) / days)} />
          <Stat label="Trades per day / week" value={`${fmtNum(s.perDay)} / ${fmtNum(s.perWeek)}`} />
          <Stat label="Followed trade plan %" value={fmtPct(trades.length ? (followed / trades.length) * 100 : 0)} />
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Panel title="Performance by Instrument"><PnlBars height={280} fmt={fmtU} data={groupPerformance(pctTrades, (t) => t.instrument).sort((a, b) => b.pnl - a.pnl)} x="key" /></Panel>
        <Panel title="Performance by Setup"><PnlBars height={280} fmt={fmtU} angle data={groupPerformance(pctTrades, (t) => t.setup).sort((a, b) => b.pnl - a.pnl)} x="key" /></Panel>
        <Panel title="Performance by Month"><PnlBars height={280} fmt={fmtU} angle data={bucketPerformance(pctTrades, (t) => new Date(t.entry_at).getMonth(), MONTHS.map((m, i) => ({ k: i, label: m })))} x="key" /></Panel>
        <Panel title="Performance by Hour"><PnlBars height={280} fmt={fmtU} angle data={bucketPerformance(pctTrades, (t) => new Date(t.entry_at).getHours(), Array.from({ length: 24 }, (_, h) => ({ k: h, label: `${String(h).padStart(2, "0")}:00` })))} x="key" /></Panel>
      </div>
    </div>
  );
}
