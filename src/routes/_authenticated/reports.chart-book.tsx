import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useJournalTable } from "@/lib/crud";
import { Button } from "@/components/ui/button";
import { useScreenshots } from "@/components/Screenshots";
import { useTradeDrawer } from "@/components/TradeDrawer";
import { useTrades } from "@/lib/journal-context";
import { fmtMoney } from "@/lib/metrics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports/chart-book")({
  head: () => ({ meta: [{ title: "Chart Book — AlphaMine" }, { name: "description", content: "Browse screenshots by trade." }, { property: "og:title", content: "Chart Book — AlphaMine" }, { property: "og:description", content: "Browse screenshots by trade." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ChartBook,
});

function ChartBook() {
  const { trades, journal } = useTrades();
  const { data: shots = [] } = useScreenshots(journal?.id);
  const missed = useJournalTable("missed_trades", journal?.id, "occurred_at", false);
  const plans = useJournalTable("planned_trades", journal?.id, "entry_at", false);
  const drawer = useTradeDrawer();
  const [selected, setSelected] = useState<string | null>(null);
  const [group, setGroup] = useState<"trades" | "missed" | "plans">("trades");
  const withShots = useMemo(() => trades.filter((t) => shots.some((s) => s.trade_id === t.id)), [trades, shots]);
  const missedShots = missed.rows.filter((m) => shots.some((s) => s.missed_trade_id === m.id));
  const planShots = plans.rows.filter((p) => shots.some((s) => s.planned_trade_id === p.id));
  const entries = group === "trades" ? withShots : group === "missed" ? missedShots : planShots;
  const active = entries.find((t) => t.id === selected) ?? entries[0];
  const images = shots.filter((s) => (group === "trades" ? s.trade_id : group === "missed" ? s.missed_trade_id : s.planned_trade_id) === active?.id);
  const realTrade = group === "trades" ? withShots.find((t) => t.id === active?.id) : undefined;
  return <div className="grid min-h-[calc(100vh-7rem)] gap-4 grid-cols-[320px_minmax(0,1fr)]">
    <aside className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-md bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap gap-1">{([ ["trades", "Journal Trades", withShots.length], ["missed", "Missed Trades", missedShots.length], ["plans", "Trading Plans", planShots.length] ] as const).map(([key, label, count]) => <Button key={key} variant={group === key ? "secondary" : "ghost"} size="sm" onClick={() => { setGroup(key); setSelected(null); }}>{label} ({count})</Button>)}</div>
      {entries.map((t) => { const ret = "retPct" in t ? Number(t.retPct) : 0; return <button type="button" key={t.id} onClick={() => setSelected(t.id)} className={cn("mb-3 grid w-full gap-3 rounded-md border bg-card p-4 text-left text-xs transition-colors hover:bg-muted/40", active?.id === t.id && "border-ink") }>
        <span className="flex justify-between"><span className="text-muted-foreground">{group === "trades" ? "Trade ID" : "Record"}: <strong className="text-foreground">{"trade_no" in t ? String(t.trade_no) : t.id.slice(0, 7)}</strong></span>{group !== "plans" && <strong className={"net_pnl" in t && Number(t.net_pnl) < 0 ? "text-loss" : "text-profit"}>{ret.toFixed(2)}%</strong>}</span>
        <span className="flex justify-between"><span className="text-muted-foreground">Setup:</span><strong>{t.setup || "—"}</strong></span>
        <span className="flex justify-between"><span className="text-muted-foreground">Direction:</span><span className={cn("rounded px-2 py-0.5 capitalize", t.direction === "long" ? "bg-profit-soft text-profit" : "bg-loss-soft text-loss")}>{t.direction}</span></span>
        <span className="flex justify-between"><span className="text-muted-foreground">{group === "missed" ? "Occurred" : "Entry"}:</span><strong>{("entry_at" in t ? t.entry_at : t.occurred_at).slice(0, 16).replace("T", " ")}</strong></span>
        <span className="flex justify-between"><span className="text-muted-foreground">Instrument:</span><strong>{t.instrument}</strong></span>
      </button>; })}
      {!entries.length && <p className="text-sm text-muted-foreground">No screenshots in this category yet.</p>}
    </aside>
    <section className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-md bg-card p-5 shadow-sm">
      {active ? <>
        <div className="mb-5 flex items-center justify-between border-b pb-3"><div className="font-semibold">{active.instrument} · {("entry_at" in active ? active.entry_at : active.occurred_at).slice(0, 10)}</div>{realTrade && <Button variant="outline" size="sm" onClick={() => drawer.open(realTrade)}>Open trade</Button>}</div>
        {images.map((s) => <div key={s.id} className="mb-8 border-b pb-8"><a href={s.url} target="_blank" rel="noreferrer"><img src={s.url} alt={`${active.instrument} trade chart`} className="w-full object-contain" /></a><p className="mt-5 min-h-12 text-center text-sm text-muted-foreground">{s.caption || "No screenshot description"}</p></div>)}
      </> : <div className="py-24 text-center text-sm text-muted-foreground">Add screenshots to a trade to see them here.</div>}
    </section>
  </div>;
}
