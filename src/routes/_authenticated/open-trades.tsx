import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Empty, PageHeader, Panel, Stat, pnlTone } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTradeDrawer } from "@/components/journal/TradeDrawer";
import { useJournal, useTrades } from "@/lib/journal/journal-context";
import { fmtMoney, fmtNum } from "@/lib/pnl/metrics";
import { openRow, openTotals } from "@/lib/pnl/open-trades";
import { pnlText } from "@/components/kit";

export const Route = createFileRoute("/_authenticated/open-trades")({
  head: () => ({ meta: [{ title: "Open Trades — AlphaMine" }, { name: "description", content: "Open positions: size, stop, target, risk and what-if results." }] }),
  component: OpenTradesPage,
});

function OpenTradesPage() {
  const { open, journal } = useTrades({ unfiltered: true, includeOpen: true });
  const drawer = useTradeDrawer();
  const { journal: j } = useJournal();
  const key = `am.openprices.${j?.id ?? ""}`;
  const [prices, setPrices] = useState<Record<string, string>>({});
  useEffect(() => { try { setPrices(JSON.parse(localStorage.getItem(key) ?? "{}")); } catch { setPrices({}); } }, [key]);
  const setPrice = (id: string, v: string) => setPrices((p) => { const n = { ...p, [id]: v }; try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const cur = journal?.currency ?? "USD";
  const rows = useMemo(() => open.map((t) => openRow(t, prices[t.id]?.trim() ? Number(prices[t.id]) : null)), [open, prices]);
  const tot = openTotals(rows);
  const byInst = useMemo(() => { const m = new Map<string, { risk: number; exposure: number; n: number }>(); for (const r of rows) { const k = `${r.trade.instrument} ${r.trade.direction}`; const c = m.get(k) ?? { risk: 0, exposure: 0, n: 0 }; c.risk += r.risk ?? 0; c.exposure += r.exposure; c.n++; m.set(k, c); } return [...m.entries()]; }, [rows]);
  if (!journal) return null;
  return (
    <div>
      <PageHeader title="Open Trades" subtitle="Positions without an exit. They stay out of every statistic until you close them." action={<Button variant="ink" onClick={() => drawer.open()}>Add Trade</Button>} />
      {rows.length === 0 ? <Empty>No open trades. Tick "Trade is still open" when adding a trade.</Empty> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Open trades" value={tot.n} />
            <Stat label="Risk if all stops hit" value={fmtMoney(tot.risk, cur)} tone="neg" />
            <Stat label="Exposure" value={fmtMoney(tot.exposure, cur)} />
            <Stat label="Unrealized (at your prices)" value={tot.unrealized == null ? "Enter prices" : fmtMoney(tot.unrealized, cur)} tone={tot.unrealized == null ? undefined : pnlTone(tot.unrealized)} />
          </div>
          {tot.unpriced > 0 && <p className="mb-3 text-xs text-muted-foreground">{tot.unpriced} trade{tot.unpriced === 1 ? " has" : "s have"} no stop or risk amount, so their risk is not counted.</p>}
          <Panel title="Positions">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-xs text-muted-foreground">{["Instrument", "Side", "Opened", "Size", "Entry", "Stop", "Target", "Risk", "Plan R:R", "Current price", "Unrealized", "R", "If stop", "If target", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.trade.id} className="border-t">
                      <td className="px-2 py-2">{r.trade.instrument}</td>
                      <td className="px-2 capitalize">{r.trade.direction}</td>
                      <td className="px-2 tabular">{r.trade.entry_at.slice(0, 10)} <span className="text-xs text-muted-foreground">({fmtNum(r.ageDays, 1)}d)</span></td>
                      <td className="px-2 tabular">{fmtNum(Number(r.trade.quantity))}</td>
                      <td className="px-2 tabular">{fmtNum(Number(r.trade.entry_price), 3)}</td>
                      <td className="px-2 tabular">{r.trade.stop_loss ?? "—"}</td>
                      <td className="px-2 tabular">{r.trade.take_profit ?? "—"}</td>
                      <td className="px-2 tabular">{r.risk == null ? "—" : fmtMoney(r.risk, cur)}</td>
                      <td className="px-2 tabular">{r.plannedRR == null ? "—" : `${fmtNum(r.plannedRR)}R`}</td>
                      <td className="px-2"><Input value={prices[r.trade.id] ?? ""} onChange={(e) => setPrice(r.trade.id, e.target.value)} placeholder="Price" aria-label={`Current price for ${r.trade.instrument}`} className="h-8 w-24" /></td>
                      <td className={`px-2 tabular ${r.unrealized == null ? "" : pnlText(r.unrealized)}`}>{r.unrealized == null ? "—" : fmtMoney(r.unrealized, cur)}</td>
                      <td className="px-2 tabular">{r.unrealizedR == null ? "—" : `${fmtNum(r.unrealizedR)}R`}</td>
                      <td className="px-2 tabular text-loss">{r.atStop == null ? "—" : fmtMoney(r.atStop, cur)}</td>
                      <td className="px-2 tabular text-profit">{r.atTarget == null ? "—" : fmtMoney(r.atTarget, cur)}</td>
                      <td className="px-2"><Button size="sm" variant="secondary" onClick={() => drawer.open(r.trade)}>Close / edit</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Prices are kept in this browser only; unrealized figures ignore fees and are for planning, not recorded results.</p>
          </Panel>
          <div className="mt-4"><Panel title="Exposure by instrument and side">
            <table className="w-full text-[13px]"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Position</th><th>Trades</th><th>Risk</th><th>Exposure</th></tr></thead>
              <tbody>{byInst.map(([k, v]) => <tr key={k} className="border-t"><td className="py-1.5 capitalize">{k}</td><td>{v.n}</td><td className="tabular">{fmtMoney(v.risk, cur)}</td><td className="tabular">{fmtMoney(v.exposure, cur)}</td></tr>)}</tbody></table>
          </Panel></div>
        </>
      )}
    </div>
  );
}
