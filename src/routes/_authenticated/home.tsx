import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addMonths, format, startOfMonth } from "date-fns";
import { ProfitCalendar } from "@/components/ProfitCalendar";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTrades } from "@/lib/journal-context";
import { bucketPerformance, computeStats, fmtHold, fmtMoney, fmtNum, fmtPct, groupPerformance, WEEKDAYS } from "@/lib/metrics";
import { KpiCards } from "@/components/KpiCards";
import { Empty, EquityChart, Panel, PnlBars, Stat, cumulative, pnlTone } from "@/components/kit";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { seedDemoTrades } from "@/lib/demo";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — AlphaMine" }, { name: "description", content: "Your trading performance at a glance." }, { property: "og:title", content: "Home — AlphaMine" }, { property: "og:description", content: "Your trading performance at a glance." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Home,
});

type Unit = "cur" | "pct" | "r";

function Home() {
  const { trades, journal, isLoading, cashflow } = useTrades();
  const qc = useQueryClient();
  const [unit, setUnit] = useState<Unit>("cur");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const s = useMemo(() => computeStats(trades, journal?.starting_balance ?? 0, cashflow), [trades, journal, cashflow]);
  const cur = journal?.currency ?? "USD";
  const fmt = (v: number, r?: number | null, pct?: number) =>
    unit === "cur" ? fmtMoney(v, cur) : unit === "pct" ? fmtPct(pct ?? 0) : `${fmtNum(r ?? 0)}R`;

  if (!isLoading && journal && trades.length === 0)
    return (
      <Empty>
        <p className="text-base font-semibold text-foreground">No trades in this journal yet</p>
        <p className="mt-1">Add your first trade from the sidebar, import a CSV, to get started.</p>
        {import.meta.env.DEV && <Button className="mt-4" onClick={async () => { await seedDemoTrades(journal.id); qc.invalidateQueries(); }}>Load sample trades (dev only)</Button>}
      </Empty>
    );

  const byInst = groupPerformance(trades, (t) => t.instrument).sort((a, b) => b.pnl - a.pnl);
  const byDay = bucketPerformance(trades, (t) => new Date(t.entry_at).getDay(), [1, 2, 3, 4, 5, 6, 0].map((d) => ({ k: d, label: WEEKDAYS[d] })));
  const curve = cumulative(trades);
  const byHour = bucketPerformance(trades, (t) => new Date(t.entry_at).getHours(), Array.from({ length: 24 }, (_, h) => ({ k: h, label: `${String(h).padStart(2, "0")}:00` })));
  const bySetup = groupPerformance(trades, (t) => t.setup).sort((a, b) => b.pnl - a.pnl);
  const barFmt = (n: number) => fmtMoney(n, cur);

  return (
    <div className="space-y-5">
      <div className="inline-flex overflow-hidden rounded-md border text-[11px] font-medium">
        {([["cur", `Currency (${cur})`], ["pct", "Return (%)"], ["r", "R Multiple"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setUnit(k)} className={cn("px-2.5 py-1", unit === k && "bg-ink text-ink-foreground")}>{l}</button>
        ))}
      </div>

      <KpiCards trades={trades} s={s} fmt={fmt} avgWinLabel={fmtMoney(s.avgWin, cur)} avgLossLabel={fmtMoney(s.avgLoss, cur)} />

      <div className="grid gap-5 grid-cols-[1fr_380px]">
        <Panel title="Profit Calendar" action={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="w-32 text-center text-sm font-medium">{format(month, "MMMM yyyy")}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        }>
          <ProfitCalendar trades={trades} month={month} fmt={(pnl, r, pct) => fmt(pnl, r, pct)} />
        </Panel>

        <Panel title="Evaluation">
          <Stat label="Total Number of Trades" value={s.count} />
          <Stat label="Avg. Profit per Trading Day" value={fmtMoney(s.avgPerDay, cur)} tone={pnlTone(s.avgPerDay)} />
          <Stat label="Biggest Winner" value={fmtMoney(s.biggestWin, cur)} tone="pos" />
          <Stat label="Biggest Loser" value={fmtMoney(s.biggestLoss, cur)} tone="neg" />
          <Stat label="Total Fees" value={fmtMoney(s.fees, cur)} />
          <Stat label="Avg. Hold Time" value={fmtHold(s.avgHoldMin)} />
          <Stat label="Win rate w/o BE" value={fmtPct(s.winRateNoBE)} />
          {unit === "pct" && <Stat label="Followed the Trading Plan" value={fmtPct(s.followedPlanPct)} />}
          <Stat label="ROI" value={fmtPct(s.roi)} tone={pnlTone(s.roi)} />
          <Stat label="Max Drawdown" value={fmtPct(s.maxDD)} />
          <Stat label="Winning / Losing Days" value={`${s.winDays} / ${s.lossDays}`} />
          <Stat label="Trades per Day / Week" value={`${fmtNum(s.perDay)} / ${fmtNum(s.perWeek)}`} />
          <Stat label="Current Streak" value={<span className="flex gap-1">{s.streak.map((x, i) => <span key={i} className={x === "W" ? "text-profit" : x === "L" ? "text-loss" : ""}>{x}</span>)}</span>} />
        </Panel>
      </div>

      <div className="grid gap-5 grid-cols-3">
        <Panel title="Performance by Instrument"><PnlBars data={byInst} x="key" fmt={barFmt} /></Panel>
        <Panel title="Performance by Weekday"><PnlBars data={byDay} x="key" fmt={barFmt} /></Panel>
        <Panel title="Equity Graph">
          <EquityChart data={curve} height={260} compact fmt={(n) => fmtMoney(n, cur)} />
        </Panel>
      </div>

      <div className="grid gap-5 grid-cols-2">
        <Panel title="Performance by Hour"><PnlBars data={byHour} x="key" fmt={barFmt} /></Panel>
        <Panel title="Performance by Setup"><PnlBars data={bySetup} x="key" fmt={barFmt} /></Panel>
      </div>
    </div>
  );
}

