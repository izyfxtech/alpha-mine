import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Empty, PageHeader, Panel } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import { createJournal, useJournal } from "@/lib/journal-context";
import { useProfile, type ProfileSettings } from "@/lib/profile-settings";
import { useJournalTable } from "@/lib/crud";
import { SETTINGS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings/$section")({
  head: ({ params }) => {
    const label = SETTINGS.find(([s]) => s === params.section)?.[1] ?? "Settings";
    const title = `${label} Settings — AlphaMine`;
    const description = `Manage ${label.toLowerCase()} settings in AlphaMine.`;
    return { meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  beforeLoad: ({ params }) => { if (!SETTINGS.some(([s]) => s === params.section)) throw notFound(); },
  notFoundComponent: () => <Empty>That settings page doesn't exist.</Empty>,
  component: SettingsPage,
});

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NGN", "ZAR", "INR"];
const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";

function SettingsPage() {
  const { section } = Route.useParams();
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav className="space-y-1">
          {SETTINGS.map(([s, l]) => (
            <Link key={s} to="/settings/$section" params={{ section: s }} className={cn("block rounded-md px-3 py-2 text-sm hover:bg-muted", s === section && "bg-muted font-semibold")}>{l}</Link>
          ))}
        </nav>
        <div className="max-w-3xl">
          {section === "account" && <Account />}
          {section === "journal" && <JournalSettings />}
          {section === "instruments" && <ListEditor table="instruments" field="symbol" label="Instrument" extra="asset_class" extraLabel="Asset class" />}
          {section === "setups" && <ListEditor table="setups" field="name" label="Setup" extra="description" extraLabel="Description" />}
          {section === "comments" && <Comments />}
          {section === "custom-statistics" && <CustomStatistics />}
          {section === "sessions" && <SessionCategories />}
          {section === "cashflows" && <Cashflows />}
        </div>
      </div>
    </div>
  );
}

function Account() {
  const qc = useQueryClient();
  const { profile: data, settings, saveSettings } = useProfile();
  const [f, setF] = useState({ display_name: "", base_currency: "USD" });
  const [pw, setPw] = useState("");
  useEffect(() => { if (data) setF({ display_name: data.display_name, base_currency: data.base_currency }); }, [data]);
  return (
    <div className="space-y-5">
      <Panel title="Profile">
        <div className="space-y-3">
          <div><Label className="text-xs">Email</Label><Input value={data?.email ?? ""} disabled /></div>
          <div><Label className="text-xs">Display name</Label><Input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></div>
          <div><Label className="text-xs">Base currency</Label><select className={sel} value={f.base_currency} onChange={(e) => setF({ ...f, base_currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <Button onClick={async () => {
            const { error } = await supabase.from("profiles").upsert({ id: data!.id, ...f });
            if (error) toast.error(error.message); else { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["profile"] }); }
          }}>Save profile</Button>
        </div>
      </Panel>
      <Panel title="Preferences">
        <div className="space-y-4">
          {([ ["showWeeklyTotals", "Show weekly totals in the calendar"], ["showCalendarWinrate", "Show winrate next to the trade count in the calendar"], ["showBalance", "Show account balance"], ["allowSharing", "Allow journal sharing"] ] as [keyof ProfileSettings, string][]).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4 text-sm"><Label htmlFor={key}>{label}</Label><Switch id={key} checked={settings[key]} onCheckedChange={async (checked) => { try { await saveSettings({ [key]: checked }); } catch { toast.error("Could not save preference"); } }} /></div>
          ))}
        </div>
      </Panel>
      <Panel title="Change password">
        <div className="flex gap-2">
          <Input type="password" placeholder="New password (min 8 characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Button disabled={pw.length < 8} onClick={async () => {
            const { error } = await supabase.auth.updateUser({ password: pw });
            if (error) toast.error(error.message); else { toast.success("Password updated"); setPw(""); }
          }}>Update</Button>
        </div>
      </Panel>
    </div>
  );
}

function JournalSettings() {
  const { journal, journals, setJournalId, refresh } = useJournal();
  const [f, setF] = useState({ name: "", broker: "", currency: "USD", starting_balance: "10000", markets: "", trade_type: "Spot", auto_pnl: true });
  useEffect(() => { if (journal) setF({ name: journal.name, broker: journal.broker ?? "", currency: journal.currency, starting_balance: String(journal.starting_balance), markets: journal.markets.join(", "), trade_type: journal.trade_type, auto_pnl: journal.auto_pnl }); }, [journal?.id]);
  if (!journal) return null;
  return (
    <div className="space-y-5">
      <Panel title="Current journal">
        <div className="grid gap-3 grid-cols-2">
          <div><Label className="text-xs">Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label className="text-xs">Broker</Label><Input value={f.broker} onChange={(e) => setF({ ...f, broker: e.target.value })} /></div>
          <div><Label className="text-xs">Currency</Label><select className={sel} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><Label className="text-xs">Starting balance</Label><Input type="number" value={f.starting_balance} onChange={(e) => setF({ ...f, starting_balance: e.target.value })} /></div>
          <div><Label className="text-xs">Markets traded</Label><Input value={f.markets} placeholder="Stocks, Forex" onChange={(e) => setF({ ...f, markets: e.target.value })} /></div>
          <div><Label className="text-xs">Trade type</Label><select className={sel} value={f.trade_type} onChange={(e) => setF({ ...f, trade_type: e.target.value })}>{["Spot", "Futures", "Options", "CFD"].map((v) => <option key={v}>{v}</option>)}</select></div>
          <div className="col-span-2 flex items-center gap-3"><Switch id="auto_pnl" checked={f.auto_pnl} onCheckedChange={(v) => setF({ ...f, auto_pnl: v })} /><Label htmlFor="auto_pnl">Calculate P&L automatically</Label></div>
        </div>
        <div className="mt-4 flex justify-between">
          <Button onClick={async () => {
            const { error } = await supabase.from("journals").update({ ...f, broker: f.broker || null, markets: f.markets.split(",").map((x) => x.trim()).filter(Boolean), starting_balance: Number(f.starting_balance) }).eq("id", journal.id);
            if (error) toast.error(error.message); else { toast.success("Journal saved"); refresh(); }
          }}>Save journal</Button>
          <Button variant="ghost" className="text-loss" disabled={journals.length < 2} onClick={async () => {
            if (!confirm(`Delete "${journal.name}" and all its trades? This cannot be undone.`)) return;
            await supabase.from("journals").delete().eq("id", journal.id);
            setJournalId(journals.find((j) => j.id !== journal.id)!.id); refresh();
          }}><Trash2 className="h-4 w-4" /> Delete journal</Button>
        </div>
      </Panel>
      <Panel title="All journals" action={<Button size="sm" variant="outline" onClick={async () => { const j = await createJournal(`Journal ${journals.length + 1}`); setJournalId(j.id); refresh(); }}>New journal</Button>}>
        {journals.map((j) => (
          <button key={j.id} onClick={() => setJournalId(j.id)} className={cn("flex w-full justify-between border-b py-2.5 text-left text-sm last:border-0", j.id === journal.id && "font-semibold")}>
            <span>{j.name}</span><span className="text-muted-foreground">{j.currency} · {Number(j.starting_balance).toLocaleString()}</span>
          </button>
        ))}
      </Panel>
    </div>
  );
}

function ListEditor({ table, field, label, extra, extraLabel }: { table: "instruments" | "setups"; field: "symbol" | "name"; label: string; extra: "asset_class" | "description"; extraLabel: string }) {
  const { journal } = useJournal();
  const t = useJournalTable(table, journal?.id, "position", true);
  const [a, setA] = useState(""); const [b, setB] = useState("");
  return (
    <Panel title={`${label}s`}>
      <div className="mb-4 flex gap-2">
        <Input placeholder={label} value={a} onChange={(e) => setA(e.target.value)} />
        <Input placeholder={extraLabel} value={b} onChange={(e) => setB(e.target.value)} />
        <Button disabled={!a.trim()} onClick={async () => { await t.insert({ [field]: a.trim(), [extra]: b || null } as never); setA(""); setB(""); }}>Add</Button>
      </div>
      {!t.rows.length ? <p className="text-sm text-muted-foreground">None yet.</p> : t.rows.map((r) => {
        const row = r as unknown as Record<string, string | null> & { id: string };
        return (
          <div key={row.id} className="flex items-center gap-2 border-b py-2 last:border-0">
            <Input defaultValue={row[field] ?? ""} className="h-8" onBlur={(e) => e.target.value !== row[field] && t.update(row.id, { [field]: e.target.value } as never)} />
            <Input defaultValue={row[extra] ?? ""} className="h-8" placeholder={extraLabel} onBlur={(e) => e.target.value !== (row[extra] ?? "") && t.update(row.id, { [extra]: e.target.value || null } as never)} />
            <MoveButtons row={row.id} move={t.move} />
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Delete ${row[field]}`} onClick={() => t.remove(row.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        );
      })}
    </Panel>
  );
}

function Comments() {
  const { journal } = useJournal();
  const t = useJournalTable("comment_definitions", journal?.id, "position", true);
  const [f, setF] = useState({ phase: "entry", label: "", sentiment: "neutral" });
  return (
    <div className="space-y-5">
      <Panel title="Add trade comment">
        <p className="mb-3 text-sm text-muted-foreground">Comments feed the tilt meter: positive comments move it green, negative ones red.</p>
        <div className="flex gap-2">
          <select className={sel + " w-40"} value={f.phase} onChange={(e) => setF({ ...f, phase: e.target.value })}><option value="entry">Entry</option><option value="management">Management</option><option value="exit">Exit</option></select>
          <Input placeholder="Comment" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <select className={sel + " w-36"} value={f.sentiment} onChange={(e) => setF({ ...f, sentiment: e.target.value })}><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option></select>
          <Button disabled={!f.label.trim()} onClick={async () => { await t.insert(f); setF({ ...f, label: "" }); }}>Add</Button>
        </div>
      </Panel>
      {(["entry", "management", "exit"] as const).map((phase) => (
        <Panel key={phase} title={<span className="capitalize">{phase} comments</span>}>
           <div className="space-y-2">
            {t.rows.filter((c) => c.phase === phase).map((c) => (
               <div key={c.id} className="flex items-center gap-2"><Input className="h-8 flex-1" defaultValue={c.label} onBlur={(e) => e.target.value !== c.label && t.update(c.id, { label: e.target.value })} /><select className={sel + " w-28"} value={c.sentiment} aria-label={`${c.label} sentiment`} onChange={(e) => t.update(c.id, { sentiment: e.target.value })}><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option></select><MoveButtons row={c.id} move={(id, dir) => t.move(id, dir, { field: "phase", value: phase })} /><Button variant="ghost" size="icon" aria-label={`Delete ${c.label}`} onClick={() => t.remove(c.id)}><Trash2 className="h-4 w-4" /></Button></div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}

function MoveButtons({ row, move }: { row: string; move: (id: string, dir: -1 | 1) => Promise<void> }) {
  return <span className="flex shrink-0"><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move up" onClick={() => move(row, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Move down" onClick={() => move(row, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button></span>;
}

function CustomStatistics() {
  const { journal } = useJournal();
  const cats = useJournalTable("custom_stat_categories", journal?.id, "position", true);
  const options = useJournalTable("custom_stat_options", journal?.id, "position", true);
  const [name, setName] = useState("");
  const [tags, setTags] = useState<Record<string, string>>({});
  return <div className="space-y-5"><Panel title={`Custom Statistics (${cats.rows.length}/20)`}>
    <div className="flex gap-2"><Input placeholder="Statistic name" value={name} onChange={(e) => setName(e.target.value)} /><Button disabled={!name.trim() || cats.rows.length >= 20} onClick={async () => { const r = await cats.insert({ name: name.trim(), position: cats.rows.length }); if (r) setName(""); }}>Add</Button></div>
  </Panel>{cats.rows.map((c) => <Panel key={c.id} title={<div className="flex items-center gap-2"><Input aria-label="Statistic name" className="h-8" defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && cats.update(c.id, { name: e.target.value })} /><MoveButtons row={c.id} move={cats.move} /><Button variant="ghost" size="icon" aria-label={`Delete ${c.name}`} onClick={() => { if (confirm(`Delete ${c.name} and its tags?`)) cats.remove(c.id); }}><Trash2 className="h-4 w-4" /></Button></div>}>
    <div className="space-y-2">{options.rows.filter((o) => o.category_id === c.id).map((o) => <div className="flex items-center gap-2" key={o.id}><Input aria-label="Tag" className="h-8" defaultValue={o.label} onBlur={(e) => e.target.value !== o.label && options.update(o.id, { label: e.target.value })} /><MoveButtons row={o.id} move={(id, dir) => options.move(id, dir, { field: "category_id", value: c.id })} /><Button variant="ghost" size="icon" aria-label={`Delete ${o.label}`} onClick={() => options.remove(o.id)}><Trash2 className="h-4 w-4" /></Button></div>)}
      <div className="flex gap-2"><Input placeholder="New tag" value={tags[c.id] ?? ""} onChange={(e) => setTags({ ...tags, [c.id]: e.target.value })} /><Button variant="outline" disabled={!tags[c.id]?.trim()} onClick={async () => { const r = await options.insert({ category_id: c.id, label: tags[c.id].trim(), position: options.rows.filter((o) => o.category_id === c.id).length }); if (r) setTags({ ...tags, [c.id]: "" }); }}>Add tag</Button></div>
    </div></Panel>)}</div>;
}

function SessionCategories() {
  const { journal, refresh } = useJournal();
  const [name, setName] = useState("");
  const values = journal?.session_categories ?? [];
  const save = async (next: string[]) => { if (!journal) return; const { error } = await supabase.from("journals").update({ session_categories: next }).eq("id", journal.id); if (error) toast.error(error.message); else refresh(); };
  return <Panel title="Session Categories"><div className="space-y-2">{values.map((v, i) => <div key={`${i}-${v}`} className="flex items-center gap-2"><Input defaultValue={v} aria-label="Category name" onBlur={(e) => { if (e.target.value.trim() && e.target.value !== v) save(values.map((x, j) => j === i ? e.target.value.trim() : x)); }} /><Button size="icon" variant="ghost" aria-label="Move up" disabled={!i} onClick={() => { const next = [...values]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; save(next); }}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label="Move down" disabled={i === values.length - 1} onClick={() => { const next = [...values]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; save(next); }}><ArrowDown className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Delete ${v}`} onClick={() => save(values.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>)}<div className="flex gap-2"><Input placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} /><Button disabled={!name.trim() || values.includes(name.trim())} onClick={async () => { await save([...values, name.trim()]); setName(""); }}>Add</Button></div></div></Panel>;
}

function Cashflows() {
  const { journal } = useJournal();
  const t = useJournalTable("journal_cashflows", journal?.id, "occurred_on", false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState("deposit");
  const [note, setNote] = useState("");
  return <Panel title="Deposits & Withdrawals"><div className="grid gap-2 sm:grid-cols-[140px_120px_1fr]"><Input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} /><select aria-label="Type" className={sel} value={kind} onChange={(e) => setKind(e.target.value)}><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option></select><Input type="number" step="0.01" min="0.01" placeholder="Amount" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></div><div className="mt-2 flex gap-2"><Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} /><Button disabled={!date || !Number.isFinite(Number(amount)) || Number(amount) <= 0} onClick={async () => { const r = await t.insert({ occurred_on: date, amount: (kind === "withdrawal" ? -1 : 1) * Number(amount), note: note || null }); if (r) { setAmount(""); setNote(""); } }}>Add</Button></div><div className="mt-5 divide-y">{t.rows.map((r) => <div key={r.id} className="flex items-center gap-3 py-2 text-sm"><span>{r.occurred_on}</span><span className={cn("flex-1 tabular", Number(r.amount) >= 0 ? "text-profit" : "text-loss")}>{Number(r.amount).toLocaleString(undefined, { style: "currency", currency: journal?.currency ?? "USD" })}</span><span className="text-muted-foreground">{r.note}</span><Button variant="ghost" size="icon" aria-label="Delete transaction" onClick={() => t.remove(r.id)}><Trash2 className="h-4 w-4" /></Button></div>)}</div></Panel>;
}
