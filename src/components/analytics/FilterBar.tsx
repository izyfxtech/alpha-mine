import { useMemo, useState, type ReactNode } from "react";
import { Bookmark, Calendar, ChevronDown, ChevronRight, Globe, Pencil, RotateCcw, Settings, ShieldCheck, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useSavedFilters } from "@/lib/journal/saved-filters";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { activeFilterCount, useJournal, useLookups, useTrades, type Filters, type Range } from "@/lib/journal/journal-context";
import { cn } from "@/lib/utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]] as const;

export type FilterMode = "closed" | "basic" | "advanced";

/** Toggle shown in the top bar. */
export function FilterToggle({ mode, setMode }: { mode: FilterMode; setMode: (m: FilterMode) => void }) {
  const { filters, setFilters } = useJournal();
  const n = activeFilterCount(filters);
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex h-9 overflow-hidden rounded-md border text-sm">
        <button className={cn("flex items-center gap-1.5 px-3", mode !== "closed" && "bg-muted")} onClick={() => setMode(mode === "closed" ? "basic" : "closed")}>
          {mode === "closed" ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}Basic Filters
          {n > 0 && <span className="rounded-full bg-ink px-1.5 text-xs text-ink-foreground">{n}</span>}
        </button>
        <button className={cn("flex items-center gap-1.5 border-l px-3", mode === "advanced" && "bg-muted")} onClick={() => setMode(mode === "advanced" ? "basic" : "advanced")}>
          {mode === "advanced" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}Advanced Filters
        </button>
      </div>
      {n > 0 && <Button variant="ghost" size="sm" className="h-9 text-sm" onClick={() => setFilters({})}><RotateCcw className="h-4 w-4" />Clear all</Button>}
      <SavedFilters />
    </div>
  );
}

/** Named filter sets: apply with one click, save the current filters under a name, delete old ones. */
function SavedFilters() {
  const { journal, filters, setFilters } = useJournal();
  const { saved, save, remove } = useSavedFilters(journal?.id);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const n = activeFilterCount(filters);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm"><Bookmark className="h-4 w-4" />Saved{saved.length ? ` (${saved.length})` : ""}</Button></PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2 text-sm">
        {saved.length === 0 && <p className="p-2 text-muted-foreground">No saved filters yet. Set some filters, then save them here.</p>}
        {saved.map((s) => (
          <div key={s.id} className="flex items-center gap-1 rounded hover:bg-muted">
            <button className="min-w-0 flex-1 truncate px-2 py-2 text-left" onClick={() => { setFilters(s.filters); setOpen(false); }}>{s.name}<span className="ml-2 text-xs text-muted-foreground">{activeFilterCount(s.filters)} filter{activeFilterCount(s.filters) === 1 ? "" : "s"}</span></button>
            <button aria-label={`Delete ${s.name}`} className="rounded p-2 text-muted-foreground hover:text-foreground" onClick={() => void remove(s.id)}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <form className="mt-2 flex gap-2 border-t pt-2" onSubmit={async (e) => { e.preventDefault(); if (await save(name, filters)) { setName(""); toast.success("Filters saved"); } }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={n ? "Name these filters" : "Set filters first"} aria-label="Saved filter name" className="h-9" disabled={!n} />
          <Button type="submit" size="sm" className="h-9" disabled={!n || !name.trim()}>Save</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function Tile({ icon, label, value, active, onClear, children, wide }: { icon?: ReactNode; label: string; value?: string | undefined; active: boolean; onClear: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn("relative flex h-9 w-full items-center gap-1.5 rounded-md border border-line2 bg-card px-3 text-left text-[12px]", active && "border-foreground")}>
          {value != null && <span className="absolute -top-2 left-2 bg-card px-1 text-xs text-muted-foreground">{label}</span>}
          {icon}<span className="flex-1 truncate">{value ?? label}</span>
          {active ? <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onClear(); }} /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("max-h-80 overflow-auto p-2 text-xs", wide ? "w-72" : "w-56")}>{children}</PopoverContent>
    </Popover>
  );
}

function Multi<T extends string | number>({ icon, label, options, value, onChange }: { icon?: ReactNode; label: string; options: readonly (readonly [T, string])[]; value: T[] | undefined; onChange: (v: T[] | undefined) => void }) {
  const v = value ?? [];
  const summary = v.length === 0 ? undefined : v.length === 1 ? options.find((o) => o[0] === v[0])?.[1] : `${v.length} selected`;
  return (
    <Tile icon={icon} label={label} value={summary} active={v.length > 0} onClear={() => onChange(undefined)}>
      {options.length === 0 && <p className="p-2 text-muted-foreground">Nothing to filter yet</p>}
      {options.map(([k, l]) => (
        <label key={String(k)} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
          <Checkbox checked={v.includes(k)} onCheckedChange={() => { const n = v.includes(k) ? v.filter((x) => x !== k) : [...v, k]; onChange(n.length ? n : undefined); }} />{l}
        </label>
      ))}
    </Tile>
  );
}

function Single<T extends string | number>({ label, options, value, onChange, icon }: { icon?: ReactNode; label: string; options: readonly (readonly [T, string])[]; value: T | undefined; onChange: (v: T | undefined) => void }) {
  return (
    <Tile icon={icon} label={label} value={value == null ? (icon ? undefined : "All") : options.find((o) => o[0] === value)?.[1]} active={value != null} onClear={() => onChange(undefined)}>
      {[[undefined, "All"] as const, ...options].map(([k, l]) => (
        <button key={String(k)} className={cn("block w-full rounded px-2 py-1.5 text-left hover:bg-muted", value === k && "bg-muted font-semibold")} onClick={() => onChange(k as T | undefined)}>{l}</button>
      ))}
    </Tile>
  );
}

function RangeTile({ icon, label, unit, value, onChange }: { icon: ReactNode; label: string; unit: string; value: Range | undefined; onChange: (v: Range | undefined) => void }) {
  const v = value ?? {};
  const set = (k: "min" | "max", s: string) => { const n = { ...v, [k]: s === "" ? undefined : Number(s) }; onChange(n.min == null && n.max == null ? undefined : n); };
  const active = v.min != null || v.max != null;
  return (
    <Tile icon={icon} label={label} value={active ? `${v.min ?? "−∞"} to ${v.max ?? "∞"}${unit}` : undefined} active={active} onClear={() => onChange(undefined)}>
      <div className="grid grid-cols-2 gap-2 p-1">
        {(["min", "max"] as const).map((k) => (
          <label key={k} className="space-y-1"><span className="text-muted-foreground">{k === "min" ? "From" : "To"} ({unit || "x"})</span>
            <input type="number" step="any" className="h-8 w-full rounded border bg-background px-2" value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></label>
        ))}
      </div>
    </Tile>
  );
}

/** The expanded filter grid shown under the top bar. */
export function FilterPanel({ mode }: { mode: FilterMode }) {
  const { journal, filters: f, setFilters } = useJournal();
  const { data: lk } = useLookups(journal?.id);
  const { all } = useTrades({ unfiltered: true });
  const up = (p: Partial<Filters>) => setFilters({ ...f, ...p });
  const years = useMemo(() => [...new Set(all.map((t) => new Date(t.entry_at).getFullYear()))].sort().map((y) => [y, String(y)] as const), [all]);
  const types = useMemo(() => [...new Set(all.map((t) => t.trade_type).filter(Boolean))].map((t) => [t, t.charAt(0).toUpperCase() + t.slice(1)] as const), [all]);
  const L = (s: string) => <span className="w-3 text-center text-xs font-semibold">{s}</span>;
  if (mode === "closed") return null;
  const dateVal = f.from || f.to ? `${f.from ?? "…"} → ${f.to ?? "…"}` : undefined;
  return (
    <div className="bg-card px-[21px] py-[18px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
      <div className="grid max-w-[880px] grid-cols-5 gap-x-2 gap-y-[14px]">
        <Multi icon={<Globe className="h-3.5 w-3.5" />} label="Instrument" options={(lk?.instruments ?? []).map((i) => [i.symbol, i.symbol] as const)} value={f.instrument} onChange={(v) => up({ instrument: v })} />
        <Multi label="Outcome" options={[["win", "Winners"], ["loss", "Losers"], ["be", "Break Even"]] as const} value={f.outcome} onChange={(v) => up({ outcome: v })} />
        <Multi icon={L("M")} label="Month" options={MONTHS.map((m, i) => [i, m] as const)} value={f.month} onChange={(v) => up({ month: v })} />
        <Multi icon={L("H")} label="Hour" options={Array.from({ length: 24 }, (_, h) => [h, `${String(h).padStart(2, "0")}:00 – ${String(h).padStart(2, "0")}:59`] as const)} value={f.hour} onChange={(v) => up({ hour: v })} />
        <Multi icon={L("T")} label="Trade Type" options={types} value={f.tradeType} onChange={(v) => up({ tradeType: v })} />

        <Multi icon={<Settings className="h-3.5 w-3.5" />} label="Setup" options={(lk?.setups ?? []).map((s) => [s.name, s.name] as const)} value={f.setup} onChange={(v) => up({ setup: v })} />
        <Multi icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Rules" options={[["followed", "Followed"], ["partial", "Partial"], ["violated", "Violated"], ["unrated", "Not rated"]] as const} value={f.compliance} onChange={(v) => up({ compliance: v })} />
        <Single label="Direction" options={[["long", "Long"], ["short", "Short"]] as const} value={f.direction} onChange={(v) => up({ direction: v })} />
        <Multi icon={L("D")} label="Day" options={DAYS} value={f.weekday} onChange={(v) => up({ weekday: v })} />
        <RangeTile icon={<RotateCcw className="h-3.5 w-3.5" />} label="Return %" unit="%" value={f.returnPct} onChange={(v) => up({ returnPct: v })} />
        <Single icon={<Star className="h-3.5 w-3.5" />} label="Starred" options={[["yes", "Starred only"], ["no", "Not starred"]] as const} value={f.starred} onChange={(v) => up({ starred: v })} />

        <RangeTile icon={<Pencil className="h-3.5 w-3.5" />} label="RRR" unit="" value={f.rrr} onChange={(v) => up({ rrr: v })} />
        <Single label="Last Trades" options={[10, 20, 50, 100, 200].map((n) => [n, `Last ${n} trades`] as const)} value={f.lastTrades} onChange={(v) => up({ lastTrades: v })} />
        <Multi icon={L("Y")} label="Year" options={years} value={f.year} onChange={(v) => up({ year: v })} />
        <RangeTile icon={L("R")} label="R-Multiple Gain" unit="R" value={f.rMultiple} onChange={(v) => up({ rMultiple: v })} />
        <Tile icon={<Calendar className="h-3.5 w-3.5" />} label="Date Range" value={dateVal} active={!!dateVal} onClear={() => up({ from: undefined, to: undefined })} wide>
          <div className="grid grid-cols-2 gap-2 p-1">
            <label className="space-y-1"><span className="text-muted-foreground">From</span><input type="date" className="h-8 w-full rounded border bg-background px-2" value={f.from ?? ""} onChange={(e) => up({ from: e.target.value || undefined })} /></label>
            <label className="space-y-1"><span className="text-muted-foreground">To</span><input type="date" className="h-8 w-full rounded border bg-background px-2" value={f.to ?? ""} onChange={(e) => up({ to: e.target.value || undefined })} /></label>
          </div>
        </Tile>

        {(lk?.all.rules ?? []).length > 0 && <Multi icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Broke rule" options={(lk?.all.rules ?? []).map((r) => [r.id, r.name] as const)} value={f.violated} onChange={(v) => up({ violated: v })} />}
        {mode === "advanced" && (lk?.statCategories ?? []).map((c) => (
          <Multi key={c.id} label={c.name} options={(lk?.statOptions ?? []).filter((o) => o.category_id === c.id).map((o) => [o.id, o.label] as const)}
            value={f.stats?.[c.id]} onChange={(v) => up({ stats: { ...f.stats, [c.id]: v ?? [] } })} />
        ))}
      </div>
      {f.q && <button className="mr-2 mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs" onClick={() => up({ q: undefined })}>Search: {f.q}<X className="h-3 w-3" /></button>}
      {f.day && <button className="mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs" onClick={() => up({ day: undefined })}>Day: {f.day}<X className="h-3 w-3" /></button>}
    </div>
  );
}
