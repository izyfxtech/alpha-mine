import { useMemo, type ReactNode } from "react";
import { Calendar, ChevronDown, ChevronRight, Globe, Pencil, RotateCcw, Settings, Star, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { activeFilterCount, useJournal, useLookups, useTrades, type Filters, type Range } from "@/lib/journal-context";
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
      <div className="inline-flex overflow-hidden rounded-md border text-[11px]">
        <button className={cn("flex items-center gap-1.5 px-3 py-1.5", mode !== "closed" && "bg-muted")} onClick={() => setMode(mode === "closed" ? "basic" : "closed")}>
          {mode === "closed" ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}Basic Filters
          {n > 0 && <span className="rounded-full bg-ink px-1.5 text-[10px] text-ink-foreground">{n}</span>}
        </button>
        <button className={cn("flex items-center gap-1.5 border-l px-3 py-1.5", mode === "advanced" && "bg-muted")} onClick={() => setMode(mode === "advanced" ? "basic" : "advanced")}>
          {mode === "advanced" ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}Advanced Filters
        </button>
      </div>
      {n > 0 && <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setFilters({})}><RotateCcw className="h-3 w-3" />Clear all</Button>}
    </div>
  );
}

function Tile({ icon, label, value, active, onClear, children, wide }: { icon?: ReactNode; label: string; value?: string | undefined; active: boolean; onClear: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn("relative flex h-8 w-full items-center gap-1.5 rounded-md border bg-card px-2.5 text-left text-[12px]", active && "border-foreground")}>
          {value != null && <span className="absolute -top-2 left-2 bg-card px-1 text-[9px] text-muted-foreground">{label}</span>}
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
  const L = (s: string) => <span className="w-3 text-center text-[11px] font-semibold">{s}</span>;
  if (mode === "closed") return null;
  const dateVal = f.from || f.to ? `${f.from ?? "…"} → ${f.to ?? "…"}` : undefined;
  return (
    <div className="border-b bg-background px-6 py-3">
      <div className="grid max-w-[880px] grid-cols-5 gap-x-2 gap-y-3">
        <Multi icon={<Globe className="h-3.5 w-3.5" />} label="Instrument" options={(lk?.instruments ?? []).map((i) => [i.symbol, i.symbol] as const)} value={f.instrument} onChange={(v) => up({ instrument: v })} />
        <Multi label="Outcome" options={[["win", "Winners"], ["loss", "Losers"], ["be", "Break Even"]] as const} value={f.outcome} onChange={(v) => up({ outcome: v })} />
        <Multi icon={L("M")} label="Month" options={MONTHS.map((m, i) => [i, m] as const)} value={f.month} onChange={(v) => up({ month: v })} />
        <Multi icon={L("H")} label="Hour" options={Array.from({ length: 24 }, (_, h) => [h, `${String(h).padStart(2, "0")}:00 – ${String(h).padStart(2, "0")}:59`] as const)} value={f.hour} onChange={(v) => up({ hour: v })} />
        <Multi icon={L("T")} label="Trade Type" options={types} value={f.tradeType} onChange={(v) => up({ tradeType: v })} />

        <Multi icon={<Settings className="h-3.5 w-3.5" />} label="Setup" options={(lk?.setups ?? []).map((s) => [s.name, s.name] as const)} value={f.setup} onChange={(v) => up({ setup: v })} />
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

        {mode === "advanced" && (lk?.statCategories ?? []).map((c) => (
          <Multi key={c.id} label={c.name} options={(lk?.statOptions ?? []).filter((o) => o.category_id === c.id).map((o) => [o.id, o.label] as const)}
            value={f.stats?.[c.id]} onChange={(v) => up({ stats: { ...f.stats, [c.id]: v ?? [] } })} />
        ))}
      </div>
      {f.day && <button className="mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]" onClick={() => up({ day: undefined })}>Day: {f.day}<X className="h-3 w-3" /></button>}
    </div>
  );
}
