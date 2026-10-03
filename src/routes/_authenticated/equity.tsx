import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTrades } from "@/lib/journal-context";
import { computeStats, fmtMoney, fmtNum } from "@/lib/metrics";
import { AccentStat, EquityChart, type EquityPoint } from "@/components/kit";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTradeDrawer } from "@/components/TradeDrawer";

export const Route = createFileRoute("/_authenticated/equity")({
  head: () => ({ meta: [{ title: "Equity Graph — AlphaMine" }, { name: "description", content: "Your account equity over time." }, { property: "og:title", content: "Equity Graph — AlphaMine" }, { property: "og:description", content: "Your account equity over time." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Equity,
});

const DISPLAYS = ["Return ($)", "Account Balance ($)", "Return, gain sum (%)", "Return, ROI (%)", "R Multiple (R)"] as const;
type Display = (typeof DISPLAYS)[number];
const OPTIONS = ["Display Value Without Fees", "Display Tiltmeter", "Moving Average (20)", "Moving Average (50)", "Group Trades by Day"] as const;
type Opt = (typeof OPTIONS)[number];

function Equity() {
  const { trades, journal } = useTrades();
  const drawer = useTradeDrawer();
  const [display, setDisplay] = useState<Display>("Return ($)");
  const [opts, setOpts] = useState<Set<Opt>>(new Set());
  const has = (o: Opt) => opts.has(o);
  const toggle = (o: Opt) => setOpts((p) => { const n = new Set(p); n.has(o) ? n.delete(o) : n.add(o); return n; });
  const start = journal?.starting_balance ?? 0;
  const cur = journal?.currency ?? "USD";
  const s = useMemo(() => computeStats(trades, start), [trades, start]);

  const data = useMemo<EquityPoint[]>(() => {
    const sorted = [...trades].sort((a, b) => a.entry_at.localeCompare(b.entry_at));
    type Row = { pnl: number; gross: number; r: number; tilt: number; label: string; n: number; id?: string };
    let rows: Row[] = sorted.map((t, i) => ({ pnl: t.net_pnl, gross: t.net_pnl + t.fees, r: t.r ?? 0, tilt: t.tilt, label: `Trade #${t.trade_no ?? i + 1}`, n: 1, id: t.id }));
    if (has("Group Trades by Day")) {
      const m = new Map<string, Row>();
      sorted.forEach((t) => {
        const k = t.entry_at.slice(0, 10);
        const p = m.get(k) ?? { pnl: 0, gross: 0, r: 0, tilt: 0, label: k, n: 0 };
        p.pnl += t.net_pnl; p.gross += t.net_pnl + t.fees; p.r += t.r ?? 0; p.tilt += t.tilt; p.n++;
        m.set(k, p);
      });
      rows = [...m.values()];
    }
    let c = 0, g = 0, r = 0, pctSum = 0, pctSumG = 0, tiltSum = 0;
    const out = rows.map((row, i) => {
      const balBefore = start + c;
      c += row.pnl; g += row.gross; r += row.r; tiltSum += row.tilt;
      pctSum += balBefore ? (row.pnl / balBefore) * 100 : 0;
      pctSumG += balBefore ? (row.gross / balBefore) * 100 : 0;
      const pick = (net: number, gross: number, ps: number, psg: number) => {
        switch (display) {
          case "Account Balance ($)": return [start + net, start + gross];
          case "Return, gain sum (%)": return [ps, psg];
          case "Return, ROI (%)": return [start ? (net / start) * 100 : 0, start ? (gross / start) * 100 : 0];
          case "R Multiple (R)": return [r, r];
          default: return [net, gross];
        }
      };
      const [v, v2] = pick(c, g, pctSum, pctSumG);
      return { x: i + 1, v: +v.toFixed(2), v2: has("Display Value Without Fees") ? +v2.toFixed(2) : undefined, tilt: has("Display Tiltmeter") ? tiltSum : undefined, label: row.label, id: row.id };
    });
    const ma = (n: number) => out.map((_, i) => (i >= n - 1 ? +(out.slice(i - n + 1, i + 1).reduce((a, p) => a + p.v, 0) / n).toFixed(2) : undefined));
    const m20 = has("Moving Average (20)") ? ma(20) : [];
    const m50 = has("Moving Average (50)") ? ma(50) : [];
    return out.map((p, i) => ({ ...p, ma20: m20[i], ma50: m50[i] }));
  }, [trades, start, display, opts]);

  const optLabel = opts.size === 0 ? "Options" : [...opts].join(", ");
  const unit = display.match(/\((.+)\)/)?.[1] ?? "$";

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <FieldBox label="Display">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-52 items-center justify-between text-sm">{display}<ChevronDown className="h-4 w-4" /></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {DISPLAYS.map((d) => (
                  <button key={d} onClick={() => setDisplay(d)} className={cn("block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted", d === display && "bg-muted font-medium")}>{d}</button>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </FieldBox>
          <FieldBox label={opts.size ? "Options" : undefined}>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-80 items-center justify-between gap-2 text-sm"><span className="truncate">{optLabel}</span><ChevronDown className="h-4 w-4 shrink-0" /></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80">
                {OPTIONS.map((o) => (
                  <DropdownMenuCheckboxItem key={o} checked={has(o)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => toggle(o)} className="py-2">{o}</DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </FieldBox>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span>{display}</span>
            {has("Display Value Without Fees") && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-4" />{display} (without fees)</span>}
            {has("Moving Average (20)") && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-5" />MA 20</span>}
            {has("Moving Average (50)") && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-3" />MA 50</span>}
          </div>
        </div>
        <div className="h-[clamp(340px,58vh,560px)] min-w-0 overflow-hidden">
        <EquityChart
          data={data}
          height="100%"
          baseline={display === "Account Balance ($)" ? start : 0}
          xLabel={has("Group Trades by Day") ? "Days" : "Trades"}
          yLabel={display}
          valueName={display}
          value2Name={`${display} (without fees)`}
          showTilt={has("Display Tiltmeter")}
          onPointClick={(p) => { const t = trades.find((x) => x.id === p.id); if (t) drawer.open(t); }}
          fmt={(n) => (unit === "$" ? fmtMoney(n, cur) : unit === "R" ? `${fmtNum(n)}R` : `${fmtNum(n)}%`)}
        />
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <AccentStat label="Trades" value={s.count} />
        <AccentStat label="Winners" value={s.wins} />
        <AccentStat label="Losers" value={s.losses} />
        <AccentStat label="Winrate (%)" value={fmtNum(s.winRate)} />
        <AccentStat label="Avg. P&L" value={fmtMoney(s.avgPnl, cur)} tone={s.avgPnl < 0 ? "neg" : "pos"} />
        <AccentStat label="Profit Factor" value={fmtNum(s.profitFactor)} />
        <AccentStat label="Return (%)" value={Math.round(s.roi)} tone={s.roi < 0 ? "neg" : "pos"} />
        <AccentStat label="Biggest Winner" value={fmtMoney(s.biggestWin, cur)} />
        <AccentStat label="Biggest Loser" value={fmtMoney(s.biggestLoss, cur)} />
        <AccentStat label="Profit/Loss" value={fmtMoney(s.net, cur)} tone={s.net < 0 ? "neg" : "pos"} />
      </div>
    </div>
  );
}

function FieldBox({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-md border bg-card px-3 pb-2 pt-3">
      {label && <span className="absolute -top-2 left-2 bg-card px-1 text-[10px] text-muted-foreground">{label}</span>}
      {children}
    </div>
  );
}
