import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EquityChart, Panel, axis, tooltipStyle } from "@/components/kit";
import { useJournal, useTrades } from "@/lib/journal-context";
import { useJournalTable } from "@/lib/crud";
import { computeStats, fmtMoney, fmtNum } from "@/lib/metrics";
import { missedMetrics } from "./missed-trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/missed-trades-analysis")({
  head: () => ({ meta: [{ title: "Missed Trades Analysis — AlphaMine" }, { name: "description", content: "Compare your missed trades with the trades you actually took." }, { property: "og:title", content: "Missed Trades Analysis — AlphaMine" }, { property: "og:description", content: "Compare your missed trades with the trades you actually took." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Analysis,
});

type Unit = "cur" | "pct" | "r";
type Item = { pnl: number; r: number | null; rPlanned: number | null; at: string };

function block(items: Item[], start: number) {
  const sorted = [...items].sort((a, b) => a.at.localeCompare(b.at));
  const wins = sorted.filter((i) => i.pnl > 0), losses = sorted.filter((i) => i.pnl < 0);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);
  const rs = sorted.map((i) => i.r).filter((x): x is number => x != null);
  const rp = sorted.map((i) => i.rPlanned).filter((x): x is number => x != null);
  let c = 0, peak = 0, dd = 0;
  sorted.forEach((i) => { c += i.pnl; peak = Math.max(peak, c); dd = Math.min(dd, start ? ((c - peak) / (start + peak)) * 100 : 0); });
  const gw = sum(wins.map((w) => w.pnl)), gl = Math.abs(sum(losses.map((l) => l.pnl)));
  return {
    rrr: avg(rp), avgR: avg(rs), sumR: sum(rs), avgPnl: avg(sorted.map((i) => i.pnl)),
    winPerf: start ? (avg(wins.map((w) => w.pnl)) / start) * 100 : 0, lossPerf: start ? (avg(losses.map((l) => l.pnl)) / start) * 100 : 0,
    ret: start ? (sum(sorted.map((i) => i.pnl)) / start) * 100 : 0, dd, pf: gl ? gw / gl : gw ? Infinity : 0, net: sum(sorted.map((i) => i.pnl)),
  };
}

function Analysis() {
  const { journal } = useJournal();
  const { trades } = useTrades();
  const missed = useJournalTable("missed_trades", journal?.id, "occurred_at", true);
  const categories = useJournalTable("custom_stat_categories", journal?.id, "position", true);
  const options = useJournalTable("custom_stat_options", journal?.id, "position", true);
  const [category, setCategory] = useState("");
  const links = useQuery({ queryKey: ["missed_trade_custom_stats", journal?.id], enabled: !!journal, queryFn: async () => { const { data, error } = await supabase.from("missed_trade_custom_stats").select("missed_trade_id,option_id").eq("journal_id", journal?.id ?? ""); if (error) throw error; return data; } });
  const [unit, setUnit] = useState<Unit>("cur");
  const start = journal?.starting_balance ?? 0;
  const cur = journal?.currency ?? "USD";

  const mItems: Item[] = useMemo(() => missed.rows.map((m) => { const x = missedMetrics(m); return { pnl: Number(m.net_pnl) || 0, r: x.rMultiple, rPlanned: x.rPlanned, at: m.occurred_at }; }), [missed.rows]);
  const rItems: Item[] = useMemo(() => trades.map((t) => ({
    pnl: t.net_pnl, r: t.r, at: t.entry_at,
    rPlanned: t.stop_loss != null && t.take_profit != null && t.entry_price !== t.stop_loss ? Math.abs(t.take_profit - t.entry_price) / Math.abs(t.entry_price - t.stop_loss) : null,
  })), [trades]);
  const M = block(mItems, start), R = block(rItems, start), C = block([...mItems, ...rItems], start);
  const conv = (pnl: number, r: number | null) => (unit === "r" ? r ?? 0 : unit === "pct" ? (start ? (pnl / start) * 100 : 0) : pnl);
  const fmt = (v: number) => (unit === "r" ? `${fmtNum(v)}R` : unit === "pct" ? `${fmtNum(v)}%` : fmtMoney(v, cur));

  let c = 0;
  const curve = [...mItems].sort((a, b) => a.at.localeCompare(b.at)).map((i, k) => ({ x: k + 1, v: +(c += conv(i.pnl, i.r)).toFixed(2) }));
  const vs = [
    { k: "Missed", v: +mItems.reduce((a, i) => a + conv(i.pnl, i.r), 0).toFixed(2) },
    { k: "Real", v: +rItems.reduce((a, i) => a + conv(i.pnl, i.r), 0).toFixed(2) },
  ];
  vs.push({ k: "Total", v: +(vs[0].v + vs[1].v).toFixed(2) });
  const selectedCategory = category || categories.rows.find((c) => c.name === "Missed Trades")?.id || categories.rows[0]?.id || "";
  const tagData = options.rows.filter((o) => o.category_id === selectedCategory).map((o) => ({ k: o.label, v: (links.data ?? []).filter((l) => l.option_id === o.id && missed.rows.some((m) => m.id === l.missed_trade_id)).length })).sort((a, b) => b.v - a.v);
  const s = computeStats(trades, start);

  const rows: [string, (b: ReturnType<typeof block>) => string][] = [
    ["Avg. RRR Planned", (b) => fmtNum(b.rrr)], ["Avg. R - Multiple", (b) => fmtNum(b.avgR)], ["Sum. R - Multiple", (b) => fmtNum(b.sumR)],
    ["Avg. P&L (Avg. Trade)", (b) => fmtMoney(b.avgPnl, cur)], ["Avg. Winner Performance", (b) => `${fmtNum(b.winPerf)}%`], ["Avg. Loser Performance", (b) => `${fmtNum(b.lossPerf)}%`],
    ["Return", (b) => `${fmtNum(b.ret)}%`], ["Max. Drawdown", (b) => `${fmtNum(b.dd)}%`], ["Profit Factor", (b) => fmtNum(b.pf)],
  ];

  return (
    <div className="space-y-5">
      <div className="inline-flex overflow-hidden rounded-lg border text-xs font-medium">
        {([["cur", `Currency (${cur})`], ["pct", "Return (%)"], ["r", "R Multiple"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setUnit(k)} className={cn("px-3 py-1.5", unit === k && "bg-ink text-ink-foreground")}>{l}</button>
        ))}
      </div>
      <div className="grid gap-5 grid-cols-2">
        <Panel title="Performance by Missed Trades">
          {curve.length ? <EquityChart data={curve} height={280} fmt={fmt} valueName="Missed" /> : <NoData />}
        </Panel>
        <Panel title="Missed vs. Real Performance">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={vs} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="k" tick={axis} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} />
              <YAxis tick={axis} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} tickFormatter={(v: number) => v.toLocaleString("de-DE")} />
              <Tooltip {...tooltipStyle} formatter={(v) => fmt(Number(v))} cursor={{ fill: "var(--color-muted)" }} />
              <Bar dataKey="v" name="Return" maxBarSize={180} isAnimationActive={false}>{vs.map((d) => <Cell key={d.k} fill={d.v >= 0 ? "var(--color-profit)" : "var(--color-loss)"} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Missed Trades Custom Stats">
          <div className="mb-3 flex flex-wrap gap-1">{categories.rows.map((c) => <Button key={c.id} size="sm" variant={selectedCategory === c.id ? "secondary" : "ghost"} onClick={() => setCategory(c.id)}>{c.name}</Button>)}</div>
          {tagData.length ? (
            <ResponsiveContainer width="100%" height={280}>
               <BarChart data={tagData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="k" tick={axis} tickLine={false} interval={0} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 12)}…` : v)} axisLine={{ stroke: "var(--color-border)" }} />
                <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "var(--color-muted)" }} />
                <Bar dataKey="v" name="Missed trades" fill="var(--color-profit)" maxBarSize={140} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : <NoData />}
        </Panel>
        <Panel title="Missed vs. Real Comparison">
          <table className="w-full text-sm tabular">
            <thead><tr className="text-right"><th /><th className="border-l px-3 py-2 font-medium">Missed</th><th className="border-l px-3 font-medium">Real</th><th className="border-l px-3 font-medium">Combined</th></tr></thead>
            <tbody>
              {rows.map(([l, f]) => (
                <tr key={l} className="text-right">
                  <td className="py-1.5 pr-3 text-left">{l}</td>
                  <td className="border-l border-t px-3">{f(M)}</td><td className="border-l border-t px-3">{f(R)}</td><td className="border-l border-t px-3">{f(C)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">Real trades: {s.count} · Missed trades: {missed.rows.length}</p>
        </Panel>
      </div>
    </div>
  );
}

function NoData() {
  return <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">Log missed trades to see this chart.</div>;
}
