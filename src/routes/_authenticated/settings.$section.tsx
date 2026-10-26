import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Empty, Panel } from "@/components/kit";
import { DragHandle, EditableText, TypedConfirm, plural, useDragReorder, useUsage } from "@/components/settings-parts";
import { supabase } from "@/integrations/supabase/client";
import { useJournal } from "@/lib/journal-context";
import { useProfile } from "@/lib/profile-settings";
import { useJournalTable } from "@/lib/crud";
import { SETTINGS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings/$section")({
  head: ({ params }) => {
    const label = SETTINGS.find(([s]) => s === params.section)?.[1] ?? "Settings";
    const title = `${label} Settings — AlphaMine`;
    const description = `Manage ${label.toLowerCase()} settings in AlphaMine.`;
    return { meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }] };
  },
  beforeLoad: ({ params }) => { if (!SETTINGS.some(([s]) => s === params.section)) throw notFound(); },
  notFoundComponent: () => <Empty>That settings page doesn't exist.</Empty>,
  component: SettingsPage,
});

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NGN", "ZAR", "INR"];
const currencyName = (c: string) => { try { return `${new Intl.DisplayNames(["en"], { type: "currency" }).of(c) ?? c} (${c})`; } catch { return c; } };
const MARKETS = ["Stocks", "Forex", "Futures", "Crypto", "Indices", "Commodities"];
const TRADE_TYPES = ["Spot", "Futures", "Options", "CFD"];
const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";
const selFixed = "h-9 shrink-0 rounded-md border bg-background px-2 text-sm";
const card = "rounded-lg bg-card shadow-[0_1px_5px_rgba(60,40,90,0.07)]";

function SettingsPage() {
  const { section } = Route.useParams();
  return (
    <div>
      {section === "account" && <Account />}
      {section === "journal" && <JournalSettings />}
      {section === "cashflows" && <Cashflows />}
      {section === "instruments" && <ItemList table="instruments" field="symbol" label="Instrument" />}
      {section === "setups" && <ItemList table="setups" field="name" label="Setup" describe />}
      {section === "comments" && <Comments />}
      {section === "sessions" && <SessionCategories />}
      {section === "custom-statistics" && <CustomStatistics />}
    </div>
  );
}

/* ------------------------------ shared bits ------------------------------ */

/** "Active Items | Disabled Items" switch shown above every list page. */
function ItemsToggle({ value, onChange, disabledCount }: { value: "active" | "disabled"; onChange: (v: "active" | "disabled") => void; disabledCount: number }) {
  return (
    <div role="tablist" aria-label="Which items to show" className="mb-5 inline-flex h-[28px] overflow-hidden rounded-md border bg-card text-[10px] font-semibold">
      {([["active", "Active Items"], ["disabled", `Disabled Items${disabledCount ? ` (${disabledCount})` : ""}`]] as const).map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={cn("border-r px-3 last:border-r-0", value === k && "bg-ink text-ink-foreground")}>{l}</button>
      ))}
    </div>
  );
}

const sentimentTone = (s: string) => (s === "positive" ? "text-profit" : s === "negative" ? "text-loss" : "text-t1");

/** Trash on an active item retires it (it stays on existing trades); on a disabled item it deletes it for good. */
function RowActions({ disabled, name, used, onDisable, onRestore, onDelete }: { disabled: boolean; name: string; used: number; onDisable: () => void; onRestore: () => void; onDelete: () => void }) {
  if (!disabled) {
    return <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Disable ${name}`} title="Disable (keeps it on existing trades)" onClick={onDisable}><Trash2 className="h-4 w-4" /></Button>;
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button size="sm" variant="outline" className="h-7 text-[11px]" aria-label={`Restore ${name}`} onClick={onRestore}><RotateCcw className="h-3 w-3" />Restore</Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Delete ${name} permanently`} title={used ? `Used by ${plural(used, "trade")}` : "Delete permanently"} onClick={() => { if (confirm(`Permanently delete "${name}"?${used ? ` It is on ${plural(used, "trade")}; they will lose it.` : ""} This cannot be undone.`)) onDelete(); }}><X className="h-4 w-4" /></Button>
    </span>
  );
}

/* --------------------------------- Account -------------------------------- */

function Account() {
  const qc = useQueryClient();
  const { profile: data, settings, saveSettings } = useProfile();
  const [f, setF] = useState({ display_name: "", base_currency: "USD" });
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  useEffect(() => { if (data) setF({ display_name: data.display_name, base_currency: data.base_currency }); }, [data]);
  const toggles: ["showWeeklyTotals" | "showCalendarWinrate" | "showBalance" | "allowSharing", string][] = [
    ["showWeeklyTotals", "Show week totals in calendar"],
    ["showCalendarWinrate", "Show winrate next to the trade count in calendar"],
    ["showBalance", "Show account balance"],
    ["allowSharing", "Allow other users to share their journals with me using my email address"],
  ];
  const save = async (patch: Parameters<typeof saveSettings>[0]) => { try { await saveSettings(patch); } catch { toast.error("Could not save preference"); } };
  return (
    <div className="max-w-[500px] space-y-[22px]">
      <div className={cn(card, "space-y-4 p-[26px]")}>
        {toggles.map(([key, label]) => (
          <div key={key} className="flex items-center gap-3 text-[12px]">
            <Switch id={key} checked={settings[key]} onCheckedChange={(checked) => save({ [key]: checked })} />
            <Label htmlFor={key} className="font-normal">{label}</Label>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 text-[12px]">
          <Label htmlFor="weekStartsOn" className="font-normal">First day of the week</Label>
          <select id="weekStartsOn" className={selFixed + " w-32"} value={settings.weekStartsOn} onChange={(e) => save({ weekStartsOn: e.target.value === "0" ? 0 : 1 })}><option value="1">Monday</option><option value="0">Sunday</option></select>
        </div>
        <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>Change Password</Button>
      </div>
      <Panel title="Profile">
        <div className="space-y-3">
          <div><Label className="text-xs">Email</Label><Input value={data?.email ?? ""} disabled /></div>
          <div><Label className="text-xs">Display name</Label><Input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></div>
          <div><Label className="text-xs">Base currency</Label><select className={sel} value={f.base_currency} onChange={(e) => setF({ ...f, base_currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c} value={c}>{currencyName(c)}</option>)}</select></div>
          <Button onClick={async () => {
            const { error } = await supabase.from("profiles").upsert({ id: data!.id, ...f });
            if (error) toast.error(error.message); else { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["profile"] }); }
          }}>Save profile</Button>
        </div>
      </Panel>
      <Dialog open={pwOpen} onOpenChange={(v) => { setPwOpen(v); if (!v) setPw(""); }}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription className="sr-only">Enter a new password for your account.</DialogDescription>
          <Input type="password" autoFocus aria-label="New password" placeholder="New password (min 8 characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPwOpen(false)}>Cancel</Button>
            <Button disabled={pw.length < 8} onClick={async () => {
              const { error } = await supabase.auth.updateUser({ password: pw });
              if (error) toast.error(error.message); else { toast.success("Password updated"); setPwOpen(false); }
            }}>Update password</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* --------------------------------- Journal -------------------------------- */

function Float({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="relative block rounded-md border bg-card px-3 pb-1.5 pt-3.5 text-sm">
      <span className="absolute -top-[7px] left-2 bg-card px-1 text-[10px] text-t3">{label}</span>
      {children}
    </label>
  );
}
const bare = "w-full bg-transparent text-sm outline-none";

function JournalSettings() {
  const { journal, journals, setJournalId, refresh } = useJournal();
  const initial = useMemo(() => journal ? ({
    name: journal.name, currency: journal.currency, starting_balance: String(journal.starting_balance),
    markets: journal.markets.join(", "), trade_type: journal.trade_type, broker: journal.broker ?? "", auto_pnl: journal.auto_pnl,
  }) : null, [journal]);
  const [f, setF] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setF(initial), [initial]);
  if (!journal || !f || !initial) return null;
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const valid = f.name.trim() && f.markets.trim() && Number.isFinite(Number(f.starting_balance));
  const marketOptions = MARKETS.includes(f.markets) ? MARKETS : [f.markets, ...MARKETS].filter(Boolean);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  return (
    <div className="max-w-[500px] space-y-[22px]">
      <div className={card}>
        <div className="space-y-3 p-[26px]">
          <Float label="Journal Name *"><input className={bare} value={f.name} onChange={(e) => set("name", e.target.value)} /></Float>
          <Float label="Account Currency *"><select className={bare} value={f.currency} onChange={(e) => set("currency", e.target.value)}>{[...new Set([f.currency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{currencyName(c)}</option>)}</select></Float>
          <Float label="Starting Balance"><input className={cn(bare, "tabular")} type="number" value={f.starting_balance} onChange={(e) => set("starting_balance", e.target.value)} /></Float>
          <Float label="Markets *"><select className={bare} value={f.markets} onChange={(e) => set("markets", e.target.value)}>{marketOptions.map((m) => <option key={m} value={m}>{m}</option>)}</select></Float>
          <Float label="Default Trade Type *"><select className={bare} value={f.trade_type} onChange={(e) => set("trade_type", e.target.value)}>{TRADE_TYPES.map((v) => <option key={v}>{v}</option>)}</select></Float>
          <Float label="Broker"><input className={bare} value={f.broker} onChange={(e) => set("broker", e.target.value)} /></Float>
          <div className="flex items-center gap-3 pt-1 text-[12px]"><Switch id="auto_pnl" checked={f.auto_pnl} onCheckedChange={(v) => set("auto_pnl", v)} /><Label htmlFor="auto_pnl" className="font-normal">Auto Calculate Profit/Loss</Label></div>
          {journal.mt_login && <p className="rounded-md bg-muted px-3 py-2 text-[11px] text-t3">Linked to {journal.mt_platform?.toUpperCase()} account {journal.mt_login}{journal.mt_server ? ` on ${journal.mt_server}` : ""}. Trades imported from it are matched by ticket, so re-importing never duplicates them.</p>}
        </div>
        <div className="flex gap-2 border-t px-[26px] py-4">
          <Button size="sm" variant={dirty && valid ? "ink" : "secondary"} disabled={!dirty || !valid} onClick={async () => {
            const { error } = await supabase.from("journals").update({ name: f.name.trim(), currency: f.currency, broker: f.broker || null, markets: f.markets.split(",").map((x) => x.trim()).filter(Boolean), trade_type: f.trade_type, auto_pnl: f.auto_pnl, starting_balance: Number(f.starting_balance) }).eq("id", journal.id);
            if (error) toast.error(error.message); else { toast.success("Journal saved"); refresh(); }
          }}>Save</Button>
          <Button size="sm" variant="secondary" disabled={!dirty} onClick={() => setF(initial)}>Reset</Button>
        </div>
      </div>
      <div className={cn(card, "flex items-center justify-between gap-4 p-[22px]")}>
        <div><p className="text-[13px] font-semibold">Delete this journal</p><p className="text-[11px] text-t3">Removes the journal with all of its trades, plans, notes and sessions.</p></div>
        <Button variant="outline" className="text-loss" disabled={journals.length < 2} title={journals.length < 2 ? "You need at least one other journal" : undefined} onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /> Delete journal</Button>
      </div>
      <TypedConfirm open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this journal?" phrase={journal.name} confirmLabel="Delete journal"
        description={<p>This permanently deletes <b className="text-t1">{journal.name}</b> with all of its trades, screenshots, plans, notes and sessions. It cannot be undone.</p>}
        onConfirm={async () => {
          const next = journals.find((j) => j.id !== journal.id);
          const { error } = await supabase.from("journals").delete().eq("id", journal.id);
          if (error) { toast.error(error.message); throw error; }
          if (next) setJournalId(next.id);
          refresh();
        }} />
    </div>
  );
}

/* ---------------------- Deposits & Withdrawals (cashflows) ---------------------- */

function Cashflows() {
  const { journal } = useJournal();
  const t = useJournalTable("journal_cashflows", journal?.id, "occurred_on", false);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState("deposit");
  const [note, setNote] = useState("");
  const money = (n: number) => `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("en-US", { style: "currency", currency: journal?.currency ?? "USD" })}`;
  const rows = useMemo(() => {
    const start = Number(journal?.starting_balance ?? 0);
    const list = [...(start ? [{ id: "start", occurred_on: (journal?.deposit_date ?? journal?.created_at ?? "").slice(0, 10), amount: start, note: "Starting balance", locked: true }] : []), ...t.rows.map((r) => ({ id: r.id, occurred_on: r.occurred_on, amount: Number(r.amount), note: r.note, locked: false }))]
      .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || (a.locked ? -1 : 1));
    let bal = 0;
    return list.map((r) => ({ ...r, balance: (bal += r.amount) })).reverse();
  }, [t.rows, journal]);
  const valid = !!date && Number.isFinite(Number(amount)) && Number(amount) > 0;
  return (
    <div className="max-w-[700px]">
      <Button variant="ink" size="sm" className="mb-4 h-[30px] rounded-md px-3 text-[12px]" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" />Add More</Button>
      <div className={cn(card, "overflow-hidden")}>
        <table className="w-full text-[12px] tabular">
          <thead><tr className="h-[42px] text-left"><th className="px-4 font-semibold">Date</th><th className="px-2 font-semibold">Amount</th><th className="px-2 font-semibold">New Balance</th><th className="px-2 font-semibold">Reason</th><th className="w-12" /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn("h-[37px]", r.amount >= 0 ? "bg-row-win text-profit" : "bg-row-loss text-loss")}>
                <td className="px-4">{r.occurred_on}</td>
                <td className="px-2">{money(r.amount)}</td>
                <td className="px-2">{money(r.balance)}</td>
                <td className="px-2 text-t2">{r.note}</td>
                <td className="px-2 text-right">{!r.locked && <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground" aria-label="Delete transaction" onClick={() => { if (confirm("Delete this transaction? Balances and returns will be recalculated.")) t.remove(r.id); }}><Trash2 className="h-4 w-4" /></Button>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-t4">No deposits or withdrawals yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Add deposit or withdrawal</DialogTitle>
          <DialogDescription className="sr-only">Record money added to or taken from the account.</DialogDescription>
          <div className="space-y-3">
            <Input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
            <select aria-label="Type" className={sel} value={kind} onChange={(e) => setKind(e.target.value)}><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option></select>
            <Input type="number" step="0.01" min="0.01" placeholder="Amount" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input placeholder="Reason (optional)" aria-label="Reason" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!valid} onClick={async () => { const r = await t.insert({ occurred_on: date, amount: (kind === "withdrawal" ? -1 : 1) * Number(amount), note: note || null }); if (r) { setAmount(""); setNote(""); setOpen(false); } }}>Add</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------ Instruments and Setups ------------------------ */

type ItemRow = Record<string, string | boolean | number | null> & { id: string; disabled: boolean };

function ItemList({ table, field, label, describe }: { table: "instruments" | "setups"; field: "symbol" | "name"; label: string; describe?: boolean }) {
  const { journal } = useJournal();
  const t = useJournalTable(table, journal?.id, "position", true);
  const usage = useUsage();
  const [tab, setTab] = useState<"active" | "disabled">("active");
  const [name, setName] = useState("");
  const all = t.rows as unknown as ItemRow[];
  const rows = all.filter((r) => (tab === "disabled") === !!r.disabled);
  const { rowProps, over } = useDragReorder(rows.map((r) => r.id), (ids) => t.reorder(ids));
  const used = (n: string) => (table === "instruments" ? usage.inst : usage.setup).get(n) ?? 0;
  const exists = (n: string, except?: string) => all.some((r) => r.id !== except && String(r[field] ?? "").toLowerCase() === n.toLowerCase());
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    if (exists(n)) { toast.error(`${label} "${n}" already exists${all.find((r) => String(r[field]).toLowerCase() === n.toLowerCase())?.disabled ? " (it is under Disabled Items)" : ""}`); return; }
    await t.insert({ [field]: n, position: all.length } as never); setName("");
  };
  const extra = describe ? "description" : null;
  return (
    <div className="max-w-[700px]">
      <ItemsToggle value={tab} onChange={setTab} disabledCount={all.filter((r) => r.disabled).length} />
      {tab === "active" && (
        <form className="mb-4 flex gap-3" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${label}`} aria-label={`New ${label}`} className="h-9 bg-card" />
          <Button type="submit" variant={name.trim() ? "ink" : "secondary"} disabled={!name.trim()} className="shrink-0">Add {label}</Button>
        </form>
      )}
      <div className={cn(card, "py-1")}>
        <div className="flex h-[42px] items-center gap-2 px-3 text-[13px] font-semibold"><span className="w-4" /><span className={describe ? "w-[230px]" : "flex-1"}>Name</span>{describe && <span className="flex-1">Description</span>}</div>
        {!rows.length && <p className="px-5 py-8 text-center text-[12px] text-t4">{tab === "active" ? `No ${label.toLowerCase()}s yet.` : "Nothing is disabled."}</p>}
        {rows.map((r) => {
          const n = String(r[field] ?? "");
          return (
            <div key={r.id} {...(tab === "active" ? rowProps(r.id) : {})} className={cn("flex min-h-[37px] items-center gap-2 border-t px-3 text-[13px]", over === r.id && "bg-muted")}>
              {tab === "active" ? <DragHandle /> : <span className="w-4" />}
              {tab === "active"
                ? <EditableText value={n} label={label} className={describe ? "!flex-none w-[230px]" : undefined} onSave={(v) => { if (exists(v, r.id)) toast.error(`${label} "${v}" already exists`); else void t.update(r.id, { [field]: v } as never); }} />
                : <span className={cn("px-2", describe ? "w-[230px]" : "flex-1")}>{n}</span>}
              {extra && <EditableText value={String(r[extra] ?? "")} label="Description" className="text-t3" onSave={(v) => void t.update(r.id, { [extra]: v } as never)} />}
              {tab === "disabled" && <span className="flex-1 text-[11px] text-t4">{plural(used(n), "trade")}</span>}
              <RowActions disabled={tab === "disabled"} name={n} used={used(n)}
                onDisable={() => { void t.update(r.id, { disabled: true } as never); toast.success(`"${n}" disabled. It stays on your existing trades; restore it under Disabled Items.`); }}
                onRestore={() => void t.update(r.id, { disabled: false } as never)} onDelete={() => void t.remove(r.id)} />
            </div>
          );
        })}
      </div>
      {tab === "active" && describe && <p className="mt-2 text-[11px] text-t4">Double-click a name or description to edit it. Drag the handle to reorder.</p>}
    </div>
  );
}

/* ------------------------------ Trade comments ------------------------------ */

type CommentRow = { id: string; label: string; phase: string; sentiment: string; disabled: boolean };
const PHASES: [string, string][] = [["entry", "Entry Comments"], ["management", "Trade Management"], ["exit", "Exit Comments"]];

function AddPopover({ title, placeholder, onAdd, withSentiment }: { title: string; placeholder: string; onAdd: (label: string, sentiment: string) => Promise<boolean>; withSentiment?: boolean }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [sentiment, setSentiment] = useState("neutral");
  const submit = async () => { if (label.trim() && await onAdd(label.trim(), sentiment)) { setLabel(""); setOpen(false); } };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-8" aria-label={`Add to ${title}`}>Add <Plus className="h-3.5 w-3.5" /></Button></PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2 p-3">
        <Input autoFocus aria-label={placeholder} placeholder={placeholder} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
        {withSentiment && <select aria-label="Classification" className={sel} value={sentiment} onChange={(e) => setSentiment(e.target.value)}><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option></select>}
        <Button size="sm" className="w-full" disabled={!label.trim()} onClick={() => void submit()}>Add</Button>
      </PopoverContent>
    </Popover>
  );
}

function PhaseCard({ phase, title, rows, tab, t, usage, all }: { phase: string; title: string; rows: CommentRow[]; tab: "active" | "disabled"; t: ReturnType<typeof useJournalTable<"comment_definitions">>; usage: Map<string, number>; all: CommentRow[] }) {
  const { rowProps, over } = useDragReorder(rows.map((r) => r.id), (ids) => t.reorder(ids));
  return (
    <section className={cn(card, "min-w-0 pb-2")}>
      <div className="flex h-[58px] items-center justify-between border-b px-[14px]">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {tab === "active" && <AddPopover title={title} placeholder="New comment" withSentiment onAdd={async (label, sentiment) => {
          if (all.some((c) => c.phase === phase && c.label.toLowerCase() === label.toLowerCase())) { toast.error(`"${label}" already exists in ${title}`); return false; }
          await t.insert({ phase, label, sentiment, position: all.length } as never); return true;
        }} />}
      </div>
      {!rows.length && <p className="px-4 py-8 text-center text-[12px] text-t4">{tab === "active" ? "No comments added" : "Nothing is disabled."}</p>}
      {rows.map((c) => (
        <div key={c.id} {...(tab === "active" ? rowProps(c.id) : {})} className={cn("flex min-h-[41px] items-center gap-1 px-2 text-[13px]", over === c.id && "bg-muted")}>
          {tab === "active" ? <DragHandle /> : <span className="w-4" />}
          {tab === "active" ? <EditableText value={c.label} label="Comment" onSave={(v) => void t.update(c.id, { label: v } as never)} /> : <span className="flex-1 px-2">{c.label}</span>}
          <select aria-label={`Classification of ${c.label}`} className={cn("h-8 shrink-0 bg-transparent px-1 text-[12px] outline-none", sentimentTone(c.sentiment))} value={c.sentiment} onChange={(e) => t.update(c.id, { sentiment: e.target.value } as never)}>
            <option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option>
          </select>
          <RowActions disabled={tab === "disabled"} name={c.label} used={usage.get(c.id) ?? 0}
            onDisable={() => { void t.update(c.id, { disabled: true } as never); toast.success(`"${c.label}" disabled. It stays on your existing trades.`); }}
            onRestore={() => void t.update(c.id, { disabled: false } as never)} onDelete={() => void t.remove(c.id)} />
        </div>
      ))}
    </section>
  );
}

function Comments() {
  const { journal } = useJournal();
  const t = useJournalTable("comment_definitions", journal?.id, "position", true);
  const usage = useUsage();
  const [tab, setTab] = useState<"active" | "disabled">("active");
  const all = t.rows as unknown as CommentRow[];
  return (
    <div>
      <ItemsToggle value={tab} onChange={setTab} disabledCount={all.filter((c) => c.disabled).length} />
      <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        {PHASES.map(([phase, title]) => <PhaseCard key={phase} phase={phase} title={title} tab={tab} t={t} usage={usage.comment} all={all} rows={all.filter((c) => c.phase === phase && (tab === "disabled") === !!c.disabled)} />)}
      </div>
    </div>
  );
}

/* -------------------------------- Sessions -------------------------------- */

function SessionCategories() {
  const { journal, refresh } = useJournal();
  const [tab, setTab] = useState<"active" | "disabled">("active");
  const [name, setName] = useState("");
  const active = journal?.session_categories ?? [];
  const disabled = journal?.disabled_session_categories ?? [];
  const list = tab === "active" ? active : disabled;
  const save = async (patch: { session_categories?: string[]; disabled_session_categories?: string[] }) => {
    if (!journal) return;
    const { error } = await supabase.from("journals").update(patch).eq("id", journal.id);
    if (error) toast.error(error.message); else refresh();
  };
  const { rowProps, over } = useDragReorder(list, (next) => void save({ session_categories: next }));
  /** Sessions store category names as text, so a rename has to be applied to them too. */
  const rename = async (from: string, to: string) => {
    if (!journal || [...active, ...disabled].some((c) => c.toLowerCase() === to.toLowerCase())) { toast.error(`"${to}" already exists`); return; }
    const { data: sessions } = await supabase.from("diary_sessions").select("id,categories").eq("journal_id", journal.id).contains("categories", [from]);
    await Promise.all((sessions ?? []).map((s) => supabase.from("diary_sessions").update({ categories: s.categories.map((c: string) => (c === from ? to : c)) }).eq("id", s.id)));
    await save({ session_categories: active.map((c) => (c === from ? to : c)) });
  };
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    if ([...active, ...disabled].some((c) => c.toLowerCase() === n.toLowerCase())) { toast.error(`"${n}" already exists${disabled.includes(n) ? " (it is under Disabled Items)" : ""}`); return; }
    await save({ session_categories: [...active, n] }); setName("");
  };
  return (
    <div className="max-w-[700px]">
      <ItemsToggle value={tab} onChange={setTab} disabledCount={disabled.length} />
      {tab === "active" && (
        <form className="mb-4 flex gap-3" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New Session Category" aria-label="New Session Category" className="h-9 bg-card" />
          <Button type="submit" variant={name.trim() ? "ink" : "secondary"} disabled={!name.trim()} className="shrink-0">Add Session Category</Button>
        </form>
      )}
      <div className={cn(card, "py-1")}>
        <div className="flex h-[42px] items-center px-3 pl-9 text-[13px] font-semibold">Name</div>
        {!list.length && <p className="px-5 py-8 text-center text-[12px] text-t4">{tab === "active" ? "No session categories yet." : "Nothing is disabled."}</p>}
        {list.map((c) => (
          <div key={c} {...(tab === "active" ? rowProps(c) : {})} className={cn("flex min-h-[37px] items-center gap-2 border-t px-3 text-[13px]", over === c && "bg-muted")}>
            {tab === "active" ? <DragHandle /> : <span className="w-4" />}
            {tab === "active" ? <EditableText value={c} label="Session category" onSave={(v) => void rename(c, v)} /> : <span className="flex-1 px-2">{c}</span>}
            <RowActions disabled={tab === "disabled"} name={c} used={0}
              onDisable={() => { void save({ session_categories: active.filter((x) => x !== c), disabled_session_categories: [...disabled, c] }); toast.success(`"${c}" disabled. Existing sessions keep it.`); }}
              onRestore={() => void save({ session_categories: [...active, c], disabled_session_categories: disabled.filter((x) => x !== c) })}
              onDelete={() => void save({ disabled_session_categories: disabled.filter((x) => x !== c) })} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- Custom statistics ---------------------------- */

type CatRow = { id: string; name: string; position: number };
type OptRow = { id: string; label: string; category_id: string; disabled: boolean };
const SLOTS = 20;

function StatCard({ slot, cat, tab, cats, options, opts, usage }: { slot: number; cat?: CatRow; tab: "active" | "disabled"; cats: ReturnType<typeof useJournalTable<"custom_stat_categories">>; options: ReturnType<typeof useJournalTable<"custom_stat_options">>; opts: OptRow[]; usage: Map<string, number> }) {
  const mine = opts.filter((o) => o.category_id === cat?.id);
  const shown = mine.filter((o) => (tab === "disabled") === !!o.disabled);
  const { rowProps, over } = useDragReorder(shown.map((o) => o.id), (ids) => options.reorder(ids));
  const title = cat?.name ?? `Custom Comment ${slot}`;
  const remove = () => {
    if (!cat) return;
    const n = mine.reduce((a, o) => a + (usage.get(o.id) ?? 0), 0);
    if (confirm(`Permanently delete "${cat.name}" and all of its tags?${n ? ` ${plural(n, "tag assignment")} on your trades will be removed too.` : ""} This cannot be undone.`)) void cats.remove(cat.id);
  };
  return (
    <section className={cn(card, "group min-h-[200px] min-w-0 pb-2")}>
      <div className="flex h-[58px] items-center justify-between gap-2 border-b px-[14px]">
        {cat ? <EditableText value={cat.name} label="Statistic name" className="!px-0 text-[13px] font-semibold" onSave={(v) => void cats.update(cat.id, { name: v } as never)} /> : <h3 className="truncate text-[13px] font-semibold">{title}</h3>}
        {cat && <button type="button" aria-label={`Delete statistic ${cat.name}`} title="Delete this statistic" onClick={remove} className="rounded p-1 text-t4 opacity-0 hover:bg-muted hover:text-loss focus:opacity-100 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
        {tab === "active" && <AddPopover title={title} placeholder="New tag" onAdd={async (label) => {
          if (cat && mine.some((o) => o.label.toLowerCase() === label.toLowerCase())) { toast.error(`"${label}" already exists in ${title}`); return false; }
          let id = cat?.id;
          if (!id) { const made = await cats.insert({ name: title, position: slot - 1 } as never); id = (made as unknown as CatRow | undefined)?.id; }
          if (!id) return false;
          await options.insert({ category_id: id, label, position: mine.length } as never); return true;
        }} />}
      </div>
      {!shown.length && <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-[12px] text-t3"><MessageSquare className="h-8 w-8 text-t4" strokeWidth={1.25} />{tab === "active" ? "No comments added" : "Nothing is disabled."}</div>}
      {shown.map((o) => (
        <div key={o.id} {...(tab === "active" ? rowProps(o.id) : {})} className={cn("flex min-h-[41px] items-center gap-1 px-2 text-[13px]", over === o.id && "bg-muted")}>
          {tab === "active" ? <DragHandle /> : <span className="w-4" />}
          {tab === "active" ? <EditableText value={o.label} label="Tag" onSave={(v) => void options.update(o.id, { label: v } as never)} /> : <span className="flex-1 px-2">{o.label}</span>}
          <RowActions disabled={tab === "disabled"} name={o.label} used={usage.get(o.id) ?? 0}
            onDisable={() => { void options.update(o.id, { disabled: true } as never); toast.success(`"${o.label}" disabled. It stays on your existing trades.`); }}
            onRestore={() => void options.update(o.id, { disabled: false } as never)} onDelete={() => void options.remove(o.id)} />
        </div>
      ))}
    </section>
  );
}

function CustomStatistics() {
  const { journal } = useJournal();
  const cats = useJournalTable("custom_stat_categories", journal?.id, "position", true);
  const options = useJournalTable("custom_stat_options", journal?.id, "position", true);
  const usage = useUsage();
  const [tab, setTab] = useState<"active" | "disabled">("active");
  const catRows = cats.rows as unknown as CatRow[];
  const opts = options.rows as unknown as OptRow[];
  // 20 fixed slots: used ones in order, then empty "Custom Comment N" placeholders
  const slots = Array.from({ length: SLOTS }, (_, i) => catRows[i]);
  return (
    <div>
      <ItemsToggle value={tab} onChange={setTab} disabledCount={opts.filter((o) => o.disabled).length} />
      <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
        {slots.map((cat, i) => <StatCard key={cat?.id ?? `slot-${i}`} slot={i + 1} cat={cat} tab={tab} cats={cats} options={options} opts={opts} usage={usage.option} />)}
      </div>
    </div>
  );
}
