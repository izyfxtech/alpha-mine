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
import { sweepStorage } from "@/lib/media/sweep-storage";
import { createJournal, useJournal, type Journal } from "@/lib/journal/journal-context";
import { cn } from "@/lib/utils";
import { countOption, fetchAllRows } from "@/lib/journal/fetch-all";
import { useProfile } from "@/lib/profile-settings";
import { ShareJournalDialog } from "@/components/journal/ShareJournal";
import { DatePicker } from "@/components/ui/date-picker";
import { JOURNAL_MARKETS } from "@/lib/pnl/asset-class";
import { useDialogs } from "@/components/ui/confirm";

export const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NGN", "ZAR", "INR"];
const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";

type Mode = "list" | "new" | { copy: Journal };

/** Searchable journal picker with create, copy, share and delete actions. */
export function JournalPicker() {
  const { confirm } = useDialogs();
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
    if (!(await confirm({ title: `Delete "${j.name}"?`, message: "All of its trades, notes and screenshots are deleted too. This cannot be undone.", destructive: true }))) return;
    const { error } = await supabase.from("journals").delete().eq("id", j.id);
    if (error) return toast.error(error.message);
    sweepStorage();
    if (j.id === journal?.id) setJournalId(journals.find((x) => x.id !== j.id)!.id);
    qc.invalidateQueries();
  }

  // Sharing always goes through the share dialog: it respects "Allow sharing", says what becomes public, and can revoke.
  const allowSharing = useProfile().settings.allowSharing;
  const [shareFor, setShareFor] = useState<Journal | null>(null);
  function share(j: Journal) {
    if (!allowSharing) return toast.error("Sharing is switched off in Settings, so no link can be created or used.");
    setShareFor(j);
  }

  return (
    <>
      <ShareJournalDialog open={!!shareFor} onOpenChange={(v) => { if (!v) { setShareFor(null); qc.invalidateQueries({ queryKey: ["journals"] }); } }} target={shareFor ? { id: shareFor.id, name: shareFor.name } : undefined} />
      <Button variant="outline" className="max-w-56 gap-2" onClick={() => { setMode("list"); setOpen(true); }}>
        <span className="truncate">{journal?.name ?? "Journal"}</span><ChevronDown className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{mode === "list" ? "Select Journal" : mode === "new" ? "Create Journal" : `Copy "${mode.copy.name}"`}</DialogTitle></DialogHeader>
          {mode === "list" && (
            <div className="space-y-3">
              <div className="relative"><Input placeholder="Search journals" value={q} onChange={(e) => setQ(e.target.value)} className="pr-8" /><Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" /></div>
              <p className="text-xs text-muted-foreground">Sorted by last used</p>
              <div className="max-h-80 divide-y overflow-y-auto rounded-md border">
                {list.map((j) => (
                  <div key={j.id} className={cn("flex items-center gap-2 px-3 py-2.5", j.id === journal?.id && "bg-muted/60")}>
                    <button className="min-w-0 flex-1 text-left" onClick={() => { setJournalId(j.id); setOpen(false); }}>
                      <span className="block truncate text-sm font-medium">{j.name}</span>
                      <span className="text-xs text-muted-foreground">{j.currency} · {Number(j.starting_balance).toLocaleString()}{j.markets?.length ? ` · ${j.markets.join(", ")}` : ""}</span>
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
  // Only what a journal needs to exist. How quantity is read (lots or shares) follows from each instrument's class, so it is not asked here.
  const [f, setF] = useState({ name: "", currency: "USD", amount: "10000", deposit_date: "", markets: ["Forex"] as string[] });
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!f.markets.length) return toast.error("Pick at least one market.");
    setBusy(true);
    try {
      const j = await createJournal(f.name.trim() || "New Journal", Number(f.amount) || 0, f.currency, { markets: f.markets, deposit_date: f.deposit_date || null, trade_type: "Spot" });
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
        <div><Label className="text-xs">Initial amount</Label><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div className="col-span-2"><Label className="text-xs">Deposit date</Label><DatePicker aria-label="Deposit date" value={f.deposit_date} onChange={(v) => setF({ ...f, deposit_date: v })} /></div>
      </div>
      <div>
        <Label className="text-xs">Markets</Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {JOURNAL_MARKETS.map((m) => {
            const on = f.markets.includes(m);
            return <button key={m} type="button" aria-pressed={on} onClick={() => setF({ ...f, markets: on ? f.markets.filter((x) => x !== m) : [...f.markets, m] })} className={cn("rounded-full border px-3 py-1 text-xs", on && "border-ink bg-ink text-ink-foreground")}>{m}</button>;
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Tip: set the deposit date to the day before your first trade.</p>
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
    let jid: string | undefined;
    try {
      // Every row of every table (the API caps one response at Max Rows), in a stable order.
      const all = <R,>(table: string, order: string[] = ["id"]) => fetchAllRows<R>((from, to, first) => {
        let q = (supabase as any).from(table).select("*", countOption(first)).eq("journal_id", source.id);
        for (const o of order) q = q.order(o);
        return q.range(from, to);
      });
      const must = (e: { message: string } | null) => { if (e) throw new Error(e.message); };
      const { data: j, error } = await supabase.from("journals").insert({
        name, currency: source.currency, starting_balance: source.starting_balance, broker: source.broker, markets: source.markets,
        deposit_date: source.deposit_date, trade_type: source.trade_type, auto_pnl: source.auto_pnl, quantity_unit: source.quantity_unit, session_categories: source.session_categories,
      }).select().single();
      if (error) throw error;
      jid = j.id;
      const [ins, sets, cds, cats, opts, plans] = await Promise.all([
        all<any>("instruments"), all<any>("setups"), all<any>("comment_definitions"), all<any>("custom_stat_categories"), all<any>("custom_stat_options"), all<any>("trading_plans"),
      ]);
      const copyRows = async <R extends { id: string }>(table: string, rows: R[] | null, map: (r: R) => Record<string, unknown>) => {
        const m = new Map<string, string>();
        if (!rows?.length) return m;
        const payload = rows.map((r) => ({ ...map(r), id: crypto.randomUUID(), journal_id: jid! }));
        const { error: e } = await (supabase as any).from(table).insert(payload);
        if (e) throw e;
        rows.forEach((r, i) => m.set(r.id, payload[i].id));
        return m;
      };
      const strip = <R extends Record<string, unknown>>({ id: _i, journal_id: _j, created_at: _c, ...rest }: R) => rest;
      const insMap = await copyRows("instruments", ins, strip);
      const setMap = await copyRows("setups", sets, strip);
      const cdMap = await copyRows("comment_definitions", cds, strip);
      const catMap = await copyRows("custom_stat_categories", cats, strip);
      const optMap = await copyRows("custom_stat_options", opts, (o: any) => ({ ...strip(o), category_id: catMap.get(o.category_id) }));
      const planMap = inc.plans ? await copyRows("trading_plans", plans, strip) : new Map<string, string>();

       const screenshotCopies: { trade_id?: string | null; missed_trade_id?: string | null; planned_trade_id?: string | null; journal_id: string; path: string; caption: string | null }[] = [];
       const sourceShots = await all<any>("trade_screenshots");
       const collectShots = (field: "trade_id" | "missed_trade_id" | "planned_trade_id", ids: Map<string, string>) => {
         sourceShots?.forEach((s) => { const old = s[field]; if (old && ids.has(old)) screenshotCopies.push({ journal_id: jid!, [field]: ids.get(old), path: s.path, caption: s.caption }); });
       };
       if (inc.trades) {
        const trades = await all<any>("trades");
        const tMap = await copyRows("trades", trades, ({ trade_no: _n, ...t }: any) => ({
          ...strip(t), instrument_id: t.instrument_id ? insMap.get(t.instrument_id) ?? null : null, setup_id: t.setup_id ? setMap.get(t.setup_id) ?? null : null,
          trading_plan_id: t.trading_plan_id ? planMap.get(t.trading_plan_id) ?? null : null, pnl_manual: true,
        }));
        const [tc, tcs] = await Promise.all([all<any>("trade_comments", ["trade_id", "comment_definition_id"]), all<any>("trade_custom_stats", ["trade_id", "option_id"])]);
        const insertAll = async (table: string, rows: Record<string, unknown>[]) => { for (let k = 0; k < rows.length; k += 500) must((await (supabase as any).from(table).insert(rows.slice(k, k + 500))).error); };
        await insertAll("trade_comments", tc.filter((r) => tMap.has(r.trade_id) && cdMap.has(r.comment_definition_id)).map((r: any) => ({ trade_id: tMap.get(r.trade_id)!, comment_definition_id: cdMap.get(r.comment_definition_id)!, journal_id: jid! })));
        await insertAll("trade_custom_stats", tcs.filter((r) => tMap.has(r.trade_id) && optMap.has(r.option_id)).map((r: any) => ({ trade_id: tMap.get(r.trade_id)!, option_id: optMap.get(r.option_id)!, journal_id: jid! })));
         collectShots("trade_id", tMap);
        const flows = await all<any>("journal_cashflows");
        await copyRows("journal_cashflows", flows, strip);
      }
      if (inc.missed) {
        const missed = await all<any>("missed_trades");
         const missedMap = await copyRows("missed_trades", missed, strip);
         const missedStats = await all<any>("missed_trade_custom_stats", ["missed_trade_id", "option_id"]);
         const msRows = missedStats.filter((r) => missedMap.has(r.missed_trade_id) && optMap.has(r.option_id)).map((r) => ({ journal_id: jid!, missed_trade_id: missedMap.get(r.missed_trade_id)!, option_id: optMap.get(r.option_id)! }));
         for (let k = 0; k < msRows.length; k += 500) must((await supabase.from("missed_trade_custom_stats").insert(msRows.slice(k, k + 500))).error);
         collectShots("missed_trade_id", missedMap);
      }
       if (inc.plans) {
         const planned = await all<any>("planned_trades");
         const plannedMap = await copyRows("planned_trades", planned, strip);
         collectShots("planned_trade_id", plannedMap);
       }
       for (let k = 0; k < screenshotCopies.length; k += 500) must((await supabase.from("trade_screenshots").insert(screenshotCopies.slice(k, k + 500))).error);
      await qc.invalidateQueries();
      toast.success("Journal copied");
      onDone(jid);
    } catch (e) {
      // All or nothing: a failed copy must not leave a half-filled journal behind. Deleting the new journal removes
      // everything copied so far (screenshot files are shared with the original, so they are never deleted).
      if (jid) await supabase.from("journals").delete().eq("id", jid);
      toast.error(`The journal was not copied: ${(e as Error).message}`);
    } finally { setBusy(false); }
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
