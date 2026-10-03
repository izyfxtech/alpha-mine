import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { annotateAccount, enrichTrade, isWin, isLoss, isBE, type Cashflow, type Trade, type TradeRow, type Sentiment } from "./metrics";

export interface Journal {
  id: string;
  name: string;
  broker: string | null;
  currency: string;
  starting_balance: number;
  markets: string[];
  deposit_date: string | null;
  trade_type: string;
  auto_pnl: boolean;
  session_categories: string[];
  last_used_at: string;
  share_token: string | null;
}
export type Range = { min?: number | undefined; max?: number | undefined };
export interface Filters {
  from?: string | undefined;
  to?: string | undefined;
  instrument?: string[] | undefined;
  setup?: string[] | undefined;
  outcome?: ("win" | "loss" | "be")[] | undefined;
  month?: number[] | undefined;
  weekday?: number[] | undefined;
  hour?: number[] | undefined;
  year?: number[] | undefined;
  tradeType?: string[] | undefined;
  direction?: "long" | "short" | undefined;
  starred?: "yes" | "no" | undefined;
  lastTrades?: number | undefined;
  returnPct?: Range | undefined;
  rMultiple?: Range | undefined;
  rrr?: Range | undefined;
  stats?: Record<string, string[]> | undefined; // category id -> option ids
  day?: string | undefined;
}

/** Count of active filter tiles. */
export function activeFilterCount(f: Filters) {
  const { stats, ...rest } = f;
  return Object.values(stats ?? {}).filter((v) => v.length).length + Object.values(rest).filter((v) => (Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? v.min != null || v.max != null : v != null && v !== "")).length;
}

/** Planned reward:risk from TP/SL. */
export function plannedRRR(t: Trade) {
  if (t.stop_loss == null || t.take_profit == null) return null;
  const risk = Math.abs(t.entry_price - Number(t.stop_loss));
  return risk ? Math.abs(Number(t.take_profit) - t.entry_price) / risk : null;
}

const DEFAULT_COMMENTS: { phase: string; label: string; sentiment: Sentiment }[] = [
  { phase: "entry", label: "Perfect entry", sentiment: "positive" },
  { phase: "entry", label: "Entered too early", sentiment: "negative" },
  { phase: "entry", label: "Entered too late", sentiment: "negative" },
  { phase: "entry", label: "Revenge trade", sentiment: "negative" },
  { phase: "entry", label: "Impulsive entry", sentiment: "negative" },
  { phase: "entry", label: "Neutral", sentiment: "neutral" },
  { phase: "management", label: "Followed plan", sentiment: "positive" },
  { phase: "management", label: "Moved stop too early", sentiment: "negative" },
  { phase: "management", label: "Neutral", sentiment: "neutral" },
  { phase: "exit", label: "Followed all exit rules", sentiment: "positive" },
  { phase: "exit", label: "Exited early out of fear", sentiment: "negative" },
  { phase: "exit", label: "Held loser too long", sentiment: "negative" },
  { phase: "exit", label: "Neutral", sentiment: "neutral" },
];

const DEFAULT_STATS: [string, string[]][] = [
  ["Timeframe", ["1M", "5M", "15M", "1H", "4H", "1D"]],
  ["Confluence", ["Support/Resistance", "Trendline", "Fibonacci"]],
  ["Pattern", ["Double top", "Double bottom", "Flag", "Wedge"]],
  ["Preparation", ["Well prepared", "Not prepared"]],
  ["Mental", ["Calm", "Anxious", "Tired", "Overconfident"]],
  ["Indicator", ["RSI", "MACD", "Moving average"]],
  ["Market General", ["Trending", "Ranging", "News day"]],
  ["Missed Trades", ["Process", "Sleep", "Couldnt trade"]],
];

export async function createJournal(name: string, startingBalance = 10000, currency = "USD", extra: { markets?: string[]; deposit_date?: string | null; trade_type?: string; broker?: string | null } = {}) {
  const { data, error } = await supabase
    .from("journals")
    .insert({ name, starting_balance: startingBalance, currency, ...extra })
    .select()
    .single();
  if (error) throw error;
  await supabase.from("comment_definitions").insert(DEFAULT_COMMENTS.map((c, position) => ({ ...c, position, journal_id: data.id })));
  const { data: cats } = await supabase.from("custom_stat_categories").insert(DEFAULT_STATS.map(([name], position) => ({ name, position, journal_id: data.id }))).select("id,name");
  const opts = (cats ?? []).flatMap((c) => (DEFAULT_STATS.find(([n]) => n === c.name)?.[1] ?? []).map((label) => ({ label, category_id: c.id, journal_id: data.id })));
  if (opts.length) await supabase.from("custom_stat_options").insert(opts);
  await supabase.from("setups").insert(["Pullback", "Breakout", "Retest", "Pinbar"].map((name, position) => ({ name, position, journal_id: data.id })));
  return data;
}

interface Ctx {
  journals: Journal[];
  journal: Journal | null;
  setJournalId: (id: string) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  refresh: () => void;
}
const JournalCtx = createContext<Ctx | null>(null);

export function JournalProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({});

  useEffect(() => setActiveId(localStorage.getItem("am.journal")), []);

  const { data: journals = [] } = useQuery({
    queryKey: ["journals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("journals").select("*").order("created_at");
      if (error) throw error;
      if (!data.length) return [await createJournal("Trading Journal")] as Journal[];
      return data as Journal[];
    },
  });

  const journal = useMemo(
    () => journals.find((j) => j.id === activeId) ?? journals[0] ?? null,
    [journals, activeId],
  );

  const value: Ctx = {
    journals,
    journal: journal ? { ...journal, starting_balance: Number(journal.starting_balance) } : null,
    setJournalId: (id) => {
      localStorage.setItem("am.journal", id);
      void supabase.from("journals").update({ last_used_at: new Date().toISOString() }).eq("id", id);
      setActiveId(id);
      setFilters({});
    },
    filters,
    setFilters,
    refresh: () => qc.invalidateQueries(),
  };
  return <JournalCtx.Provider value={value}>{children}</JournalCtx.Provider>;
}

export function useJournal() {
  const c = useContext(JournalCtx);
  if (!c) throw new Error("useJournal outside provider");
  return c;
}

export function useLookups(journalId?: string) {
  return useQuery({
    queryKey: ["lookups", journalId],
    enabled: !!journalId,
    queryFn: async () => {
      const [i, s, c, p, sc, so] = await Promise.all([
        supabase.from("instruments").select("*").eq("journal_id", journalId!).order("position").order("symbol"),
        supabase.from("setups").select("*").eq("journal_id", journalId!).order("position").order("name"),
        supabase.from("comment_definitions").select("*").eq("journal_id", journalId!).order("position").order("created_at"),
        supabase.from("trading_plans").select("*").eq("journal_id", journalId!).order("created_at"),
        supabase.from("custom_stat_categories").select("*").eq("journal_id", journalId!).order("position"),
        supabase.from("custom_stat_options").select("*").eq("journal_id", journalId!).order("position").order("created_at"),
      ]);
      return {
        instruments: i.data ?? [],
        setups: s.data ?? [],
        comments: (c.data ?? []) as { id: string; phase: string; label: string; sentiment: Sentiment; journal_id: string }[],
        plans: p.data ?? [],
        statCategories: sc.data ?? [],
        statOptions: so.data ?? [],
      };
    },
  });
}

export async function fetchTrades(journalIds: string[]): Promise<Trade[]> {
  if (!journalIds.length) return [];
  const [t, i, s, tc, cd, cs, jr, cf] = await Promise.all([
    supabase.from("trades").select("*").in("journal_id", journalIds).order("entry_at", { ascending: false }).limit(5000),
    supabase.from("instruments").select("id,symbol").in("journal_id", journalIds),
    supabase.from("setups").select("id,name").in("journal_id", journalIds),
    supabase.from("trade_comments").select("*").in("journal_id", journalIds),
    supabase.from("comment_definitions").select("*").in("journal_id", journalIds),
    supabase.from("trade_custom_stats").select("trade_id,option_id").in("journal_id", journalIds),
    supabase.from("journals").select("id,starting_balance").in("id", journalIds),
    supabase.from("journal_cashflows").select("journal_id,occurred_on,amount").in("journal_id", journalIds),
  ]);
  if (t.error) throw t.error;
  const im = new Map((i.data ?? []).map((x) => [x.id, x.symbol]));
  const sm = new Map((s.data ?? []).map((x) => [x.id, x.name]));
  const cm = new Map((cd.data ?? []).map((x) => [x.id, x]));
  const byTrade = new Map<string, Trade["comments"]>();
  (tc.data ?? []).forEach((r) => {
    const d = cm.get(r.comment_definition_id);
    if (!d) return;
    byTrade.set(r.trade_id, [...(byTrade.get(r.trade_id) ?? []), { id: d.id, label: d.label, phase: d.phase, sentiment: d.sentiment as Sentiment }]);
  });
  const stats = new Map<string, string[]>();
  (cs.data ?? []).forEach((r) => stats.set(r.trade_id, [...(stats.get(r.trade_id) ?? []), r.option_id]));
  const enriched = (t.data as TradeRow[]).map((row) => ({ ...enrichTrade(row, im, sm, byTrade.get(row.id) ?? []), customStats: stats.get(row.id) ?? [] }));
  const annotated = new Map<string, Trade>();
  (jr.data ?? []).forEach((j) => {
    const flows = (cf.data ?? []).filter((c) => c.journal_id === j.id).map((c) => ({ occurred_on: c.occurred_on, amount: Number(c.amount) }));
    annotateAccount(enriched.filter((x) => x.journal_id === j.id), Number(j.starting_balance), flows).forEach((x) => annotated.set(x.id, x));
  });
  return enriched.map((x) => annotated.get(x.id) ?? x);
}

/** Deposits (+) and withdrawals (-) for a journal. */
export function useCashflows(journalId?: string) {
  const q = useQuery({
    queryKey: ["journal_cashflows", journalId],
    enabled: !!journalId,
    queryFn: async () => {
      const { data, error } = await supabase.from("journal_cashflows").select("*").eq("journal_id", journalId!).order("occurred_on");
      if (error) throw error;
      return data;
    },
  });
  const rows = q.data ?? [];
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  return { rows, total, flows: rows.map((r) => ({ occurred_on: r.occurred_on, amount: Number(r.amount) })) as Cashflow[] };
}

export function applyFilters(trades: Trade[], f: Filters) {
  const has = <T,>(a: T[] | undefined, v: T) => !a?.length || a.includes(v);
  const inR = (r: Range | undefined, v: number | null) => !r || ((r.min == null || (v != null && v >= r.min)) && (r.max == null || (v != null && v <= r.max)));
  const out = trades.filter((t) => {
    const d = t.entry_at.slice(0, 10);
    const dt = new Date(t.entry_at);
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    if (f.day && d !== f.day) return false;
    if (!has(f.instrument, t.instrument)) return false;
    if (!has(f.setup, t.setup)) return false;
    if (!has(f.tradeType, t.trade_type)) return false;
    if (!has(f.month, dt.getMonth())) return false;
    if (!has(f.weekday, dt.getDay())) return false;
    if (!has(f.hour, dt.getHours())) return false;
    if (!has(f.year, dt.getFullYear())) return false;
    if (f.direction && t.direction !== f.direction) return false;
    if (f.starred === "yes" && !t.is_favorite) return false;
    if (f.starred === "no" && t.is_favorite) return false;
    if (f.outcome?.length && !f.outcome.some((o) => (o === "win" ? isWin(t) : o === "loss" ? isLoss(t) : isBE(t)))) return false;
    if (!inR(f.returnPct, t.accountSize ? t.retPct : null)) return false;
    if (!inR(f.rMultiple, t.r)) return false;
    if (!inR(f.rrr, plannedRRR(t))) return false;
    for (const ids of Object.values(f.stats ?? {})) if (ids.length && !ids.some((id) => t.customStats.includes(id))) return false;
    return true;
  });
  if (f.lastTrades) return [...out].sort((a, b) => b.entry_at.localeCompare(a.entry_at)).slice(0, f.lastTrades);
  return out;
}

/** Trades of the active journal, with top-bar filters applied. */
export function useTrades(opts: { unfiltered?: boolean } = {}) {
  const { journal, filters } = useJournal();
  const q = useQuery({
    queryKey: ["trades", journal?.id],
    enabled: !!journal,
    queryFn: () => fetchTrades([journal!.id]),
  });
  const all = q.data ?? [];
  const trades = useMemo(() => (opts.unfiltered ? all : applyFilters(all, filters)), [all, filters, opts.unfiltered]);
  const cash = useCashflows(journal?.id);
  return { trades, all, isLoading: q.isLoading, journal, cashflow: cash.total };
}
