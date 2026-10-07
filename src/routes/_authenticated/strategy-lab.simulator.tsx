import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, Panel, Stat, axis, tooltipStyle, tradeAxis, yRange } from "@/components/kit";
import { useTrades } from "@/lib/journal-context";
import { computeStats, fmtMoney, fmtNum } from "@/lib/metrics";

export const Route = createFileRoute("/_authenticated/strategy-lab/simulator")({
  head: () => ({ meta: [{ title: "Simulator — AlphaMine" }, { name: "description", content: "Monte Carlo simulation of future account growth." }, { property: "og:title", content: "Simulator — AlphaMine" }, { property: "og:description", content: "Monte Carlo simulation of future account growth." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Simulator,
});

const SHOWN = 20;
const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)", "var(--color-chart-1)"];

function Simulator() {
  const { trades, journal } = useTrades();
  const base = computeStats(trades, journal?.starting_balance ?? 10000);
  const cur = journal?.currency;
  const [p, setP] = useState({ balance: 10000, winRate: 50, avgWin: 150, avgLoss: 100, sims: 100, trades: 100 });
  const [seed, setSeed] = useState(0);

  // Prefill from the journal: measured avg win / avg loss in currency, not an assumed 1R loss.
  useEffect(() => {
    if (!trades.length) return;
    const wins = trades.filter((t) => t.net_pnl > 0).map((t) => t.net_pnl);
    const losses = trades.filter((t) => t.net_pnl < 0).map((t) => -t.net_pnl);
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    setP((x) => ({
      ...x,
      balance: Math.round(base.balance),
      winRate: +base.winRate.toFixed(1),
      avgWin: +(avg(wins) || x.avgWin).toFixed(2),
      avgLoss: +(avg(losses) || x.avgLoss).toFixed(2),
    }));
  }, [trades.length]);

  const sim = useMemo(() => {
    const paths: number[][] = [];
    let longestWin = 0, longestLoss = 0, winners = 0, losers = 0;
    for (let k = 0; k < p.sims; k++) {
      let bal = p.balance, ws = 0, ls = 0;
      const path = [bal];
      for (let i = 0; i < p.trades; i++) {
        if (Math.random() * 100 < p.winRate) { bal += p.avgWin; winners++; ws++; ls = 0; }
        else { bal -= p.avgLoss; losers++; ls++; ws = 0; }
        longestWin = Math.max(longestWin, ws); longestLoss = Math.max(longestLoss, ls);
        path.push(+bal.toFixed(2));
      }
      paths.push(path);
    }
    const finals = paths.map((x) => x[x.length - 1]).sort((a, b) => a - b);
    const dd = paths.map((x) => { let peak = x[0], m = 0; x.forEach((v) => { peak = Math.max(peak, v); m = Math.max(m, peak > 0 ? (peak - v) / peak : 0); }); return m * 100; }).sort((a, b) => a - b);
    const chart = Array.from({ length: p.trades + 1 }, (_, i) => { const row: Record<string, number> = { i }; paths.slice(0, SHOWN).forEach((x, k) => (row[`p${k}`] = x[i])); return row; });
    return { finals, dd, chart, longestWin, longestLoss, winners, losers, profitable: finals.filter((f) => f > p.balance).length / Math.max(1, p.sims) * 100 };
  }, [p, seed]);

  const pct = (a: number[], q: number) => a[Math.floor((a.length - 1) * q)] ?? 0;
  const num = (k: keyof typeof p, min = 0, max = Infinity) => (e: { target: { value: string } }) => setP({ ...p, [k]: Math.min(max, Math.max(min, Number(e.target.value))) });
  const exp = (p.winRate / 100) * p.avgWin - (1 - p.winRate / 100) * p.avgLoss;
  const total = sim.winners + sim.losers || 1;

  return (
    <div className="space-y-5">
      <PageHeader title="Simulator" subtitle={`Monte Carlo: ${p.sims} randomized futures based on your win rate and average win/loss.`} action={<Button variant="outline" onClick={() => setSeed(seed + 1)}>Re-run</Button>} />
      <div className="grid gap-5 grid-cols-[300px_1fr]">
        <Panel title="Inputs">
          <div className="space-y-3">
            <div><Label className="text-xs">Win rate (%)</Label><Input type="number" value={p.winRate} onChange={num("winRate", 0, 100)} /></div>
            <div><Label className="text-xs">Average gain ({cur ?? "USD"})</Label><Input type="number" step="0.01" value={p.avgWin} onChange={num("avgWin")} /></div>
            <div><Label className="text-xs">Average loss ({cur ?? "USD"})</Label><Input type="number" step="0.01" value={p.avgLoss} onChange={num("avgLoss")} /></div>
            <div><Label className="text-xs">Starting balance</Label><Input type="number" value={p.balance} onChange={num("balance")} /></div>
            <div><Label className="text-xs">Number of simulations</Label><Input type="number" value={p.sims} onChange={num("sims", 1, 1000)} /></div>
            <div><Label className="text-xs">Trades per simulation</Label><Input type="number" value={p.trades} onChange={num("trades", 1, 1000)} /></div>
            <p className="text-xs text-muted-foreground">Prefilled from your journal. Expectancy: <b>{fmtMoney(exp, cur)}</b> per trade.</p>
          </div>
        </Panel>
        <Panel title={`Sample of ${Math.min(SHOWN, p.sims)} simulated equity paths`}>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={sim.chart}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="i" tick={axis} tickLine={false} axisLine={false} {...tradeAxis(p.trades)} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={70} {...yRange(sim.chart as Record<string, number>[])} />
              <Tooltip {...tooltipStyle} />
              {Array.from({ length: Math.min(SHOWN, p.sims) }, (_, k) => <Line key={k} dataKey={`p${k}`} stroke={COLORS[k % COLORS.length]} strokeOpacity={0.6} dot={false} strokeWidth={1} isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <div className="grid gap-5 grid-cols-4">
        <Panel title="Longest winning streak"><Stat label="Trades in a row" value={sim.longestWin} tone="pos" /></Panel>
        <Panel title="Longest losing streak"><Stat label="Trades in a row" value={sim.longestLoss} tone="neg" /></Panel>
        <Panel title="Winners"><Stat label="Total" value={sim.winners} tone="pos" /><Stat label="Share" value={`${fmtNum(sim.winners / total * 100, 1)}%`} /></Panel>
        <Panel title="Losers"><Stat label="Total" value={sim.losers} tone="neg" /><Stat label="Share" value={`${fmtNum(sim.losers / total * 100, 1)}%`} /></Panel>
      </div>
      <div className="grid gap-5 grid-cols-2">
        <Panel title="Final balance">
          <Stat label="Worst 5%" value={fmtMoney(pct(sim.finals, 0.05), cur)} tone="neg" />
          <Stat label="Median" value={fmtMoney(pct(sim.finals, 0.5), cur)} />
          <Stat label="Best 5%" value={fmtMoney(pct(sim.finals, 0.95), cur)} tone="pos" />
          <Stat label="Chance of profit" value={`${fmtNum(sim.profitable, 1)}%`} />
        </Panel>
        <Panel title="Maximum drawdown">
          <Stat label="Median" value={`${fmtNum(pct(sim.dd, 0.5), 1)}%`} />
          <Stat label="Worst 5%" value={`${fmtNum(pct(sim.dd, 0.95), 1)}%`} tone="neg" />
          <Stat label="Worst case" value={`${fmtNum(sim.dd[sim.dd.length - 1] ?? 0, 1)}%`} tone="neg" />
        </Panel>
      </div>
    </div>
  );
}
