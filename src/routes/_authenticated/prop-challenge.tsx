import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Empty, PageHeader, Panel, Stat, pnlTone } from "@/components/kit";
import { useJournalTable, type Row } from "@/lib/crud";
import { useTrades } from "@/lib/journal-context";
import { fmtMoney } from "@/lib/metrics";
import { PRESETS, dayKey, evaluateChallenge, type Amount, type Challenge, type Rule, type RuleProgress } from "@/lib/prop-challenge";

export const Route = createFileRoute("/_authenticated/prop-challenge")({
  head: () => ({ meta: [{ title: "Prop Challenge — AlphaMine" }, { name: "description", content: "Track prop firm challenge rules: profit target, drawdown, daily loss and consistency." }] }),
  component: PropChallengePage,
});

const ZONES = ["UTC", "Europe/London", "Europe/Athens", "America/New_York", "America/Chicago", "Asia/Singapore"];
const STATUS_STYLE = { met: "bg-profit/15 text-profit", pending: "bg-muted text-muted-foreground", breached: "bg-loss/15 text-loss" } as const;
const KIND_LABEL: Record<Rule["kind"], string> = {
  profit_target: "Profit target", max_drawdown: "Max drawdown", daily_loss: "Daily loss limit",
  min_trading_days: "Minimum trading days", min_profitable_days: "Minimum profitable days", consistency: "Consistency",
};
const newRule = (kind: Rule["kind"]): Rule => {
  const id = `${kind}-${Math.random().toString(36).slice(2, 7)}`;
  switch (kind) {
    case "profit_target": return { id, kind, target: { value: 10, unit: "percent" } };
    case "max_drawdown": return { id, kind, limit: { value: 10, unit: "percent" }, mode: "static" };
    case "daily_loss": return { id, kind, limit: { value: 5, unit: "percent" } };
    case "min_trading_days": return { id, kind, days: 4 };
    case "min_profitable_days": return { id, kind, days: 3, minDailyProfit: 0 };
    case "consistency": return { id, kind, maxBestDayPercent: 50 };
  }
};

function PropChallengePage() {
  const { journal, all } = useTrades({ unfiltered: true });
  const table = useJournalTable("prop_challenges", journal?.id, "created_at", true);
  const [creating, setCreating] = useState(false);

  if (!journal) return null;
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="Prop Challenge" subtitle="Replay your closed trades against a firm's rules." action={<Button onClick={() => setCreating((v) => !v)}>{creating ? "Cancel" : "New challenge"}</Button>} />
      {creating && <CreateForm defaultBalance={journal.starting_balance} onCreate={async (v) => { const r = await table.insert(v); if (r) setCreating(false); }} />}
      {!table.isLoading && table.rows.length === 0 && !creating && <Empty>No challenges yet. Create one to see how close you are to passing, and how close you are to a breach.</Empty>}
      {table.rows.map((c) => (
        <ChallengeCard key={c.id} row={c} trades={all} currency={journal.currency} onSave={(rules) => table.update(c.id, { rules: rules as never })} onDelete={() => { if (confirm(`Delete "${c.name}"?`)) table.remove(c.id); }} />
      ))}
    </div>
  );
}

function CreateForm({ defaultBalance, onCreate }: { defaultBalance: number; onCreate: (v: Partial<Row<"prop_challenges">>) => Promise<void> }) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState(String(defaultBalance || 100000));
  const [started, setStarted] = useState("");
  const [zone, setZone] = useState("UTC");
  const [preset, setPreset] = useState(PRESETS[0]!.key);
  const field = "h-9 rounded-md border bg-background px-2 text-sm";
  return (
    <Panel title="New challenge">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        const bal = Number(balance);
        if (!name.trim() || !(bal > 0)) return void toast.error("Give the challenge a name and a starting balance above zero.");
        const rules = PRESETS.find((p) => p.key === preset)!.rules.map((r) => ({ ...r }));
        void onCreate({ name: name.trim(), start_balance: bal, started_on: started || null, time_zone: zone, rules: rules as never });
      }}>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Name<input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 100k Phase 1" /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Starting balance<input className={field} type="number" min="1" value={balance} onChange={(e) => setBalance(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">First trading day (optional)<input className={field} type="date" value={started} onChange={(e) => setStarted(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Firm day ends in time zone<select className={field} value={zone} onChange={(e) => setZone(e.target.value)}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">Rule set<select className={field} value={preset} onChange={(e) => setPreset(e.target.value)}>{PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
        <div className="sm:col-span-2"><Button type="submit">Create</Button></div>
      </form>
    </Panel>
  );
}

function ChallengeCard({ row, trades, currency, onSave, onDelete }: { row: Row<"prop_challenges">; trades: { exit_at: string | null; net_pnl: number }[]; currency: string; onSave: (r: Rule[]) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const rules = (Array.isArray(row.rules) ? row.rules : []) as unknown as Rule[];
  const [draft, setDraft] = useState<Rule[]>(rules);
  const challenge: Challenge = useMemo(() => ({ startBalance: Number(row.start_balance), startMs: row.started_on ? Date.parse(`${row.started_on}T00:00:00Z`) : null, timeZone: row.time_zone, rules }), [row, rules]);
  const progress = useMemo(
    () => evaluateChallenge(challenge, trades.filter((t) => t.exit_at).map((t) => ({ exitMs: Date.parse(t.exit_at!), net: Number(t.net_pnl) }))),
    [challenge, trades],
  );
  const badge = { active: "In progress", passed: "Passed", failed: "Failed" }[progress.status];
  const badgeStyle = { active: "bg-muted text-ink", passed: "bg-profit/15 text-profit", failed: "bg-loss/15 text-loss" }[progress.status];
  return (
    <Panel
      title={<span className="flex items-center gap-2">{row.name}<span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeStyle}`}>{badge}{progress.endedAtMs ? ` · ${dayKey(progress.endedAtMs, row.time_zone)}` : ""}</span></span>}
      action={<div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => { setDraft(rules); setEditing((v) => !v); }}>{editing ? "Close" : "Edit rules"}</Button><Button variant="ghost" size="sm" onClick={onDelete} aria-label="Delete challenge"><Trash className="h-4 w-4" /></Button></div>}
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Balance" value={fmtMoney(progress.balance, currency)} />
        <Stat label="Profit" value={fmtMoney(progress.profit, currency)} tone={pnlTone(progress.profit)} />
        <Stat label="Drawdown floor" value={progress.floor == null ? "—" : fmtMoney(progress.floor, currency)} />
        <Stat label="Trading days" value={progress.tradingDays} />
      </div>
      <ul className="mt-4 space-y-3">{progress.rules.map((r) => <RuleRow key={r.id} r={r} />)}</ul>
      {progress.rules.length === 0 && <p className="mt-3 text-sm text-muted-foreground">This challenge has no rules yet. Use Edit rules to add some.</p>}
      {editing && <RuleEditor rules={draft} onChange={setDraft} onSave={() => { onSave(draft); setEditing(false); }} />}
      {progress.notes.length > 0 && <ul className="mt-4 space-y-1 text-xs text-muted-foreground">{progress.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </Panel>
  );
}

function RuleRow({ r }: { r: RuleProgress }) {
  const danger = r.kind === "max_drawdown" || r.kind === "daily_loss";
  return (
    <li>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{r.label}</span>
        <span className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{r.detail}</span><span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[r.status]}`}>{r.status === "met" ? "Met" : r.status === "breached" ? "Breached" : danger ? "Within limit" : "Pending"}</span></span>
      </div>
      <div className="mt-1.5 h-1.5 rounded bg-muted"><div className={`h-full rounded ${danger ? (r.pct > 80 ? "bg-loss" : "bg-chart-4") : "bg-profit"}`} style={{ width: `${Math.max(r.pct, 2)}%` }} /></div>
    </li>
  );
}

function AmountInput({ a, onChange }: { a: Amount; onChange: (a: Amount) => void }) {
  return (
    <span className="inline-flex gap-1">
      <input className="h-8 w-24 rounded-md border bg-background px-2 text-sm" type="number" min="0" step="any" value={a.value} onChange={(e) => onChange({ ...a, value: Number(e.target.value) })} />
      <select className="h-8 rounded-md border bg-background px-1 text-sm" value={a.unit} onChange={(e) => onChange({ ...a, unit: e.target.value as Amount["unit"] })}><option value="percent">%</option><option value="absolute">amount</option></select>
    </span>
  );
}

function RuleEditor({ rules, onChange, onSave }: { rules: Rule[]; onChange: (r: Rule[]) => void; onSave: () => void }) {
  const set = (i: number, r: Rule) => onChange(rules.map((x, j) => (j === i ? r : x)));
  const num = "h-8 w-24 rounded-md border bg-background px-2 text-sm";
  const has = (k: Rule["kind"]) => rules.some((r) => r.kind === k);
  return (
    <div className="mt-4 space-y-3 rounded-md border p-3">
      {rules.map((r, i) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-44 font-medium">{KIND_LABEL[r.kind]}</span>
          {r.kind === "profit_target" && <AmountInput a={r.target} onChange={(target) => set(i, { ...r, target })} />}
          {r.kind === "max_drawdown" && (<>
            <AmountInput a={r.limit} onChange={(limit) => set(i, { ...r, limit })} />
            <select className="h-8 rounded-md border bg-background px-1" value={r.mode} onChange={(e) => set(i, { ...r, mode: e.target.value as typeof r.mode })}><option value="static">Static</option><option value="eod_trailing">End-of-day trailing</option><option value="intraday_trailing">Intraday trailing</option></select>
            {r.mode !== "static" && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!r.lockAtStart} onChange={(e) => set(i, { ...r, lockAtStart: e.target.checked })} />stops at starting balance</label>}
          </>)}
          {r.kind === "daily_loss" && <AmountInput a={r.limit} onChange={(limit) => set(i, { ...r, limit })} />}
          {r.kind === "min_trading_days" && <input className={num} type="number" min="0" value={r.days} onChange={(e) => set(i, { ...r, days: Number(e.target.value) })} />}
          {r.kind === "min_profitable_days" && (<>
            <input className={num} type="number" min="0" value={r.days} onChange={(e) => set(i, { ...r, days: Number(e.target.value) })} />
            <span className="text-xs text-muted-foreground">days of at least</span>
            <input className={num} type="number" min="0" step="any" value={r.minDailyProfit} onChange={(e) => set(i, { ...r, minDailyProfit: Number(e.target.value) })} />
          </>)}
          {r.kind === "consistency" && (<><span className="text-xs text-muted-foreground">best day below</span><input className={num} type="number" min="1" max="100" value={r.maxBestDayPercent} onChange={(e) => set(i, { ...r, maxBestDayPercent: Number(e.target.value) })} /><span className="text-xs text-muted-foreground">% of profit</span></>)}
          <Button variant="ghost" size="sm" onClick={() => onChange(rules.filter((_, j) => j !== i))} aria-label="Remove rule"><Trash className="h-4 w-4" /></Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <select className="h-8 rounded-md border bg-background px-2 text-sm" value="" onChange={(e) => e.target.value && onChange([...rules, newRule(e.target.value as Rule["kind"])])}>
          <option value="">Add a rule…</option>
          {(Object.keys(KIND_LABEL) as Rule["kind"][]).filter((k) => !["profit_target", "max_drawdown", "daily_loss", "consistency"].includes(k) || !has(k)).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <Button size="sm" onClick={onSave}>Save rules</Button>
      </div>
    </div>
  );
}
