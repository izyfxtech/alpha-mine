import { syncLinks } from "@/lib/journal/sync-links";
import { storageJson, storageSet } from "@/lib/safe-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fmtPrice } from "@/lib/pnl/format-price";
import { fromInputValue, toInputValue } from "@/lib/time/local-time";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Settings, Star, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useJournal, useLookups } from "@/lib/journal/journal-context";
import { COMPLIANCE_LABEL, type RuleStatus } from "@/lib/pnl/compliance";
import { isOpen, type Trade } from "@/lib/pnl/metrics";
import { cn } from "@/lib/utils";
import { keepStoredGross, resolveGross } from "@/lib/pnl/trade-form";
import { grossPnl } from "@/lib/pnl/calc";
import { useScreenshots, saveShots, deleteShot, type Shot } from "@/components/journal/Screenshots";
import { FloatDateTime, FloatInput, FloatSelect, Segmented, SectionTitle, type Opt } from "@/components/journal/trade-form/fields";
import { useDialogs } from "@/components/ui/confirm";
import { assetClassFor, quantityLabel, specFor } from "@/lib/pnl/instrument-catalogue";
import { ScreenshotSlots, type PendingShot } from "@/components/journal/trade-form/ScreenshotSlots";

export type DrawerOpts = { prefill?: Partial<Trade>; onSaved?: () => void | Promise<void>; /** Trades in display order, enables Previous/Next inside the editor. */ list?: Trade[] };
const Ctx = createContext<{ open: (t?: Trade, opts?: DrawerOpts) => void } | null>(null);
export const useTradeDrawer = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("TradeDrawerProvider missing");
  return c;
};

type Leg = { price: string; qty: string };
const local = toInputValue;
const instant = fromInputValue;
const price = (v: number) => +v.toFixed(10);
const num = (v: string) => (v.trim() === "" ? null : Number(v));
const signedCost = (v: string) => { const n = Number(v) || 0; return n === 0 ? 0 : -n; };
const isNum = (v: string) => v.trim() !== "" && Number.isFinite(Number(v));

function toForm(t?: Partial<Trade>) {
  return {
    entry_at: local(t?.entry_at ?? new Date().toISOString()),
    exit_at: local(t?.exit_at),
    instrument_id: t?.instrument_id ?? "",
    setup_id: t?.setup_id ?? "",
    direction: (t?.direction ?? "") as "long" | "short" | "",
    entry_price: t?.entry_price?.toString() ?? "",
    quantity: t?.quantity?.toString() ?? "1.000",
    exit_price: t?.exit_price?.toString() ?? "",
    stop_loss: t?.stop_loss?.toString() ?? "",
    take_profit: t?.take_profit?.toString() ?? "",
    gross_pnl: t && t.exit_price != null ? String(t.gross_pnl) : "",
    // Costs are shown as positive numbers (a cost). commission and swap are stored broker-signed (negative = a cost).
    commission: t?.commission ? String(-Number(t.commission)) : "",
    swap: t?.swap ? String(-Number(t.swap)) : "",
    // A trade that only has a stored total (older rows, CSV import) shows that total as "other fees".
    other_fees: t?.other_fees ? String(t.other_fees) : t && t.fees && t.commission == null && t.swap == null ? String(t.fees) : "",
    high_price: t?.high_price?.toString() ?? "",
    low_price: t?.low_price?.toString() ?? "",
    otp_hit: (t?.otp_hit == null ? "" : t.otp_hit ? "yes" : "no") as "yes" | "no" | "",
    is_break_even: t?.is_break_even ?? false,
    notes: t?.notes ?? "",
  };
}
type Form = ReturnType<typeof toForm>;
type Tab = "regular" | "advanced" | "shots" | "alts" | "legs";

/** Weighted average of price legs; returns [avgPrice, totalQty]. */
function blend(legs: Leg[]): [number | null, number] {
  const valid = legs.filter((l) => isNum(l.price) && isNum(l.qty) && Number(l.qty) > 0);
  const q = valid.reduce((s, l) => s + Number(l.qty), 0);
  if (!q) return [null, 0];
  return [valid.reduce((s, l) => s + Number(l.price) * Number(l.qty), 0) / q, q];
}

export function TradeDrawerProvider({ children }: { children: ReactNode }) {
  const { journal } = useJournal();
  const { data: lk } = useLookups(journal?.id);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("regular");
  const [trade, setTrade] = useState<Trade | undefined>();
  const [f, setF] = useState<Form>(toForm());
  const [extraEntries, setExtraEntries] = useState<Leg[]>([]);
  const [extraExits, setExtraExits] = useState<Leg[]>([]);
  const [grossTouched, setGrossTouched] = useState(false);
  const [fav, setFav] = useState(false);
  const [comments, setComments] = useState<string[]>([]);
  const [stats, setStats] = useState<string[]>([]);
  const [ruleSt, setRuleSt] = useState<Record<string, RuleStatus>>({});
  const { confirm } = useDialogs();
  const [pending, setPending] = useState<PendingShot[]>([]);
  const [removed, setRemoved] = useState<Shot[]>([]);
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>(() => storageJson<string[]>("am.tradeform.hidden", []));
  const { data: shots = [] } = useScreenshots(journal?.id, trade?.id ?? "__none__");
  const { data: legs = [] } = useQuery({
    queryKey: ["trade_executions", trade?.id],
    enabled: !!trade?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("trade_executions").select("id,kind,side,quantity,price,executed_at,commission,swap,fee").eq("trade_id", trade!.id).order("executed_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const [alts, setAlts] = useState<Record<string, { p: string; r: string }>>({});
  const { data: altStrats = [] } = useQuery({
    queryKey: ["alt_strategies_for_trade", journal?.id, trade?.id],
    enabled: !!journal && open,
    queryFn: async () => {
      const [s, r] = await Promise.all([
        supabase.from("alt_strategies").select("id,name,setup_id").eq("journal_id", journal!.id),
        trade ? supabase.from("alt_strategy_results").select("strategy_id,alt_profit,alt_r").eq("trade_id", trade.id) : Promise.resolve({ data: [] as { strategy_id: string; alt_profit: number; alt_r: number }[] }),
      ]);
      const m: Record<string, { p: string; r: string }> = {};
      for (const x of r.data ?? []) m[x.strategy_id] = { p: String(x.alt_profit), r: String(x.alt_r) };
      setAlts(m);
      return s.data ?? [];
    },
  });
  const myAlts = altStrats.filter((a) => a.setup_id && a.setup_id === f.setup_id);
  const [onSaved, setOnSaved] = useState<DrawerOpts["onSaved"]>();
  /** The instrument's asset class decides how quantity is read (lots or units) and what one lot is worth. */
  const specOf = (instrumentId?: string | null) => specFor((lk?.all.instruments ?? []).find((i) => i.id === instrumentId)?.symbol, { markets: journal?.markets, journalUnit: journal?.quantity_unit });
  const [navList, setNavList] = useState<Trade[]>([]);
  const show = (t?: Trade, opts?: DrawerOpts) => {
    setNavList(opts?.list ?? []);
    setTrade(t); setF(toForm(t ?? opts?.prefill)); setTab("regular"); setOnSaved(() => opts?.onSaved);
    setExtraEntries([]); setExtraExits([]); setGrossTouched(!!t && keepStoredGross(t, grossPnl(t, t.spec, t.account) != null));
    setFav(t?.is_favorite ?? false);
    setComments(t?.comments.map((c) => c.id) ?? []);
    setStats(t?.customStats ?? []);
    setRuleSt(Object.fromEntries((t?.ruleChecks ?? []).map((c) => [c.rule_id, c.status])));
    setPending([]); setRemoved([]); setNewCat(null);
    setOpen(true);
  };
  // Previous / Next trade inside the editor (Alt+Left / Alt+Right), asking before discarding unsaved edits
  const navIdx = trade ? navList.findIndex((x) => x.id === trade.id) : -1;
  const canPrev = navIdx > 0, canNext = navIdx >= 0 && navIdx < navList.length - 1;
  const go = async (dir: -1 | 1) => {
    const target = navList[navIdx + dir];
    if (!target || !trade) return;
    const dirty = JSON.stringify(f) !== JSON.stringify(toForm(trade));
    if (dirty && !(await confirm({ title: "Discard changes?", message: "You have unsaved changes to this trade.", confirmLabel: "Discard", destructive: true }))) return;
    show(target, { list: navList, onSaved });
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      e.preventDefault();
      void go(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const rulesShown = (lk?.all.rules ?? []).filter((r) => !r.disabled || ruleSt[r.id]);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  // ---- P&L logic: scaled entries/exits are blended; gross auto-fills until edited ----
  const [avgEntry, totalQty] = blend([{ price: f.entry_price, qty: f.quantity }, ...extraEntries]);
  const extraExitQty = extraExits.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const [avgExitLegs] = blend([{ price: f.exit_price, qty: String(Math.max(totalQty - extraExitQty, 0)) }, ...extraExits]);
  // A trade with no exit date is open: no checkbox, nothing else to tick. Giving it an exit date closes it.
  const stillOpen = f.exit_at === "";
  const spec = specOf(f.instrument_id);
  const unit = spec.unit;
  const avgExit = stillOpen ? null : avgExitLegs;
  const sign = f.direction === "short" ? -1 : 1;
  // Price move x quantity x the instrument's contract size (lib/pnl/calc.ts). Null when that needs an exchange rate or a size we
  // do not have: the P&L is then typed, and kept as typed.
  const autoGross = f.direction ? grossPnl({ direction: f.direction, entry_price: avgEntry, exit_price: avgExit, quantity: totalQty }, spec, journal?.currency) : null;
  const resolved = resolveGross({ open: stillOpen, breakEven: f.is_break_even, touched: grossTouched, typed: f.gross_pnl, auto: autoGross, wasManual: !!trade?.pnl_manual });
  const grossVal = resolved.gross;
  const cost = (Number(f.commission) || 0) + (Number(f.swap) || 0) + (Number(f.other_fees) || 0);
  const net = grossVal == null ? null : +(grossVal - cost).toFixed(2);

  const opts = useMemo(() => ({
    instruments: [...(lk?.instruments ?? []).map((i) => ({ id: i.id, label: i.symbol })), ...(lk?.all.instruments ?? []).filter((i) => i.disabled && i.id === trade?.instrument_id).map((i) => ({ id: i.id, label: `${i.symbol} (disabled)` }))] as Opt[],
    setups: [...(lk?.setups ?? []).map((s) => ({ id: s.id, label: s.name })), ...(lk?.all.setups ?? []).filter((s) => s.disabled && s.id === trade?.setup_id).map((s) => ({ id: s.id, label: `${s.name} (disabled)` }))] as Opt[],
    comments: (phase: string) => (lk?.comments ?? []).filter((c) => c.phase === phase).map((c) => ({ id: c.id, label: c.label })) as Opt[],
    stat: (cat: string) => (lk?.statOptions ?? []).filter((o) => o.category_id === cat).map((o) => ({ id: o.id, label: o.label })) as Opt[],
  }), [lk]);

  const refreshLookups = () => qc.invalidateQueries({ queryKey: ["lookups", journal?.id] });
  async function create(table: "instruments" | "setups", label: string) {
    if (!journal) return null;
    const text = label.trim();
    if (!text) return null;
    const column = table === "instruments" ? "symbol" : "name";
    const value = table === "instruments" ? text.toUpperCase() : text;
    // The name may already exist (typed in another case, or retired and hidden from the picker): use that one instead of
    // failing on the unique (journal, name) rule.
    const existing = (table === "instruments" ? lk?.all.instruments : lk?.all.setups ?? [])?.find((x) => String((x as Record<string, unknown>)[column]).toLowerCase() === value.toLowerCase());
    const reuse = async (id: string, disabled?: boolean) => {
      if (disabled) {
        const { error } = await supabase.from(table).update({ disabled: false } as never).eq("id", id);
        if (error) { toast.error(`Could not bring back "${value}": ${error.message}`); return null; }
      }
      await refreshLookups();
      return id;
    };
    if (existing) return reuse(existing.id, (existing as { disabled?: boolean }).disabled);
    const row = table === "instruments" ? { symbol: value, asset_class: assetClassFor(value, journal.markets), journal_id: journal.id } : { name: value, journal_id: journal.id };
    const { data, error } = await supabase.from(table).insert(row as never).select("id").single();
    if (error) {
      if (error.code === "23505") {
        // Created a moment ago in another tab or by a retry: find it and use it.
        const { data: found } = await supabase.from(table).select("id,disabled").eq("journal_id", journal.id).ilike(column, value.replace(/[\\%_]/g, "\\$&")).limit(1).maybeSingle();
        if (found) return reuse(found.id, (found as { disabled?: boolean }).disabled);
      }
      toast.error(`Could not add "${value}": ${error.message}`);
      return null;
    }
    await refreshLookups();
    return (data as { id: string }).id;
  }
  async function createComment(phase: string, label: string) {
    if (!journal) return null;
    const { data, error } = await supabase.from("comment_definitions").insert({ phase, label, sentiment: "neutral", journal_id: journal.id }).select("id").single();
    if (error) { toast.error(error.message); return null; }
    await refreshLookups();
    return data.id;
  }
  async function createStatOption(category_id: string, label: string) {
    if (!journal) return null;
    const { data, error } = await supabase.from("custom_stat_options").insert({ category_id, label, journal_id: journal.id }).select("id").single();
    if (error) { toast.error(error.message); return null; }
    await refreshLookups();
    return data.id;
  }
  async function addCategory() {
    const name = newCat?.trim();
    if (!journal || !name) { setNewCat(null); return; }
    const { error } = await supabase.from("custom_stat_categories").insert({ name, position: lk?.statCategories.length ?? 0, journal_id: journal.id });
    if (error) toast.error(error.message);
    setNewCat(null); refreshLookups();
  }

  function validate(): string | null {
    if (!f.entry_at) return "Entry date is required.";
    if (!f.instrument_id) return "Instrument is required.";
    if (!f.direction) return "Direction is required.";
    if (!isNum(f.entry_price)) return "Entry price is required.";
    if (!isNum(f.quantity) || Number(f.quantity) <= 0) return "Quantity must be greater than 0.";
    if (stillOpen) {
      if (isNum(f.exit_price)) return "Add the exit date too, or clear the exit price: a trade without an exit date is saved as open.";
    } else {
      if (new Date(f.exit_at) < new Date(f.entry_at)) return "Exit date can't be before entry date.";
      if (!isNum(f.exit_price)) return "Exit price is required once the trade has an exit date.";
      if (extraExitQty > totalQty) return "Partial exits exceed the position size.";
    }
    if (grossVal == null) return "Gross P/L is required.";
    return null;
  }

  async function save() {
    if (!journal) return;
    const err = validate();
    if (err) { toast.error(err); if (tab !== "regular") setTab("regular"); return; }
    setSaving(true);
    try {
      // Imported trades: the broker owns times, prices, size and money, so only the trader's own columns are sent.
      const owned = {
        setup_id: f.setup_id || null,
        stop_loss: num(f.stop_loss),
        take_profit: num(f.take_profit),
        high_price: num(f.high_price),
        low_price: num(f.low_price),
        otp_hit: f.otp_hit === "" ? null : f.otp_hit === "yes",
        is_break_even: f.is_break_even,
        is_favorite: fav,
        notes: f.notes || null,
      };
      // A typed P&L (anything but the auto-calculated figure) is the trader's, so the trigger must not recompute it.
      const full = {
        ...owned,
        journal_id: journal.id,
        instrument_id: f.instrument_id,
        direction: f.direction,
        entry_at: instant(f.entry_at, trade?.entry_at),
        exit_at: stillOpen ? null : instant(f.exit_at, trade?.exit_at),
        entry_price: price(avgEntry!),
        exit_price: stillOpen ? null : price(avgExit!),
        quantity: totalQty,
        gross_pnl: grossVal!,
        // commission and swap are broker-signed (negative = a cost); the database adds the three parts up into fees.
        commission: signedCost(f.commission),
        swap: signedCost(f.swap),
        other_fees: Number(f.other_fees) || 0,
        fees: cost,
        pnl_manual: resolved.manual,
        // risk_amount is deliberately not sent: the database derives it, and imported trades keep the engine's value.
        ...(trade ? {} : { trade_type: journal.trade_type }),
      };
      const row = imported ? owned : full;
      const res = trade
        ? await supabase.from("trades").update(row).eq("id", trade.id).select("id").single()
        : await supabase.from("trades").insert(full).select("id").single();
      if (res.error) throw res.error;
      const id = res.data.id;
      // Add what is missing first, then remove what is no longer wanted, so a failure part-way never wipes a trade's tags and ratings.
      const [e1, e2] = await Promise.all([
        syncLinks("trade_comments", "trade_id", id, journal.id, comments, "comment_definition_id"),
        syncLinks("trade_custom_stats", "trade_id", id, journal.id, stats),
      ]);
      if (e1 || e2) throw new Error((e1 ?? e2)!);
      const checks = Object.entries(ruleSt).map(([rule_id, status]) => ({ trade_id: id, rule_id, status, journal_id: journal.id }));
      if (checks.length) {
        const { error } = await supabase.from("trade_rule_checks").upsert(checks, { onConflict: "trade_id,rule_id" });
        if (error) throw error;
      }
      {
        const del = supabase.from("trade_rule_checks").delete().eq("trade_id", id);
        const { error } = checks.length ? await del.not("rule_id", "in", `(${checks.map((c) => c.rule_id).join(",")})`) : await del;
        if (error) throw error;
      }
      const altRows = myAlts.filter((a) => alts[a.id]).map((a) => ({ strategy_id: a.id, trade_id: id, journal_id: journal.id, alt_profit: Number(alts[a.id]!.p) || 0, alt_r: Number(alts[a.id]!.r) || 0 }));
      if (altRows.length) {
        const { error } = await supabase.from("alt_strategy_results").upsert(altRows, { onConflict: "strategy_id,trade_id" });
        if (error) throw error;
      }
      for (const s of removed) await deleteShot(s);
      await saveShots(journal.id, id, pending);
      toast.success(trade ? "Trade updated" : "Trade added");
      // Planned risk (and so the R-multiple) for forex, metals and other lot-based trades comes from the P&L engine, which
      // knows contract sizes, pip values and currency conversion. Ask it for this one trade now; the page refreshes when it
      // answers. Never blocks or fails the save.
      if (onSaved) await onSaved();
      qc.invalidateQueries();
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const toggleHidden = (k: string) => setHidden((h) => {
    const n = h.includes(k) ? h.filter((x) => x !== k) : [...h, k];
    storageSet("am.tradeform.hidden", JSON.stringify(n));
    return n;
  });
  const vis = (k: string) => !hidden.includes(k);
  const plusBtn = (onClick: () => void, label: string) => (
    <button type="button" onClick={onClick} aria-label={label} className="hover:text-info"><Plus className="h-4 w-4" strokeWidth={2.25} /></button>
  );
  const legRow = (legs: Leg[], setLegs: (l: Leg[]) => void, i: number, kind: string) => (
    <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
      <FloatInput label={`${kind} Price ${i + 2}`} value={legs[i]!.price} onChange={(v) => setLegs(legs.map((l, j) => (j === i ? { ...l, price: v } : l)))} />
      <FloatInput label="Quantity" value={legs[i]!.qty} onChange={(v) => setLegs(legs.map((l, j) => (j === i ? { ...l, qty: v } : l)))} />
      <button type="button" aria-label="Remove" onClick={() => setLegs(legs.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
  const imported = !!trade && !!trade.source && trade.source !== "manual";
  const visibleShots = shots.filter((s) => !removed.some((r) => r.id === s.id));

  return (
    <Ctx.Provider value={{ open: show }}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent hideClose className="inset-y-3.5 right-3.5 flex h-auto w-[480px] flex-col gap-0 rounded-[10px] border-0 p-0 sm:max-w-[480px]">
          <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
            <button onClick={() => setFav(!fav)} aria-label="Favorite"><Star className={cn("h-[17px] w-[17px]", fav && "fill-star text-star")} /></button>
            <SheetTitle className="text-[15px] font-semibold">{trade ? `Edit Trade #${trade.trade_no}` : "New Trade"}</SheetTitle>
            {navList.length > 1 && trade && (
              <span className="flex items-center gap-0.5">
                <button type="button" aria-label="Previous trade" title="Previous trade (Alt+←)" disabled={!canPrev} onClick={() => void go(-1)} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" aria-label="Next trade" title="Next trade (Alt+→)" disabled={!canNext} onClick={() => void go(1)} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
              </span>
            )}
            <Popover>
              <PopoverTrigger aria-label="Form settings"><Settings className="h-[17px] w-[17px]" /></PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-3 text-[12.5px]">
                <p className="mb-2 font-semibold">Show fields</p>
                {[["setup", "Setup"], ["sltp", "Stop Loss / Take Profit"], ["fees", "Commission / Swap / Fees"], ["notes", "Personal Notes"], ["price", "Advanced Price Data"], ["custom", "Custom Stats"]].map(([k, l]) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2 py-1">
                    <input type="checkbox" checked={vis(k!)} onChange={() => toggleHidden(k!)} className="accent-current" /> {l}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
            <button onClick={() => setOpen(false)} aria-label="Close" className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
          <div className="px-5">
            <div className="tf-tabs">
              {([["regular", "Regular Data"], ["advanced", "Advanced Data"], ["shots", "Screenshots"], ...(legs.length ? [["legs", `Executions (${legs.length})`]] : []), ...(myAlts.length ? [["alts", "Alternative Strategies"]] : [])] as [Tab, string][]).map(([k, l]) => (
                <button key={k} type="button" className="tf-tab" data-active={tab === k} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-6 pt-7">
            {tab === "regular" && (
              <div>
                <SectionTitle>General Trade Data</SectionTitle>
                <div className="space-y-3">
                  <FloatDateTime label="Entry Date *" value={f.entry_at} onChange={set("entry_at")} />
                  <FloatSelect label="Instrument *" options={opts.instruments} value={f.instrument_id ? [f.instrument_id] : []} onChange={(v) => set("instrument_id")(v[0] ?? "")} onCreate={(l) => create("instruments", l)} />
                  {vis("setup") && <FloatSelect label="Setup" options={opts.setups} value={f.setup_id ? [f.setup_id] : []} onChange={(v) => set("setup_id")(v[0] ?? "")} onCreate={(l) => create("setups", l)} />}
                </div>
                <p className="mb-1.5 mt-3.5 text-[13px]">Direction *</p>
                <Segmented options={[["long", "Long"], ["short", "Short"]]} value={f.direction} onChange={set("direction")} />

                <div className="mt-6 grid grid-cols-2 gap-x-3">
                  <div className="space-y-3">
                    <SectionTitle>Trade Entry</SectionTitle>
                    <FloatInput label="Entry Price *" value={f.entry_price} onChange={set("entry_price")} right={plusBtn(() => setExtraEntries([...extraEntries, { price: "", qty: "" }]), "Add entry")} />
                    {extraEntries.map((_, i) => legRow(extraEntries, setExtraEntries, i, "Entry"))}
                    <FloatInput label={`${quantityLabel(unit)} *`} value={f.quantity} onChange={set("quantity")} />
                    {vis("sltp") && <FloatInput label="Stop Loss" value={f.stop_loss} onChange={set("stop_loss")} />}
                    {vis("sltp") && <FloatInput label="Take Profit" value={f.take_profit} onChange={set("take_profit")} />}
                  </div>
                  <div className="space-y-3">
                    <SectionTitle>Trade Exit</SectionTitle>
                    <FloatDateTime label="Exit Date" value={f.exit_at} onChange={set("exit_at")} />
                    {stillOpen && <p className="-mt-1 text-[11.5px] text-muted-foreground">No exit date: this trade is saved as open.</p>}
                    <FloatInput label={stillOpen ? "Exit Price" : "Exit Price *"} value={f.exit_price} onChange={set("exit_price")} right={plusBtn(() => setExtraExits([...extraExits, { price: "", qty: "" }]), "Add exit")} />
                    {extraExits.map((_, i) => legRow(extraExits, setExtraExits, i, "Exit"))}
                    <div className="grid grid-cols-2 gap-3">
                      <FloatInput label="Net P/L" value={net == null ? "" : net.toFixed(2)} disabled />
                      <FloatInput label="Gross P/L *" value={grossTouched ? f.gross_pnl : autoGross?.toFixed(2) ?? ""} onChange={(v) => { setGrossTouched(v !== ""); set("gross_pnl")(v); }} />
                    </div>
                    {unit !== "units" && <p className="text-[11.5px] text-muted-foreground">{unit === "lots" ? "Forex is traded in lots, so enter the P/L yourself." : "Pick an instrument to calculate P/L automatically. Until then, enter the P/L yourself."}</p>}
                    {vis("fees") && (
                      <div className="space-y-3">
                        <FloatInput label="Commission" value={f.commission} onChange={set("commission")} disabled={imported} />
                        <FloatInput label="Swap" value={f.swap} onChange={set("swap")} disabled={imported} />
                        <FloatInput label="Other fees" value={f.other_fees} onChange={set("other_fees")} disabled={imported} />
                      </div>
                    )}
                  </div>
                </div>
                {(extraEntries.length > 0 || extraExits.length > 0) && avgEntry != null && (
                  <p className="mt-2 text-[11.5px] text-muted-foreground tabular">
                    Avg entry {fmtPrice(avgEntry)} · size {totalQty}{avgExit != null && ` · avg exit ${fmtPrice(avgExit)}`}
                  </p>
                )}
                {vis("notes") && (
                  <>
                    <div className="mt-6"><SectionTitle>Personal Notes</SectionTitle></div>
                    <textarea value={f.notes} onChange={(e) => set("notes")(e.target.value)} rows={7}
                      className="w-full resize-y rounded-[4px] border border-input bg-card p-3 text-[13px] outline-none focus:border-foreground" />
                  </>
                )}
              </div>
            )}

            {tab === "advanced" && (
              <div>
                {rulesShown.length > 0 && (
                  <div className="mb-6">
                    <SectionTitle>Rules</SectionTitle>
                    <div className="divide-y rounded-[4px] border">
                      {rulesShown.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                          <div className="min-w-0 flex-1"><div className="truncate">{r.name}{r.disabled && <span className="ml-2 text-xs text-muted-foreground">(disabled)</span>}</div>{r.description && <div className="truncate text-xs text-muted-foreground">{r.description}</div>}</div>
                          <div className="flex shrink-0 gap-1" role="group" aria-label={`${r.name} status`}>
                            {(["followed", "partial", "violated"] as const).map((st) => (
                              <button key={st} type="button" aria-pressed={ruleSt[r.id] === st}
                                onClick={() => setRuleSt((p) => { const n = { ...p }; if (n[r.id] === st) delete n[r.id]; else n[r.id] = st; return n; })}
                                className={cn("rounded border px-2 py-1 text-xs", ruleSt[r.id] === st ? (st === "followed" ? "border-emerald-600 bg-emerald-600/15 text-emerald-700" : st === "partial" ? "border-amber-600 bg-amber-600/15 text-amber-700" : "border-red-600 bg-red-600/15 text-red-700") : "text-muted-foreground hover:bg-muted")}>{COMPLIANCE_LABEL[st]}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <SectionTitle>Trade Comments</SectionTitle>
                <div className="space-y-3">
                  {([["entry", "Entry Comments"], ["management", "Trade Management"], ["exit", "Exit Comments"]] as const).map(([phase, label]) => {
                    const o = opts.comments(phase);
                    return (
                      <FloatSelect key={phase} label={label} multi options={o}
                        value={comments.filter((c) => o.some((x) => x.id === c))}
                        onChange={(v) => setComments([...comments.filter((c) => !o.some((x) => x.id === c)), ...v])}
                        onCreate={(l) => createComment(phase, l)} />
                    );
                  })}
                </div>
                {vis("price") && (
                  <>
                    <div className="mt-6"><SectionTitle>Advanced Price Data</SectionTitle></div>
                    <div className="grid grid-cols-2 gap-3">
                      <FloatInput label="Highest Price" value={f.high_price} onChange={set("high_price")} />
                      <FloatInput label="Lowest Price" value={f.low_price} onChange={set("low_price")} />
                    </div>
                  </>
                )}
                <div className="mt-5 grid grid-cols-2 items-end gap-3">
                  <div>
                    <p className="mb-2.5 text-[13px] font-semibold">OTP Hit?</p>
                    <Segmented options={[["yes", "Yes"], ["no", "No"]]} value={f.otp_hit} onChange={set("otp_hit")} />
                  </div>
                  <label className="mb-[34px] flex cursor-pointer items-center gap-4 self-start pt-1 text-[13px] font-semibold">
                    Break Even
                    <input type="checkbox" checked={f.is_break_even} onChange={(e) => set("is_break_even")(e.target.checked)} className="h-4 w-4 accent-current" />
                  </label>
                </div>
                {vis("custom") && (
                  <>
                    <div className="mt-6"><SectionTitle>Custom Stats</SectionTitle></div>
                    <div className="grid grid-cols-2 gap-3">
                      {(lk?.statCategories ?? []).map((c) => {
                        const o = opts.stat(c.id);
                        return (
                          <FloatSelect key={c.id} label={c.name} multi options={o}
                            value={stats.filter((s) => o.some((x) => x.id === s))}
                            onChange={(v) => setStats([...stats.filter((s) => !o.some((x) => x.id === s)), ...v])}
                            onCreate={(l) => createStatOption(c.id, l)} />
                        );
                      })}
                      {newCat !== null && (
                        <input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Category name"
                          onBlur={addCategory} onKeyDown={(e) => { if (e.key === "Enter") addCategory(); if (e.key === "Escape") setNewCat(null); }}
                          className="h-[34px] rounded-[4px] border border-foreground bg-card px-3 text-[13px] outline-none" />
                      )}
                    </div>
                    <button type="button" onClick={() => setNewCat("")} className="mt-4 text-[13px] font-medium text-info">+ Add New</button>
                  </>
                )}
              </div>
            )}

            {tab === "legs" && (
              <div className="pt-2 text-[13px]">
                <div className="grid grid-cols-[70px_1fr_1fr_1.4fr_1fr] gap-3 pb-2 text-xs uppercase tracking-wide text-muted-foreground"><span>Leg</span><span className="text-right">Size</span><span className="text-right">Price</span><span>Time</span><span className="text-right">Costs</span></div>
                {legs.map((l) => (
                  <div key={l.id} className="grid grid-cols-[70px_1fr_1fr_1.4fr_1fr] items-center gap-3 border-t py-2">
                    <span className={l.kind === "entry" ? "" : "text-muted-foreground"}>{l.kind === "entry" ? "Entry" : "Exit"} · {l.side}</span>
                    <span className="text-right tabular-nums">{Number(l.quantity)}</span>
                    <span className="text-right tabular-nums">{Number(l.price)}</span>
                    <span>{new Date(l.executed_at).toLocaleString()}</span>
                    <span className="text-right tabular-nums">{(Number(l.commission) + Number(l.swap) + Number(l.fee)).toFixed(2)}</span>
                  </div>
                ))}
                <p className="pt-3 text-xs text-muted-foreground">The trade row shows the size-weighted entry and exit price of these legs.</p>
              </div>
            )}
            {tab === "alts" && (
              <div className="pt-2">
                
                <div className="space-y-2">
                  {myAlts.map((a) => (
                    <div key={a.id} className="grid grid-cols-[1fr_120px_120px] items-center gap-3 text-[13px]">
                      <span>{a.name}</span>
                      {(["p", "r"] as const).map((k) => (
                        <input key={k} type="number" step="any" aria-label={`${a.name} alternative ${k === "p" ? "profit" : "R-multiple"}`}
                          placeholder={k === "p" ? "alt. Profit" : "alt. R-Multiple"} value={alts[a.id]?.[k] ?? ""}
                          onChange={(e) => setAlts((m) => ({ ...m, [a.id]: { p: m[a.id]?.p ?? "", r: m[a.id]?.r ?? "", [k]: e.target.value } }))}
                          className="h-[34px] rounded-[4px] border bg-card px-3 text-right outline-none focus:border-foreground" />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab === "shots" && (
              <ScreenshotSlots existing={trade ? visibleShots : []} pending={pending}
                onAdd={(p) => setPending((x) => [...x, ...p])}
                onRemovePending={(k) => setPending((x) => x.filter((p) => p.key !== k))}
                onRemoveExisting={(s) => setRemoved((r) => [...r, s])} />
            )}
          </div>

          <div className="flex gap-3 border-t px-5 py-3.5">
            <Button size="sm" variant="ink" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}
