import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUp, CalendarDays, ChevronDown, Plus, Star, Trash2, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { RichEditor } from "@/components/RichEditor";
import { TiltMeter } from "@/components/kit";
import { useJournal, useTrades } from "@/lib/journal-context";
import { useJournalTable, type Row } from "@/lib/crud";
import { computeStats, dayKey, fmtMoney, fmtNum, type Trade } from "@/lib/metrics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/diary/sessions")({
  head: () => ({ meta: [{ title: "Sessions — AlphaMine" }, { name: "description", content: "Review trading periods with ratings, notes and stats." }, { property: "og:title", content: "Sessions — AlphaMine" }, { property: "og:description", content: "Review trading periods with ratings, notes and stats." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Sessions,
});

type Session = Row<"diary_sessions">;

const inPeriod = (t: Trade, a?: string | null, b?: string | null) => { const d = dayKey(t.entry_at); return (!a || d >= a) && (!b || d <= b); };
const avgTilt = (ts: Trade[]) => (ts.length ? ts.reduce((s, t) => s + t.tilt, 0) / ts.length : 0);

function Stars({ value, onChange, size = "h-4 w-4" }: { value: number; onChange?: (v: number) => void; size?: string }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" disabled={!onChange} onClick={() => onChange?.(i)} aria-label={`${i} stars`}>
          <Star className={cn(size, "text-star", i <= value && "fill-star")} />
        </button>
      ))}
    </span>
  );
}

function Sessions() {
  const { journal } = useJournal();
  const { trades } = useTrades({ unfiltered: true });
  const t = useJournalTable("diary_sessions", journal?.id, "period_start", true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<{ a: string; b: string }>({ a: "", b: "" });
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Session | "new" | null>(null);
  const [asc, setAsc] = useState(true);
  const start = journal?.starting_balance ?? 0;

  const rows = useMemo(() => t.rows
    .filter((r) => (!range.a || (r.period_end ?? r.session_date) >= range.a) && (!range.b || (r.period_start ?? r.session_date) <= range.b))
    .filter((r) => !cats.size || (r.categories ?? []).some((c) => cats.has(c)))
    .sort((x, y) => ((x.period_start ?? "") < (y.period_start ?? "") ? -1 : 1) * (asc ? 1 : -1)), [t.rows, range, cats, asc]);

  return (
    <div>
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <Button variant="ink" size="sm" onClick={() => setEdit("new")}><Plus className="h-4 w-4" />Add More</Button>
          <Button variant="secondary" size="sm" disabled={!sel.size} onClick={async () => { await Promise.all([...sel].map((id) => t.remove(id))); setSel(new Set()); }}><Trash2 className="h-4 w-4" />Delete</Button>
          <div className="flex-1" />
          <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
            <CalendarDays className="h-4 w-4" />
            <input type="date" value={range.a} onChange={(e) => setRange({ ...range, a: e.target.value })} className="bg-transparent outline-none" aria-label="Start date" />
            <span>–</span>
            <input type="date" value={range.b} onChange={(e) => setRange({ ...range, b: e.target.value })} className="bg-transparent outline-none" aria-label="End date" />
          </label>
           <CategorySelect categories={journal?.session_categories ?? []} value={cats} onChange={setCats} className="w-80" placeholder="Session Categories" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-xs">
            <thead>
              <tr className="text-left font-semibold">
                <th className="w-10 px-4 py-2.5" /><th className="w-3" />
                <th className="cursor-pointer px-3 py-2.5 font-semibold" onClick={() => setAsc(!asc)}><span className="inline-flex items-center gap-1">Period<ArrowUp className={cn("h-3 w-3", !asc && "rotate-180")} /></span></th>
                <th className="px-3 font-semibold">Rating</th>
                {["Trades", "Winners", "Losers", "Break even", "Winrate"].map((h) => <th key={h} className="px-3 text-center font-semibold">{h}</th>)}
                <th className="px-3 text-center font-semibold">Tiltmeter</th>
                {["Return", "Return (%)", "R-Multiple"].map((h) => <th key={h} className="px-3 text-right font-semibold">{h}</th>)}
                <th className="w-full" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={14} className="py-10 text-center text-sm text-muted-foreground">No sessions yet. Click “Add More” to review a trading period.</td></tr>}
              {rows.map((r) => {
                const ts = trades.filter((x) => inPeriod(x, r.period_start ?? r.session_date, r.period_end ?? r.session_date));
                const s = computeStats(ts, start);
                return (
                  <tr key={r.id} onClick={() => setEdit(r)} className="cursor-pointer tabular hover:bg-muted/50">
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={sel.has(r.id)} onCheckedChange={() => setSel((p) => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
                    </td>
                    <td><span className={cn("block h-4 w-0.5", s.net >= 0 ? "bg-profit" : "bg-loss")} /></td>
                    <td className="px-3">{r.period_start ?? r.session_date} - {r.period_end ?? r.session_date}</td>
                    <td className="px-3"><Stars value={r.rating ?? 0} /></td>
                    <td className="px-3 text-center">{s.count}</td>
                    <td className="px-3 text-center">{s.wins}</td>
                    <td className="px-3 text-center">{s.losses}</td>
                    <td className="px-3 text-center">{s.be}</td>
                    <td className="px-3 text-right">{+s.winRate.toFixed(2)}%</td>
                    <td className="px-3 text-center"><TiltMeter value={avgTilt(ts)} /></td>
                    <td className="px-3 text-right">{s.net.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 text-right">{fmtNum(s.roi)}</td>
                    <td className="px-3 text-right">{fmtNum(s.totalR)}</td>
                    <td />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {edit && <SessionSheet key={edit === "new" ? "new" : edit.id} session={edit === "new" ? null : edit} trades={trades} start={start} currency={journal?.currency} categories={journal?.session_categories ?? []}
        onClose={() => setEdit(null)}
        onSave={async (v) => { if (edit === "new") await t.insert(v); else await t.update(edit.id, v); setEdit(null); }} />}
    </div>
  );
}

function CategorySelect({ categories, value, onChange, className, placeholder }: { categories: string[]; value: Set<string>; onChange: (s: Set<string>) => void; className?: string; placeholder: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("flex h-9 items-center justify-between gap-2 rounded-md border bg-card px-3 text-sm", className)}>
        <span className="truncate">{value.size ? [...value].join(", ") : placeholder}</span><ChevronDown className="h-4 w-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
         {categories.map((c) => (
          <DropdownMenuCheckboxItem key={c} checked={value.has(c)} onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => { const n = new Set(value); n.has(c) ? n.delete(c) : n.add(c); onChange(n); }} className="py-2">{c}</DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionSheet({ session, trades, start, currency, categories, onClose, onSave }: {
  session: Session | null; trades: Trade[]; start: number; currency?: string; categories: string[]; onClose: () => void; onSave: (v: Partial<Session>) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [a, setA] = useState(session?.period_start ?? session?.session_date ?? today);
  const [b, setB] = useState(session?.period_end ?? session?.session_date ?? today);
  const [cats, setCats] = useState<Set<string>>(new Set(session?.categories ?? []));
  const [rating, setRating] = useState(session?.rating ?? 0);
  const [content, setContent] = useState(session?.content ?? session?.notes ?? "");
  const ts = useMemo(() => trades.filter((t) => inPeriod(t, a, b)).sort((x, y) => x.entry_at.localeCompare(y.entry_at)), [trades, a, b]);
  const s = computeStats(ts, start);
  let c = 0;
  const curve = [{ v: 0 }, ...ts.map((t) => ({ v: (c += t.net_pnl) }))];
  const tilt = Math.round(ts.reduce((acc, t) => acc + t.tilt, 0));

  const Box = ({ l, v }: { l: string; v: React.ReactNode }) => (
    <div className="rounded-md bg-muted/60 px-2 py-4 text-center"><p className="text-xs uppercase text-muted-foreground">{l}</p><div className="mt-1 text-sm font-bold tabular">{v}</div></div>
  );

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[500px] [&>button]:hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <SheetTitle className="text-base">{session ? "Edit Session" : "New Session"}</SheetTitle>
          <button onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-5">
          <fieldset className="relative rounded-md border px-3 pb-2 pt-3">
            <legend className="absolute -top-2 left-2 bg-card px-1 text-[11px]">Period *</legend>
            <div className="flex items-center gap-2 text-sm">
              <input type="date" value={a} onChange={(e) => setA(e.target.value)} className="bg-transparent outline-none" />–
              <input type="date" value={b} min={a} onChange={(e) => setB(e.target.value)} className="bg-transparent outline-none" />
            </div>
          </fieldset>
           <CategorySelect categories={categories} value={cats} onChange={setCats} className="h-11 w-full" placeholder="Session Category *" />
          <Stars value={rating} onChange={setRating} size="h-7 w-7" />
          <RichEditor value={content} onChange={setContent} compactToolbar className="min-h-[300px]" />
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Area type="monotone" dataKey="v" stroke="var(--color-profit)" strokeWidth={1.5} fill="transparent" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Box l="Trades" v={s.count} /><Box l="Winners" v={s.wins} /><Box l="Losers" v={s.losses} />
            <Box l="Break even" v={s.be} /><Box l="Winrate" v={`${s.winRate.toFixed(2)}%`} /><Box l="Gain" v={fmtMoney(s.net, currency)} />
            <Box l="Gain %" v={`${s.roi.toFixed(2)}%`} /><Box l="R-Multiple" v={fmtNum(s.totalR)} />
            <Box l={`Tiltmeter ${tilt > 0 ? "+" : ""}${tilt}`} v={<TiltMeter value={avgTilt(ts)} />} />
          </div>
        </div>
        <div className="flex gap-2 border-t px-5 py-4">
          <Button variant="ink" size="sm" disabled={!a || !b || !cats.size}
            onClick={() => onSave({ period_start: a, period_end: b, session_date: a, categories: [...cats], rating, content })}>Save</Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
