import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Copy, Plus, Search, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { createJournal, useJournal, type Journal } from "@/lib/journal-context";
import { cn } from "@/lib/utils";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NGN", "ZAR", "INR"];
const MARKETS = ["Forex", "Stocks", "Crypto", "Futures", "Options", "Indices", "Commodities"];
const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";

type Mode = "list" | "new" | { copy: Journal };

/** Searchable journal picker with create, copy, share and delete actions. */
export function JournalPicker() {
  const { journals, journal, setJournalId } = useJournal();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("list");
  const [q, setQ] = useState("");
  const list = useMemo(
    () => [...journals].filter((j) => j.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (b.last_used_at ?? "").localeCompare(a.last_used_at ?? "")),
    [journals, q],
  );

  async function remove(j: Journal) {
    if (journals.length < 2) return toast.error("You need at least one journal");
    if (!confirm(`Delete "${j.name}" and all its trades? This cannot be undone.`)) return;
    const { error } = await supabase.from("journals").delete().eq("id", j.id);
    if (error) return toast.error(error.message);
    if (j.id === journal?.id) setJournalId(journals.find((x) => x.id !== j.id)!.id);
    qc.invalidateQueries();
  }

  async function share(j: Journal) {
    let token = j.share_token;
    if (!token) {
      token = crypto.randomUUID();
      const { error } = await supabase.from("journals").update({ share_token: token }).eq("id", j.id);
      if (error) return toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["journals"] });
    }
    await navigator.clipboard.writeText(`${window.location.origin}/share/${token}`).catch(() => undefined);
    toast.success("Read-only link copied");
  }

  return (
    <>
      <Button variant="outline" size="sm" className="max-w-52 gap-2" onClick={() => { setMode("list"); setOpen(true); }}>
        <span className="truncate">{journal?.name ?? "Journal"}</span><ChevronDown className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{mode === "list" ? "Select Journal" : mode === "new" ? "Create Journal" : `Copy "${mode.copy.name}"`}</DialogTitle></DialogHeader>
          {mode === "list" && (
            <div className="space-y-3">
              <div className="relative"><Input placeholder="Search journals" value={q} onChange={(e) => setQ(e.target.value)} className="pr-8" /><Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" /></div>
              <p className="text-[11px] text-muted-foreground">Sorted by last used</p>
              <div className="max-h-80 divide-y overflow-y-auto rounded-md border">
                {list.map((j) => (
                  <div key={j.id} className={cn("flex items-center gap-2 px-3 py-2.5", j.id === journal?.id && "bg-muted/60")}>
                    <button className="min-w-0 flex-1 text-left" onClick={() => { setJournalId(j.id); setOpen(false); }}>
                      <span className="block truncate text-sm font-medium">{j.name}</span>
                      <span className="text-[11px] text-muted-foreground">{j.currency} · {Number(j.starting_balance).toLocaleString()}{j.markets?.length ? ` · ${j.markets.join(", ")}` : ""}</span>
                    </button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Copy ${j.name}`} onClick={() => setMode({ copy: j })}><Copy className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Share ${j.name}`} onClick={() => share(j)}><Share2 className={cn("h-3.5 w-3.5", j.share_token && "text-profit")} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Delete ${j.name}`} onClick={() => remove(j)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
                {!list.length && <p className="p-4 text-center text-sm text-muted-foreground">No journals match.</p>}
              </div>
              <Button className="w-full" onClick={() => setMode("new")}><Plus className="h-4 w-4" /> Add Journal</Button>
            </div>
          )}
          {mode === "new" && <NewJournal onDone={(id) => { setJournalId(id); setOpen(false); }} onBack={() => setMode("list")} />}
          {typeof mode === "object" && <CopyJournal source={mode.copy} onDone={(id) => { setJournalId(id); setOpen(false); }} onBack={() => setMode("list")} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewJournal({ onDone, onBack }: { onDone: (id: string) => void; onBack: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", currency: "USD", amount: "10000", deposit_date: "", trade_type: "Spot", markets: [] as string[] });
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const j = await createJournal(f.name.trim() || "New Journal", Number(f.amount) || 0, f.currency, { markets: f.markets, deposit_date: f.deposit_date || null, trade_type: f.trade_type });
      await qc.invalidateQueries({ queryKey: ["journals"] });
      toast.success("Journal created");
      onDone(j.id);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <div><Label className="text-xs">Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">Currency</Label><select className={sel} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><Label className="text-xs">Trade type</Label><select className={sel} value={f.trade_type} onChange={(e) => setF({ ...f, trade_type: e.target.value })}>{["Spot", "Options", "Futures"].map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><Label className="text-xs">Initial amount</Label><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div><Label className="text-xs">Deposit date</Label><Input type="date" value={f.deposit_date} onChange={(e) => setF({ ...f, deposit_date: e.target.value })} /></div>
      </div>
      <div>
        <Label className="text-xs">Markets traded</Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {MARKETS.map((m) => {
            const on = f.markets.includes(m);
            return <button key={m} type="button" onClick={() => setF({ ...f, markets: on ? f.markets.filter((x) => x !== m) : [...f.markets, m] })} className={cn("rounded-full border px-3 py-1 text-xs", on && "border-ink bg-ink text-ink-foreground")}>{m}</button>;
          })}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Tip: set the deposit date to the day before your first trade.</p>
      <div className="flex gap-2"><Button variant="outline" onClick={onBack}>Back</Button><Button className="flex-1" disabled={busy} onClick={submit}>Create</Button></div>
    </div>
  );
}

/** Copies the journal's structure (setups, instruments, comments, custom stats) and optionally its records, remapping ids. */
function CopyJournal({ source, onDone, onBack }: { source: Journal; onDone: (id: string) => void; onBack: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(`${source.name} (copy)`);
  const [inc, setInc] = useState({ trades: true, plans: true, missed: true });
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const { data: j, error } = await supabase.from("journals").insert({
        name, currency: source.currency, starting_balance: source.starting_balance, broker: source.broker, markets: source.markets,
        deposit_date: source.deposit_date, trade_type: source.trade_type, auto_pnl: source.auto_pnl, session_categories: source.session_categories,
      }).select().single();
      if (error) throw error;
      const jid = j.id;
      const [ins, sets, cds, cats, opts, plans] = await Promise.all([
        supabase.from("instruments").select("*").eq("journal_id", source.id),
        supabase.from("setups").select("*").eq("journal_id", source.id),
        supabase.from("comment_definitions").select("*").eq("journal_id", source.id),
        supabase.from("custom_stat_categories").select("*").eq("journal_id", source.id),
        supabase.from("custom_stat_options").select("*").eq("journal_id", source.id),
        supabase.from("trading_plans").select("*").eq("journal_id", source.id),
      ]);
      const copyRows = async <R extends { id: string }>(table: string, rows: R[] | null, map: (r: R) => Record<string, unknown>) => {
        const m = new Map<string, string>();
        if (!rows?.length) return m;
        const payload = rows.map((r) => ({ ...map(r), id: crypto.randomUUID(), journal_id: jid }));
        const { error: e } = await (supabase as any).from(table).insert(payload);
        if (e) throw e;
        rows.forEach((r, i) => m.set(r.id, payload[i].id));
        return m;
      };
      const strip = <R extends Record<string, unknown>>({ id: _i, journal_id: _j, created_at: _c, ...rest }: R) => rest;
      const insMap = await copyRows("instruments", ins.data, strip);
      const setMap = await copyRows("setups", sets.data, strip);
      const cdMap = await copyRows("comment_definitions", cds.data, strip);
      const catMap = await copyRows("custom_stat_categories", cats.data, strip);
      const optMap = await copyRows("custom_stat_options", opts.data, (o) => ({ ...strip(o), category_id: catMap.get(o.category_id) }));
      const planMap = inc.plans ? await copyRows("trading_plans", plans.data, strip) : new Map<string, string>();

       const screenshotCopies: { trade_id?: string | null; missed_trade_id?: string | null; planned_trade_id?: string | null; journal_id: string; path: string; caption: string | null }[] = [];
       const { data: sourceShots } = await supabase.from("trade_screenshots").select("*").eq("journal_id", source.id);
       const collectShots = (field: "trade_id" | "missed_trade_id" | "planned_trade_id", ids: Map<string, string>) => {
         sourceShots?.forEach((s) => { const old = s[field]; if (old && ids.has(old)) screenshotCopies.push({ journal_id: jid, [field]: ids.get(old), path: s.path, caption: s.caption }); });
       };
       if (inc.trades) {
        const { data: trades } = await supabase.from("trades").select("*").eq("journal_id", source.id);
        const tMap = await copyRows("trades", trades, ({ trade_no: _n, ...t }) => ({
          ...strip(t), instrument_id: t.instrument_id ? insMap.get(t.instrument_id) ?? null : null, setup_id: t.setup_id ? setMap.get(t.setup_id) ?? null : null,
          trading_plan_id: t.trading_plan_id ? planMap.get(t.trading_plan_id) ?? null : null, pnl_manual: true,
        }));
        const [tc, tcs] = await Promise.all([
          supabase.from("trade_comments").select("*").eq("journal_id", source.id),
          supabase.from("trade_custom_stats").select("*").eq("journal_id", source.id),
        ]);
        if (tc.data?.length) await supabase.from("trade_comments").insert(tc.data.filter((r) => tMap.has(r.trade_id) && cdMap.has(r.comment_definition_id)).map((r) => ({ trade_id: tMap.get(r.trade_id)!, comment_definition_id: cdMap.get(r.comment_definition_id)!, journal_id: jid })));
        if (tcs.data?.length) await supabase.from("trade_custom_stats").insert(tcs.data.filter((r) => tMap.has(r.trade_id) && optMap.has(r.option_id)).map((r) => ({ trade_id: tMap.get(r.trade_id)!, option_id: optMap.get(r.option_id)!, journal_id: jid })));
         collectShots("trade_id", tMap);
        const { data: flows } = await supabase.from("journal_cashflows").select("*").eq("journal_id", source.id);
        await copyRows("journal_cashflows", flows, strip);
      }
      if (inc.missed) {
        const { data: missed } = await supabase.from("missed_trades").select("*").eq("journal_id", source.id);
         const missedMap = await copyRows("missed_trades", missed, strip);
         const { data: missedStats } = await supabase.from("missed_trade_custom_stats").select("*").eq("journal_id", source.id);
         if (missedStats?.length) await supabase.from("missed_trade_custom_stats").insert(missedStats.filter((r) => missedMap.has(r.missed_trade_id) && optMap.has(r.option_id)).map((r) => ({ journal_id: jid, missed_trade_id: missedMap.get(r.missed_trade_id)!, option_id: optMap.get(r.option_id)! })));
         collectShots("missed_trade_id", missedMap);
      }
       if (inc.plans) {
         const { data: planned } = await supabase.from("planned_trades").select("*").eq("journal_id", source.id);
         const plannedMap = await copyRows("planned_trades", planned, strip);
         collectShots("planned_trade_id", plannedMap);
       }
       if (screenshotCopies.length) { const { error: shotError } = await supabase.from("trade_screenshots").insert(screenshotCopies); if (shotError) throw shotError; }
      await qc.invalidateQueries();
      toast.success("Journal copied");
      onDone(jid);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div><Label className="text-xs">New journal name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <p className="text-xs text-muted-foreground">Setups, instruments, trade comments and custom statistics are always copied. Also include:</p>
      {([["trades", "Trades (with comments, custom stats and deposits)"], ["plans", "Trading plans"], ["missed", "Missed trades"]] as const).map(([k, l]) => (
        <label key={k} className="flex items-center gap-2 text-sm"><Checkbox checked={inc[k]} onCheckedChange={(v) => setInc({ ...inc, [k]: !!v })} />{l}</label>
      ))}
      <div className="flex gap-2"><Button variant="outline" onClick={onBack}>Back</Button><Button className="flex-1" disabled={busy || !name.trim()} onClick={submit}>{busy ? "Copying…" : "Copy journal"}</Button></div>
    </div>
  );
}
