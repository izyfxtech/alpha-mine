import { supabase } from "@/integrations/supabase/client";
import { fromTable } from "@/lib/journal/untyped-table";
import { syncLinks } from "@/lib/journal/sync-links";
import type { RuleStatus } from "@/lib/pnl/metrics";

/** Database access for the trade editor, kept out of the component so the form only deals with form state. */

export type LookupTable = "instruments" | "setups";
export type AltResultDraft = { strategyId: string; profit: number; r: number };

export async function fetchTradeExecutions(tradeId: string) {
  const { data, error } = await supabase
    .from("trade_executions")
    .select("id,kind,side,quantity,price,executed_at,commission,swap,fee")
    .eq("trade_id", tradeId)
    .order("executed_at", { ascending: true });
  if (error) throw error;
  return data;
}

/** The journal's alternative strategies, plus this trade's saved what-if results keyed by strategy id. */
export async function fetchAltStrategies(journalId: string, tradeId?: string) {
  const [strategies, results] = await Promise.all([
    supabase.from("alt_strategies").select("id,name,setup_id").eq("journal_id", journalId),
    tradeId
      ? supabase
          .from("alt_strategy_results")
          .select("strategy_id,alt_profit,alt_r")
          .eq("trade_id", tradeId)
      : Promise.resolve({
          data: [] as { strategy_id: string; alt_profit: number; alt_r: number }[],
        }),
  ]);
  const saved: Record<string, { p: string; r: string }> = {};
  for (const x of results.data ?? [])
    saved[x.strategy_id] = { p: String(x.alt_profit), r: String(x.alt_r) };
  return { strategies: strategies.data ?? [], saved };
}

/** Bring a retired instrument or setup back. Returns an error message or null. */
export async function reenableLookup(table: LookupTable, id: string): Promise<string | null> {
  const { error } = await supabase.from(table).update({ disabled: false }).eq("id", id);
  return error?.message ?? null;
}

export async function insertLookup(table: LookupTable, row: Record<string, unknown>) {
  const { data, error } = await fromTable(table).insert(row).select("id").single();
  return { id: (data as { id: string } | null)?.id ?? null, error };
}

/** Find an instrument or setup by name regardless of case (used after a unique-name clash). */
export async function findLookupByName(
  table: LookupTable,
  journalId: string,
  column: "symbol" | "name",
  value: string,
) {
  const { data } = await supabase
    .from(table)
    .select("id,disabled")
    .eq("journal_id", journalId)
    .ilike(column, value.replace(/[\\%_]/g, "\\$&"))
    .limit(1)
    .maybeSingle();
  return data;
}

async function insertReturningId(
  table: "comment_definitions" | "custom_stat_options",
  row: Record<string, unknown>,
) {
  const { data, error } = await fromTable(table).insert(row).select("id").single();
  return { id: (data as { id: string } | null)?.id ?? null, error };
}

export const insertCommentDefinition = (journalId: string, phase: string, label: string) =>
  insertReturningId("comment_definitions", {
    phase,
    label,
    sentiment: "neutral",
    journal_id: journalId,
  });

export const insertStatOption = (journalId: string, categoryId: string, label: string) =>
  insertReturningId("custom_stat_options", {
    category_id: categoryId,
    label,
    journal_id: journalId,
  });

export async function insertStatCategory(journalId: string, name: string, position: number) {
  const { error } = await supabase
    .from("custom_stat_categories")
    .insert({ name, position, journal_id: journalId });
  return error?.message ?? null;
}

type SaveTradeInput = {
  journalId: string;
  /** Set when editing; omitted for a new trade. */
  tradeId?: string;
  row: Record<string, unknown>;
  commentIds: string[];
  statIds: string[];
  ruleStatuses: Record<string, RuleStatus>;
  altResults: AltResultDraft[];
};

/**
 * Write a trade and everything attached to it. Tag links are added before stale ones are removed, so a failure part-way
 * never wipes a trade's tags and ratings. Throws on the first error; returns the trade id.
 */
export async function saveTradeRecord(input: SaveTradeInput): Promise<string> {
  const { journalId, tradeId, row, commentIds, statIds, ruleStatuses, altResults } = input;
  const trades = fromTable("trades");
  const res = tradeId
    ? await trades.update(row).eq("id", tradeId).select("id").single()
    : await trades.insert(row).select("id").single();
  if (res.error) throw res.error;
  const id = (res.data as { id: string }).id;
  const [e1, e2] = await Promise.all([
    syncLinks("trade_comments", "trade_id", id, journalId, commentIds, "comment_definition_id"),
    syncLinks("trade_custom_stats", "trade_id", id, journalId, statIds),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2)!);
  const checks = Object.entries(ruleStatuses).map(([rule_id, status]) => ({
    trade_id: id,
    rule_id,
    status,
    journal_id: journalId,
  }));
  if (checks.length) {
    const { error } = await supabase
      .from("trade_rule_checks")
      .upsert(checks, { onConflict: "trade_id,rule_id" });
    if (error) throw error;
  }
  const del = supabase.from("trade_rule_checks").delete().eq("trade_id", id);
  const { error: delError } = checks.length
    ? await del.not("rule_id", "in", `(${checks.map((c) => c.rule_id).join(",")})`)
    : await del;
  if (delError) throw delError;
  if (altResults.length) {
    const { error } = await supabase.from("alt_strategy_results").upsert(
      altResults.map((a) => ({
        strategy_id: a.strategyId,
        trade_id: id,
        journal_id: journalId,
        alt_profit: a.profit,
        alt_r: a.r,
      })),
      { onConflict: "strategy_id,trade_id" },
    );
    if (error) throw error;
  }
  return id;
}
