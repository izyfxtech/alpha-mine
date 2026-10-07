import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, Copy, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useJournal, useLookups } from "@/lib/journal-context";
import { useJournalTable, type Row } from "@/lib/crud";
import { supabase } from "@/integrations/supabase/client";
import { RecordScreenshots } from "@/components/Screenshots";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/missed-trades")({
  head: () => ({ meta: [{ title: "Missed Trades — AlphaMine" }, { name: "description", content: "Log the trades you saw but didn't take." }, { property: "og:title", content: "Missed Trades — AlphaMine" }, { property: "og:description", content: "Log the trades you saw but didn't take." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: MissedTrades,
});

export const MISSED_REASONS = ["Hesitation / fear", "Not at screen", "Missed alert", "Doubted setup", "Already in a trade", "Daily loss limit", "Other"];
export type Missed = Row<"missed_trades">;
const n = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** Derived numbers for a missed trade — shared with the analysis page. */
export function missedMetrics(m: Missed) {
  const e = n(m.entry_price), sl = n(m.stop_loss), tp = n(m.take_profit), q = Number(m.quantity) || 1;
  const riskPer = e != null && sl != null ? Math.abs(e - sl) : null;
  const rPlanned = riskPer && tp != null && e != null ? ((tp - e) * (m.direction === "long" ? 1 : -1)) / riskPer : null;
  const rMultiple = riskPer ? Number(m.net_pnl) / (riskPer * q) : Number(m.hypothetical_r) || null;
  return { rPlanned, rMultiple };
}

const f2 = (v: number | null | undefined, d = 2) => (v == null ? "" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const dt = (iso?: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "");

function MissedTrades() {
  const { journal } = useJournal();
  const qc = useQueryClient();
  const { data: statLinks = [] } = useQuery({ queryKey: ["missed_trade_custom_stats", journal?.id], enabled: !!journal, queryFn: async () => { const { data, error } = await supabase.from("missed_trade_custom_stats").select("missed_trade_id,option_id").eq("journal_id", journal?.id ?? ""); if (error) throw error; return data; } });
  const { data: lk0 } = useLookups(journal?.id);
  const cats = lk0?.statCategories ?? [];
  const optionLabel = (id: string, catId: string) => (lk0?.statOptions ?? []).filter((o) => o.category_id === catId && statLinks.some((l) => l.missed_trade_id === id && l.option_id === o.id)).map((o) => o.label).join(", ");
  const refreshStats = () => qc.invalidateQueries({ queryKey: ["missed_trade_custom_stats", journal?.id] });
  const t = useJournalTable("missed_trades", journal?.id, "occurred_at");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Missed | "new" | null>(null);
  const start = journal?.starting_balance || 1;

  const dup = async () => {
    for (const r of t.rows.filter((x) => sel.has(x.id))) {
      const { id: _id, created_at: _c, ...rest } = r;
      const copy = await t.insert(rest);
      const linked = statLinks.filter((s) => s.missed_trade_id === r.id);
      if (copy && linked.length) await supabase.from("missed_trade_custom_stats").insert(linked.map((s) => ({ journal_id: r.journal_id, missed_trade_id: copy.id, option_id: s.option_id })));
    }
    refreshStats();
    setSel(new Set());
  };
  const del = async () => { if (!confirm(`Delete ${sel.size} missed trade(s)?`)) return; await Promise.all([...sel].map((id) => t.remove(id))); setSel(new Set()); };

  const heads = ["Entry Date", "Instrument", "Trade Type", "Option Type", "Setup", "Direction", "Entry Price", "Quantity", "TP Price", "SL Price", "R planned", "R-Multiple", "Exit Price", "Return ($)", "Exit Date", "Return (%)", "Expiry Date", "Multiplier", ...cats.map((c) => c.name), "Reason"];
  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col rounded-lg bg-card shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
      <div className="flex items-center gap-2.5 px-[22px] pb-3 pt-[18px]">
        <Button variant="ink" size="sm" className="h-[30px] rounded-md px-4 text-[12px]" onClick={() => setEdit("new")}>Add Trade</Button>
        <Button variant="secondary" size="sm" className="h-[30px] rounded-md px-4 text-[12px] text-t4" disabled={!sel.size} onClick={dup}><Copy className="h-4 w-4" />Duplicate</Button>
        <Button variant="secondary" size="sm" className="h-[30px] rounded-md px-4 text-[12px] text-t4" disabled={!sel.size} onClick={del}><Trash2 className="h-4 w-4" />Delete</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full whitespace-nowrap text-[11px]">
          <thead className="sticky top-0 bg-card">
            <tr className="h-[40px] border-b text-left">
              <th className="w-10 px-3 py-2.5"><Checkbox checked={!!t.rows.length && sel.size === t.rows.length} onCheckedChange={(v) => setSel(v ? new Set(t.rows.map((r) => r.id)) : new Set())} /></th>
              {heads.map((h, i) => <th key={h} className={cn("px-3 font-semibold", i >= 5 && i !== 13 && i !== 15 && "text-right")}>{h}{i === 0 && <ArrowDown className="ml-1 inline h-3 w-3" />}</th>)}
            </tr>
          </thead>
          <tbody>
            {t.rows.length === 0 && <tr><td colSpan={17} className="py-12 text-center text-sm text-muted-foreground">No missed trades yet. Log the setups you saw but didn’t take.</td></tr>}
            {t.rows.map((r) => {
              const m = missedMetrics(r);
              const pnl = Number(r.net_pnl) || 0;
              const tone = pnl > 0 ? "text-profit bg-profit-soft/20" : pnl < 0 ? "text-loss bg-loss-soft/45" : "";
              return (
                <tr key={r.id} onClick={() => setEdit(r)} className={cn("cursor-pointer h-[30px] tabular hover:brightness-95", tone)}>
                  <td className="px-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={sel.has(r.id)} onCheckedChange={() => setSel((p) => { const x = new Set(p); x.has(r.id) ? x.delete(r.id) : x.add(r.id); return x; })} />
                  </td>
                  <td className="px-3">{dt(r.occurred_at)}</td>
                  <td className="px-3">{r.instrument}</td>
                  <td className="px-3"><Pill tone={pnl}>{r.trade_type}</Pill></td>
                  <td className="px-3">{r.option_type}</td>
                  <td className="px-3">{r.setup}</td>
                  <td className="px-3"><Pill tone={pnl}>{r.direction === "long" ? "BUY" : "SELL"}</Pill></td>
                  <td className="px-3 text-right">{f2(n(r.entry_price), 3)}</td>
                  <td className="px-3 text-right">{f2(Number(r.quantity))}</td>
                  <td className="px-3 text-right">{f2(n(r.take_profit), 3)}</td>
                  <td className="px-3 text-right">{f2(n(r.stop_loss), 3)}</td>
                  <td className="px-3 text-right">{f2(m.rPlanned, 5)}</td>
                  <td className="px-3 text-right">{f2(m.rMultiple)}</td>
                  <td className="px-3 text-right">{f2(n(r.exit_price), 3)}</td>
                  <td className="px-3 text-right">{f2(pnl)}</td>
                  <td className="px-3">{dt(r.exit_at)}</td>
                  <td className="px-3 text-right">{f2((pnl / start) * 100)}</td>
                  <td className="px-3">{r.expiry_date ?? ""}</td>
                  <td className="px-3 text-right">{f2(Number(r.multiplier ?? 1))}</td>
                  {cats.map((c) => <td key={c.id} className="px-3">{optionLabel(r.id, c.id)}</td>)}
                  <td className="px-3">{r.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edit && <MissedSheet key={edit === "new" ? "new" : edit.id} row={edit === "new" ? null : edit} journalId={journal?.id} selectedStats={edit === "new" ? [] : statLinks.filter((s) => s.missed_trade_id === edit.id).map((s) => s.option_id)}
        onClose={() => setEdit(null)}
        onSave={async (v, ids) => {
          const saved = edit === "new" ? await t.insert(v) : (await t.update(edit.id, v), edit);
          if (!saved || !journal) return;
          const { error: delError } = await supabase.from("missed_trade_custom_stats").delete().eq("missed_trade_id", saved.id);
          if (delError) { toast.error(delError.message); return; }
          if (ids.length) { const { error } = await supabase.from("missed_trade_custom_stats").insert(ids.map((option_id) => ({ missed_trade_id: saved.id, option_id, journal_id: journal.id }))); if (error) { toast.error(error.message); return; } }
          await refreshStats(); setEdit(null);
        }} />}
    </div>
  );
}

function Pill({ tone, children }: { tone: number; children: React.ReactNode }) {
  return <span className={cn("rounded-md px-2 py-0.5", tone > 0 ? "bg-profit-soft" : tone < 0 ? "bg-loss-soft" : "bg-muted")}>{children}</span>;
}

export function MissedSheet({ row, journalId, onClose, onSave, title, selectedStats = [] }: { row: Partial<Missed> | null; title?: string; journalId?: string; selectedStats?: string[]; onClose: () => void; onSave: (v: Partial<Missed>, stats: string[]) => Promise<void> }) {
  const { data: lk } = useLookups(journalId); const instruments = lk?.instruments ?? [], setups = lk?.setups ?? [];
  const [stats, setStats] = useState<string[]>(selectedStats);
  const s = (v: unknown) => (v == null ? "" : String(v));
  const [f, setF] = useState({
    occurred_at: (row?.occurred_at ?? new Date().toISOString()).slice(0, 16), exit_at: s(row?.exit_at).slice(0, 16),
    instrument: s(row?.instrument), setup: s(row?.setup), direction: row?.direction ?? "long", trade_type: row?.trade_type ?? "Spot",
    entry_price: s(row?.entry_price), exit_price: s(row?.exit_price), quantity: s(row?.quantity ?? 1), take_profit: s(row?.take_profit), stop_loss: s(row?.stop_loss),
    net_pnl: s(row?.net_pnl ?? ""), reason: row?.reason ?? MISSED_REASONS[0], notes: s(row?.notes),
    option_type: s(row?.option_type), expiry_date: s(row?.expiry_date), multiplier: s(row?.multiplier ?? 1),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const auto = () => {
    const e = n(f.entry_price), x = n(f.exit_price), q = n(f.quantity) ?? 1;
    return e != null && x != null ? +((x - e) * q * (f.direction === "long" ? 1 : -1)).toFixed(2) : 0;
  };
  const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";
  const F = ({ l, k, type = "text", list }: { l: string; k: keyof typeof f; type?: string; list?: string }) => (
    <div className="space-y-1"><Label className="text-xs">{l}</Label><Input type={type} step="any" list={list} value={f[k]} onChange={set(k)} /></div>
  );
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px] [&>button]:hidden">
        <div className="flex items-center justify-between px-5 py-4"><SheetTitle className="text-base">{title ?? (row?.id ? "Edit Missed Trade" : "New Missed Trade")}</SheetTitle><button onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto px-5 pb-5">
          <datalist id="mt-inst">{instruments.map((i) => <option key={i.id} value={i.symbol} />)}</datalist>
          <datalist id="mt-setup">{setups.map((i) => <option key={i.id} value={i.name} />)}</datalist>
          <F l="Instrument" k="instrument" list="mt-inst" />
          <div className="space-y-1"><Label className="text-xs">Direction</Label><select className={sel} value={f.direction} onChange={set("direction")}><option value="long">Buy</option><option value="short">Sell</option></select></div>
          <F l="Entry Date" k="occurred_at" type="datetime-local" /><F l="Exit Date" k="exit_at" type="datetime-local" />
          <F l="Entry Price" k="entry_price" type="number" /><F l="Exit Price" k="exit_price" type="number" />
          <F l="Quantity" k="quantity" type="number" />
          <div className="space-y-1"><Label className="text-xs">Trade Type</Label><select className={sel} value={f.trade_type} onChange={set("trade_type")}>{["Spot", "Futures", "Options", "CFD"].map((x) => <option key={x}>{x}</option>)}</select></div>
          <F l="TP Price" k="take_profit" type="number" /><F l="SL Price" k="stop_loss" type="number" />
          {f.trade_type === "Options" && <div className="space-y-1"><Label className="text-xs">Option Type</Label><select className={sel} value={f.option_type} onChange={set("option_type")}><option value="">–</option><option>Call</option><option>Put</option></select></div>}
          {f.trade_type === "Options" && <F l="Expiry Date" k="expiry_date" type="date" />}
          <F l="Multiplier" k="multiplier" type="number" />
          <F l="Setup" k="setup" list="mt-setup" />
          <div className="space-y-1"><Label className="text-xs">Return ($)</Label><Input type="number" step="any" placeholder={String(auto())} value={f.net_pnl} onChange={set("net_pnl")} /></div>
          <div className="col-span-2 space-y-1"><Label className="text-xs">Why did you miss it?</Label><select className={sel} value={f.reason} onChange={set("reason")}>{MISSED_REASONS.map((x) => <option key={x}>{x}</option>)}</select></div>
          <div className="col-span-2 space-y-3 border-t pt-3"><p className="text-sm font-semibold">Custom Statistics</p>{(lk?.statCategories ?? []).map((cat) => <div key={cat.id} className="space-y-1"><Label className="text-xs">{cat.name}</Label><select aria-label={cat.name} className={sel} value={(lk?.statOptions ?? []).filter((o) => o.category_id === cat.id).find((o) => stats.includes(o.id))?.id ?? ""} onChange={(e) => setStats((old) => [...old.filter((id) => !(lk?.statOptions ?? []).some((o) => o.category_id === cat.id && o.id === id)), ...(e.target.value ? [e.target.value] : [])])}><option value="">None</option>{(lk?.statOptions ?? []).filter((o) => o.category_id === cat.id).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>)}</div>
          <div className="col-span-2 space-y-1"><Label className="text-xs">Notes</Label><textarea rows={4} className="w-full rounded-md border bg-background p-2 text-sm" value={f.notes} onChange={set("notes")} /></div>
           {row?.id && journalId && <RecordScreenshots journalId={journalId} recordId={row.id} kind="missed_trade_id" />}
        </div>
        <div className="flex gap-2 border-t px-5 py-4">
          <Button variant="ink" size="sm" disabled={!f.instrument} onClick={() => {
            const pnl = f.net_pnl === "" ? auto() : Number(f.net_pnl);
            onSave({
              occurred_at: new Date(f.occurred_at).toISOString(), exit_at: f.exit_at ? new Date(f.exit_at).toISOString() : null,
              instrument: f.instrument, setup: f.setup || null, direction: f.direction, trade_type: f.trade_type,
              entry_price: n(f.entry_price), exit_price: n(f.exit_price), quantity: n(f.quantity) ?? 1, take_profit: n(f.take_profit), stop_loss: n(f.stop_loss),
              net_pnl: pnl, reason: f.reason, notes: f.notes || null,
              option_type: f.trade_type === "Options" ? f.option_type || null : null, expiry_date: f.trade_type === "Options" ? f.expiry_date || null : null, multiplier: n(f.multiplier) ?? 1,
              hypothetical_r: (() => { const e = n(f.entry_price), sl = n(f.stop_loss), q = n(f.quantity) ?? 1; return e != null && sl != null && e !== sl ? +(pnl / (Math.abs(e - sl) * q)).toFixed(2) : 0; })(),
            }, stats);
          }}>Save</Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
