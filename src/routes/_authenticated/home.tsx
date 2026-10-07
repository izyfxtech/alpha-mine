import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { addMonths, format, startOfMonth } from "date-fns";
import { ProfitCalendar } from "@/components/ProfitCalendar";
import { Camera, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { downloadElementPng } from "@/lib/capture";
import { useEdgeInsights } from "@/lib/use-edge-insights";
import { useTrades } from "@/lib/journal-context";
import { bucketPerformance, computeStats, fmtHold, fmtMoney, fmtNum, fmtPct, groupPerformance } from "@/lib/metrics";
import { KpiCards } from "@/components/KpiCards";
import { Social } from "@/components/Social";
import { Empty, EquityChart, Panel, PnlBars, Stat, cumulative } from "@/components/kit";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { seedDemoTrades } from "@/lib/demo";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — AlphaMine" }, { name: "description", content: "Your trading performance at a glance." }, { property: "og:title", content: "Home — AlphaMine" }, { property: "og:description", content: "Your trading performance at a glance." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Home,
});

type Unit = "cur" | "pct" | "r";

const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CURRENCY_NAMES: Record<string, string> = { USD: "United States Dollar", EUR: "Euro", GBP: "British Pound", JPY: "Japanese Yen", AUD: "Australian Dollar", CAD: "Canadian Dollar", CHF: "Swiss Franc", NGN: "Nigerian Naira" };
const currencyName = (c: string) => CURRENCY_NAMES[c] ?? (() => { try { return new Intl.DisplayNames(["en"], { type: "currency" }).of(c) ?? c; } catch { return c; } })();

function Home() {
  const { trades, journal, isLoading, cashflow } = useTrades();
  const qc = useQueryClient();
  const [unit, setUnit] = useState<Unit>("cur");
  const edgeCount = useEdgeInsights().length;
  const calRef = useRef<HTMLElement>(null);
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
  const byDay = bucketPerformance(trades, (t) => new Date(t.entry_at).getDay(), [1, 2, 3, 4, 5, 6, 0].map((d) => ({ k: d, label: FULL_DAYS[d] })));
  const curve = cumulative(trades);
  const byHour = bucketPerformance(trades, (t) => new Date(t.entry_at).getHours(), Array.from({ length: 24 }, (_, h) => ({ k: h, label: `${String(h).padStart(2, "0")}:00` })));
  const bySetup = groupPerformance(trades, (t) => t.setup).sort((a, b) => b.pnl - a.pnl);
  const barFmt = (n: number) => fmtMoney(n, cur);
  // Evaluation rows follow the selected display unit (currency, Return %, R multiple)
  const pcts = trades.map((t) => t.retPct);
  const rs = trades.map((t) => t.r).filter((x): x is number => x != null);
  const sumPct = pcts.reduce((a, b) => a + b, 0), sumR = rs.reduce((a, b) => a + b, 0);
  const tradingDays = new Set(trades.map((t) => t.entry_at.slice(0, 10))).size || 1;
  const ev = (money: number, pct: number, r: number) => (unit === "cur" ? fmtMoney(money, cur) : unit === "pct" ? fmtPct(pct) : `${fmtNum(r)}R`);

  return (
    <div className="mx-auto max-w-[1374px] space-y-[30px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex h-[24px] overflow-hidden rounded-md border bg-card text-[10px] font-semibold">
        {([["cur", `${currencyName(cur)} (${cur})`], ["pct", "Return (%)"], ["r", "R Multiple"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setUnit(k)} className={cn("border-r px-3 last:border-r-0", unit === k && "bg-ink text-ink-foreground")}>{l}</button>
        ))}
      </div>
      {edgeCount > 0 && (
        <Link to={"/edge-finder" as never} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-[12px] shadow-[0_1px_5px_rgba(60,40,90,0.07)] hover:bg-muted">
          <Sparkles className="h-4 w-4" />
          <span>Edge Finder found <b>{edgeCount} insight{edgeCount === 1 ? "" : "s"}</b> in your journal</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
      </div>

      <KpiCards trades={trades} s={s} fmt={fmt} avgWinLabel={fmtMoney(s.avgWin, cur)} avgLossLabel={fmtMoney(s.avgLoss, cur)} />

      <div className="grid grid-cols-[1fr_438px] gap-[30px]">
        <Panel title="Profit Calendar" sectionRef={calRef} action={
          <div className="flex items-center gap-3"><div data-no-capture className="flex items-center overflow-hidden rounded-md border border-ink-line text-[12px] font-medium">
            <button aria-label="Previous month" className="flex h-[26px] w-[26px] items-center justify-center hover:bg-muted" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-3.5 w-3.5" /></button>
            <span className="flex h-[26px] w-[110px] items-center justify-center border-x border-ink-line">{format(month, "MMMM yyyy")}</span>
            <button aria-label="Next month" className="flex h-[26px] w-[26px] items-center justify-center hover:bg-muted" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
          <button data-no-capture type="button" aria-label="Save calendar as image" title="Save calendar as image" className="rounded-md p-1.5 hover:bg-muted" onClick={() => { if (calRef.current) downloadElementPng(calRef.current, `profit-calendar-${format(month, "yyyy-MM")}.png`).catch(() => toast.error("Could not create the image")); }}><Camera className="h-5 w-5" /></button>
          </div>
        }>
          <ProfitCalendar trades={trades} month={month} fmt={(pnl, r, pct) => fmt(pnl, r, pct)} />
        </Panel>

        <Panel title="Evaluation" className="flex flex-col">
          <div className="mt-2" />
          <Stat label="Total Number of Trades" value={s.count} />
          <Stat label="Avg. Profit per Trading Day" value={ev(s.avgPerDay, sumPct / tradingDays, sumR / tradingDays)} />
          <Stat label="Biggest Winner" value={ev(s.biggestWin, pcts.length ? Math.max(...pcts) : 0, rs.length ? Math.max(...rs) : 0)} />
          <Stat label="Biggest Loser" value={ev(s.biggestLoss, pcts.length ? Math.min(...pcts) : 0, rs.length ? Math.min(...rs) : 0)} />
          <Stat label="Followed Trade Plan" value={fmtPct(s.followedPlanPct)} />
          <Stat label="Winrate w/o BE" value={fmtPct(s.winRateNoBE)} />
          <Stat label="Max Drawdown" value={fmtPct(s.maxDD)} />
          <Stat label="Return/Drawdown" value={fmtNum(s.maxDD ? s.roi / s.maxDD : s.roi)} />
          <Stat label="Winning / Losing Days" value={`${s.winDays} / ${s.lossDays}`} />
          <Stat label="Trades per Day / Week" value={`${fmtNum(s.perDay)} / ${fmtNum(s.perWeek)}`} />
          <Stat label="Avg. Hold Time" value={fmtHold(s.avgHoldMin)} />
          <Stat label="Total Fees" value={fmtMoney(s.fees, cur)} />
          <Stat label="ROI" value={fmtPct(s.roi)} />
          <Stat label="Current Streak" value={<span className="flex gap-[3px]">{s.streak.map((x, i) => <span key={i} className={cn("rounded px-1 text-[11px] font-bold", x === "W" ? "bg-profit-soft text-profit" : x === "L" ? "bg-loss-soft text-loss" : "bg-muted")}>{x}</span>)}</span>} />
        </Panel>
      </div>

      <div className="grid grid-cols-3 gap-[30px]">
        <Panel title="Performance by Instrument"><PnlBars data={byInst} x="key" fmt={barFmt} height={230} /></Panel>
        <Panel title="Performance by Weekday"><PnlBars data={byDay} x="key" fmt={barFmt} height={230} /></Panel>
        <Panel title="Equity Graph">
          <EquityChart data={curve} height={230} compact fmt={(n) => fmtMoney(n, cur)} />
        </Panel>
      </div>

      <div className="grid grid-cols-3 gap-[30px]">
        <Panel title="Performance by Hour"><PnlBars data={byHour} x="key" fmt={barFmt} height={230} /></Panel>
        <Panel title="Performance by Setup"><PnlBars data={bySetup} x="key" fmt={barFmt} height={230} /></Panel>
        <Social />
      </div>
    </div>
  );
}

