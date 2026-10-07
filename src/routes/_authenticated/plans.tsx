import { createFileRoute } from "@tanstack/react-router";
import { RecordScreenshots } from "@/components/Screenshots";
import { useState } from "react";
import { ArrowDown, CalendarPlus, Copy, Inbox, RotateCw, Trash2, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useJournal, useLookups } from "@/lib/journal-context";
import { useJournalTable, type Row } from "@/lib/crud";
import { useTradeDrawer } from "@/components/TradeDrawer";
import { MissedSheet } from "./missed-trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({
    meta: [
      { title: "Trading Plans — AlphaMine" },
      { name: "description", content: "Plan trades in advance, then move them into your journal or missed trades." },
      { property: "og:title", content: "Trading Plans — AlphaMine" },
      { property: "og:description", content: "Plan trades in advance, then move them into your journal or missed trades." },
    ],
  }),
  component: PlansPage,
});

type Plan = Row<"planned_trades">;
const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
const f2 = (v: number | null | undefined, d = 2) => (v == null ? "" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const dt = (iso?: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "");

function PlansPage() {
  const { journal } = useJournal();
  const { data: lk } = useLookups(journal?.id);
  const t = useJournalTable("planned_trades", journal?.id, "entry_at");
  const drawer = useTradeDrawer();
  const qc = useQueryClient();
  const { data: statLinks = [] } = useQuery({
    queryKey: ["planned_trade_custom_stats", journal?.id], enabled: !!journal,
    queryFn: async () => { const { data, error } = await supabase.from("planned_trade_custom_stats").select("planned_trade_id,option_id").eq("journal_id", journal?.id ?? ""); if (error) throw error; return data; },
  });
  const optionLabel = (planId: string, catId: string) => (lk?.statOptions ?? []).filter((o) => o.category_id === catId && statLinks.some((l) => l.planned_trade_id === planId && l.option_id === o.id)).map((o) => o.label).join(", ");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Plan | "new" | null>(null);
  const [toMissed, setToMissed] = useState<Plan | null>(null);

  const dup = async () => {
    for (const r of t.rows.filter((x) => sel.has(x.id))) {
      const { id: _i, created_at: _c, ...rest } = r;
      await t.insert(rest);
    }
    setSel(new Set());
  };
  const del = async () => {
    if (!confirm(`Delete ${sel.size} planned trade(s)?`)) return;
    await Promise.all([...sel].map((id) => t.remove(id)));
    setSel(new Set());
  };

  const toJournal = (p: Plan) => {
    const inst = lk?.instruments.find((i) => i.symbol.toUpperCase() === (p.instrument ?? "").toUpperCase());
    const setup = lk?.setups.find((s) => s.name.toLowerCase() === (p.setup ?? "").toLowerCase());
    drawer.open(undefined, {
      prefill: {
        entry_at: p.entry_at, instrument_id: inst?.id ?? null, setup_id: setup?.id ?? null,
        direction: p.direction as "long" | "short", entry_price: n(p.entry_price) ?? undefined, quantity: Number(p.quantity),
        stop_loss: n(p.stop_loss), take_profit: n(p.take_profit), notes: p.notes,
      } as never,
      onSaved: async () => { await t.remove(p.id); qc.invalidateQueries({ queryKey: ["planned_trades"] }); },
    });
  };

  const cats = lk?.statCategories ?? [];
  const heads = ["Entry Date", "Instrument", "Trade Type", "Option Type", "Setup", "Direction", "Entry Price", "Quantity", "TP Price", "SL Price", "Expiry Date", "Multiplier", ...cats.map((c) => c.name), "Notes"];
  const rightCols = [6, 7, 8, 9, 11];
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-[calc(100vh-7rem)] flex-col rounded-lg bg-card shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
        <div className="flex items-center gap-2.5 px-[22px] pb-3 pt-[18px]">
          <Button variant="ink" size="sm" className="h-[30px] rounded-md px-4 text-[12px]" onClick={() => setEdit("new")}>Add Trade</Button>
          <Button variant="secondary" size="sm" className="h-[30px] rounded-md px-4 text-[12px] text-t4" disabled={!sel.size} onClick={dup}><Copy className="h-4 w-4" />Duplicate</Button>
          <Button variant="secondary" size="sm" className="h-[30px] rounded-md px-4 text-[12px] text-t4" disabled={!sel.size} onClick={del}><Trash2 className="h-4 w-4" />Delete</Button>
          <button aria-label="Refresh" onClick={() => qc.invalidateQueries({ queryKey: ["planned_trades"] })} className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-muted"><RotateCw className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full whitespace-nowrap text-[11px]">
            <thead className="sticky top-0 bg-card">
              <tr className="h-[40px] border-b text-left">
                <th className="w-20 border-r px-3 font-semibold">Transfer</th>
                <th className="w-10 px-3"><Checkbox checked={!!t.rows.length && sel.size === t.rows.length} onCheckedChange={(v) => setSel(v ? new Set(t.rows.map((r) => r.id)) : new Set())} /></th>
                {heads.map((h, i) => <th key={h} className={cn("px-3 font-semibold", rightCols.includes(i) && "text-right")}>{h}{i === 0 && <ArrowDown className="ml-1 inline h-3 w-3" />}</th>)}
              </tr>
            </thead>
            <tbody>
              {t.rows.length === 0 && <tr><td colSpan={heads.length + 2} className="py-12 text-center text-sm text-muted-foreground">No planned trades yet. Add the trades you intend to take, then move them to your journal or missed trades.</td></tr>}
              {t.rows.map((r) => (
                <tr key={r.id} onClick={() => setEdit(r)} className="cursor-pointer h-[30px] tabular hover:bg-muted/50">
                  <td className="border-r px-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <Tooltip><TooltipTrigger asChild><button aria-label="Move to journal" onClick={() => toJournal(r)} className="text-muted-foreground hover:text-foreground"><CalendarPlus className="h-4 w-4" /></button></TooltipTrigger><TooltipContent>Move to Journal</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger asChild><button aria-label="Move to missed trades" onClick={() => setToMissed(r)} className="text-muted-foreground hover:text-foreground"><Inbox className="h-4 w-4" /></button></TooltipTrigger><TooltipContent>Move to Missed Trades</TooltipContent></Tooltip>
                    </div>
                  </td>
                  <td className="px-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={sel.has(r.id)} onCheckedChange={() => setSel((p) => { const x = new Set(p); x.has(r.id) ? x.delete(r.id) : x.add(r.id); return x; })} />
                  </td>
                  <td className="px-3">{dt(r.entry_at)}</td>
                  <td className="px-3">{r.instrument}</td>
                  <td className="px-3"><span className="inline-block rounded-full bg-chip px-2.5 py-[3px] text-[10px] font-medium leading-none">{r.trade_type}</span></td>
                  <td className="px-3">{r.option_type}</td>
                  <td className="px-3">{r.setup}</td>
                  <td className="px-3"><span className="inline-block rounded-full bg-chip px-2.5 py-[3px] text-[10px] font-medium leading-none">{r.direction === "long" ? "BUY" : "SELL"}</span></td>
                  <td className="px-3 text-right">{f2(n(r.entry_price), 3)}</td>
                  <td className="px-3 text-right">{f2(Number(r.quantity))}</td>
                  <td className="px-3 text-right">{f2(n(r.take_profit), 3)}</td>
                  <td className="px-3 text-right">{f2(n(r.stop_loss), 3)}</td>
                  <td className="px-3">{r.expiry_date ?? ""}</td>
                  <td className="px-3 text-right">{f2(Number(r.multiplier ?? 1))}</td>
                  {cats.map((c) => <td key={c.id} className="px-3">{optionLabel(r.id, c.id)}</td>)}
                  <td className="max-w-[260px] truncate px-3 text-muted-foreground">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-4 border-t px-4 py-2.5 text-[11px]">
          <span>{t.rows.length ? `1 to ${t.rows.length} of ${t.rows.length}` : "0 of 0"}</span><span>Page 1 of 1</span>
        </div>

        {edit && <PlanSheet key={edit === "new" ? "new" : edit.id} row={edit === "new" ? null : edit} journalId={journal?.id}
          onClose={() => setEdit(null)}
          selectedStats={edit === "new" ? [] : statLinks.filter((l) => l.planned_trade_id === edit.id).map((l) => l.option_id)}
          onSave={async (v, ids) => {
            const saved = edit === "new" ? await t.insert(v) : (await t.update(edit.id, v), edit);
            if (!saved || !journal) return;
            const { error: delError } = await supabase.from("planned_trade_custom_stats").delete().eq("planned_trade_id", saved.id);
            if (delError) { toast.error(delError.message); return; }
            if (ids.length) { const { error } = await supabase.from("planned_trade_custom_stats").insert(ids.map((option_id) => ({ planned_trade_id: saved.id, option_id, journal_id: journal.id }))); if (error) { toast.error(error.message); return; } }
            qc.invalidateQueries({ queryKey: ["planned_trade_custom_stats", journal.id] });
            setEdit(null);
          }} />}

        {toMissed && <MissedSheet key={toMissed.id} title="Move to Missed Trades" journalId={journal?.id}
          row={{ occurred_at: toMissed.entry_at, instrument: toMissed.instrument, setup: toMissed.setup, direction: toMissed.direction, trade_type: toMissed.trade_type,
            entry_price: toMissed.entry_price, quantity: toMissed.quantity, take_profit: toMissed.take_profit, stop_loss: toMissed.stop_loss, notes: toMissed.notes, option_type: toMissed.option_type, expiry_date: toMissed.expiry_date, multiplier: toMissed.multiplier }}
          selectedStats={statLinks.filter((l) => l.planned_trade_id === toMissed.id).map((l) => l.option_id)}
          onClose={() => setToMissed(null)}
          onSave={async (v, ids) => {
            const { supabase } = await import("@/integrations/supabase/client");
            const { data, error } = await supabase.from("missed_trades").insert({ ...v, journal_id: journal!.id } as never).select("id").single();
            if (error) { const { toast } = await import("sonner"); toast.error(error.message); return; }
            if (ids.length && data) {
              const { error: statError } = await supabase.from("missed_trade_custom_stats").insert(ids.map((option_id) => ({ missed_trade_id: data.id, option_id, journal_id: journal!.id })));
              if (statError) { const { toast } = await import("sonner"); toast.error(statError.message); return; }
            }
            await t.remove(toMissed.id);
            qc.invalidateQueries({ queryKey: ["missed_trades"] });
            setToMissed(null);
          }} />}
      </div>
    </TooltipProvider>
  );
}

function PlanSheet({ row, journalId, onClose, onSave, selectedStats = [] }: { row: Plan | null; journalId?: string; onClose: () => void; onSave: (v: Partial<Plan>, statIds: string[]) => Promise<void>; selectedStats?: string[] }) {
  const [stats, setStats] = useState<string[]>(selectedStats);
  const { data: lk } = useLookups(journalId);
  const s = (v: unknown) => (v == null ? "" : String(v));
  const [f, setF] = useState({
    entry_at: (row?.entry_at ?? new Date().toISOString()).slice(0, 16), instrument: s(row?.instrument), setup: s(row?.setup),
    direction: row?.direction ?? "long", trade_type: row?.trade_type ?? "Spot", entry_price: s(row?.entry_price), quantity: s(row?.quantity ?? 1),
    take_profit: s(row?.take_profit), stop_loss: s(row?.stop_loss), notes: s(row?.notes),
    option_type: s(row?.option_type), expiry_date: s(row?.expiry_date), multiplier: s(row?.multiplier ?? 1),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";
  const field = (l: string, k: keyof typeof f, type = "text", list?: string) => (
    <div className="space-y-1"><Label className="text-xs">{l}</Label><Input type={type} step="any" list={list} value={f[k]} onChange={set(k)} /></div>
  );
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px] [&>button]:hidden">
        <div className="flex items-center justify-between px-5 py-4"><SheetTitle className="text-base">{row ? "Edit Planned Trade" : "New Planned Trade"}</SheetTitle><button onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto px-5 pb-5">
          <datalist id="pl-inst">{(lk?.instruments ?? []).map((i) => <option key={i.id} value={i.symbol} />)}</datalist>
          <datalist id="pl-setup">{(lk?.setups ?? []).map((i) => <option key={i.id} value={i.name} />)}</datalist>
          {field("Instrument", "instrument", "text", "pl-inst")}
          <div className="space-y-1"><Label className="text-xs">Direction</Label><select className={sel} value={f.direction} onChange={set("direction")}><option value="long">Buy</option><option value="short">Sell</option></select></div>
          {field("Entry Date", "entry_at", "datetime-local")}
          <div className="space-y-1"><Label className="text-xs">Trade Type</Label><select className={sel} value={f.trade_type} onChange={set("trade_type")}>{["Spot", "Futures", "Options", "CFD"].map((x) => <option key={x}>{x}</option>)}</select></div>
          {field("Entry Price", "entry_price", "number")}{field("Quantity", "quantity", "number")}
          {field("TP Price", "take_profit", "number")}{field("SL Price", "stop_loss", "number")}
          {f.trade_type === "Options" && <div className="space-y-1"><Label className="text-xs">Option Type</Label><select className={sel} value={f.option_type} onChange={set("option_type")}><option value="">–</option><option>Call</option><option>Put</option></select></div>}
          {f.trade_type === "Options" && field("Expiry Date", "expiry_date", "date")}
          {field("Multiplier", "multiplier", "number")}
          {field("Setup", "setup", "text", "pl-setup")}
          {(lk?.statCategories ?? []).length > 0 && <div className="col-span-2 space-y-3 border-t pt-3"><p className="text-sm font-semibold">Custom Statistics</p>{(lk?.statCategories ?? []).map((cat) => { const opts = (lk?.statOptions ?? []).filter((o) => o.category_id === cat.id); return <div key={cat.id} className="space-y-1"><Label className="text-xs">{cat.name}</Label><select aria-label={cat.name} className={sel} value={opts.find((o) => stats.includes(o.id))?.id ?? ""} onChange={(e) => setStats((old) => [...old.filter((id) => !opts.some((o) => o.id === id)), ...(e.target.value ? [e.target.value] : [])])}><option value="">None</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>; })}</div>}
          <div className="col-span-2 space-y-1"><Label className="text-xs">Notes</Label><textarea rows={4} className="w-full rounded-md border bg-background p-2 text-sm" value={f.notes} onChange={set("notes")} /></div>
           {row?.id && journalId && <RecordScreenshots journalId={journalId} recordId={row.id} kind="planned_trade_id" />}
        </div>
        <div className="flex gap-2 border-t px-5 py-4">
          <Button variant="ink" size="sm" disabled={!f.instrument} onClick={() => onSave({
            entry_at: new Date(f.entry_at).toISOString(), instrument: f.instrument, setup: f.setup || null, direction: f.direction, trade_type: f.trade_type,
            entry_price: n(f.entry_price), quantity: n(f.quantity) ?? 1, take_profit: n(f.take_profit), stop_loss: n(f.stop_loss), notes: f.notes || null,
            option_type: f.trade_type === "Options" ? f.option_type || null : null, expiry_date: f.trade_type === "Options" ? f.expiry_date || null : null, multiplier: n(f.multiplier) ?? 1,
          }, stats)}>Save</Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
