import { cumulative } from "@/lib/numbers";
import { toggled } from "@/lib/collections";
import { byEntry } from "@/lib/pnl/sort";
import { createFileRoute } from "@tanstack/react-router";
import { localDay } from "@/lib/time/local-time";
import { useMemo, useState, type ReactNode } from "react";
import { useTrades } from "@/lib/journal/journal-context";
import { computeStats, fmtMoney, fmtNum } from "@/lib/pnl/metrics";
import { AccentStat, StatGrid } from "@/components/kit";
import { EquityChart, type EquityPoint } from "@/components/charts";
import {
  EQUITY_CHART_BOX,
  EQUITY_STAT_LABELS,
  EquityControls,
  type Display,
  type Opt,
} from "@/components/equity/EquityControls";
import { useTradeDrawer } from "@/components/journal/TradeDrawer";
import { useXMode } from "@/components/analytics/x-axis";

export const Route = createFileRoute("/_authenticated/equity")({
  head: () => ({
    meta: [
      { title: "Equity Graph — AlphaMine" },
      { name: "description", content: "Your account equity over time." },
      { property: "og:title", content: "Equity Graph — AlphaMine" },
      { property: "og:description", content: "Your account equity over time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Equity,
});

function Equity() {
  const { trades, journal, flows } = useTrades();
  const drawer = useTradeDrawer();
  const [display, setDisplay] = useState<Display>("Return ($)");
  const [opts, setOpts] = useState<Set<Opt>>(new Set());
  const [xm, setXm] = useXMode();
  const has = (o: Opt) => opts.has(o);
  const toggle = (o: Opt) => setOpts((p) => toggled(p, o));
  const start = journal?.starting_balance ?? 0;
  const cur = journal?.currency ?? "USD";
  const s = useMemo(() => computeStats(trades, start, flows), [trades, start, flows]);

  const data = useMemo<EquityPoint[]>(() => {
    const sorted = [...trades].sort(byEntry);
    type Row = {
      pnl: number;
      gross: number;
      r: number;
      tilt: number;
      label: string;
      n: number;
      id?: string;
      t: number;
    };
    let rows: Row[] = sorted.map((t, i) => ({
      pnl: t.net_pnl,
      gross: t.net_pnl + t.fees,
      r: t.r ?? 0,
      tilt: t.tilt,
      label: `${xm === "date" ? `${localDay(t.entry_at)} · ` : ""}Trade #${t.trade_no ?? i + 1}`,
      n: 1,
      id: t.id,
      t: new Date(t.entry_at).getTime(),
    }));
    if (opts.has("Group Trades by Day")) {
      const m = new Map<string, Row>();
      sorted.forEach((t) => {
        const k = localDay(t.entry_at);
        const p = m.get(k) ?? {
          pnl: 0,
          gross: 0,
          r: 0,
          tilt: 0,
          label: k,
          n: 0,
          t: new Date(`${k}T00:00:00`).getTime(),
        };
        p.pnl += t.net_pnl;
        p.gross += t.net_pnl + t.fees;
        p.r += t.r ?? 0;
        p.tilt += t.tilt;
        p.n++;
        m.set(k, p);
      });
      rows = [...m.values()];
    }
    const netTotals = cumulative(rows.map((row) => row.pnl));
    const grossTotals = cumulative(rows.map((row) => row.gross));
    const rTotals = cumulative(rows.map((row) => row.r));
    const tiltTotals = cumulative(rows.map((row) => row.tilt));
    // Each step's return is measured against the balance before it, so these sums are built in order.
    const pctSums: number[] = [];
    const pctSumsGross: number[] = [];
    let pctSum = 0,
      pctSumG = 0;
    rows.forEach((row, i) => {
      const balBefore = start + (netTotals[i - 1] ?? 0);
      pctSum += balBefore ? (row.pnl / balBefore) * 100 : 0;
      pctSumG += balBefore ? (row.gross / balBefore) * 100 : 0;
      pctSums.push(pctSum);
      pctSumsGross.push(pctSumG);
    });
    const out = rows.map((row, i) => {
      const c = netTotals[i]!,
        g = grossTotals[i]!,
        r = rTotals[i]!,
        tiltSum = tiltTotals[i]!,
        ps = pctSums[i]!,
        psg = pctSumsGross[i]!;
      const pick = (net: number, gross: number, pctNet: number, pctGross: number) => {
        switch (display) {
          case "Account Balance ($)":
            return [start + net, start + gross];
          case "Return, gain sum (%)":
            return [pctNet, pctGross];
          case "Return, ROI (%)":
            return [start ? (net / start) * 100 : 0, start ? (gross / start) * 100 : 0];
          case "R Multiple (R)":
            return [r, r];
          default:
            return [net, gross];
        }
      };
      const [v, v2] = pick(c, g, ps, psg);
      return {
        x: xm === "date" ? row.t : i + 1,
        v: +v.toFixed(2),
        v2: opts.has("Display Value Without Fees") ? +v2.toFixed(2) : undefined,
        tilt: opts.has("Display Tiltmeter") ? tiltSum : undefined,
        label: row.label,
        id: row.id,
      };
    });
    const ma = (n: number) =>
      out.map((_, i) =>
        i >= n - 1
          ? +(out.slice(i - n + 1, i + 1).reduce((a, p) => a + p.v, 0) / n).toFixed(2)
          : undefined,
      );
    const m20 = opts.has("Moving Average (20)") ? ma(20) : [];
    const m50 = opts.has("Moving Average (50)") ? ma(50) : [];
    return out.map((p, i) => ({ ...p, ma20: m20[i], ma50: m50[i] }));
  }, [trades, start, display, opts, xm]);

  const stats: Record<(typeof EQUITY_STAT_LABELS)[number], ReactNode> = {
    Trades: s.count,
    Winners: s.wins,
    Losers: s.losses,
    "Winrate (%)": fmtNum(s.winRate),
    "Avg. P&L": fmtMoney(s.avgPnl, cur),
    "Profit Factor": fmtNum(s.profitFactor),
    "Return (%)": s.roi.toFixed(2),
    "Biggest Winner": fmtMoney(s.biggestWin, cur),
    "Biggest Loser": fmtMoney(s.biggestLoss, cur),
    "Profit/Loss": fmtMoney(s.net, cur),
  };
  const unit = display.match(/\((.+)\)/)?.[1] ?? "$";

  return (
    <div className="space-y-[22px]">
      <section className="rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
        <EquityControls
          display={display}
          opts={opts}
          xMode={xm}
          onDisplayChange={setDisplay}
          onToggle={toggle}
          onXModeChange={setXm}
        />
        <div className={EQUITY_CHART_BOX}>
          <EquityChart
            data={data}
            height="100%"
            baseline={display === "Account Balance ($)" ? start : 0}
            xLabel={xm === "date" ? "Date" : has("Group Trades by Day") ? "Days" : "Trades"}
            xMode={xm}
            yLabel={display}
            valueName={display}
            value2Name={`${display} (without fees)`}
            showTilt={has("Display Tiltmeter")}
            onPointClick={(p) => {
              const t = trades.find((x) => x.id === p.id);
              if (t) drawer.open(t);
            }}
            fmt={(n) =>
              unit === "$" ? fmtMoney(n, cur) : unit === "R" ? `${fmtNum(n)}R` : `${fmtNum(n)}%`
            }
          />
        </div>
      </section>

      <StatGrid>
        {EQUITY_STAT_LABELS.map((label) => (
          <AccentStat key={label} label={label} value={stats[label]} />
        ))}
      </StatGrid>
    </div>
  );
}
