import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import { fromTable } from "@/lib/journal/untyped-table";
import { assetClassFor as inferAssetClass } from "@/lib/pnl/instrument-catalogue";

/** Database access for the import dialog. Every call throws on failure so the dialog can show one error. */

const CHUNK = 500;
const LOOKUP_CHUNK = 200;

type TradeInsert = TablesInsert<"trades">;
type ExecutionInsert = TablesInsert<"trade_executions">;

const chunks = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * Ids of the journal's instruments or setups by name, creating the ones that do not exist yet.
 * Names that are blank are ignored.
 */
export async function ensureNamedRows(
  journalId: string,
  markets: string[] | null | undefined,
  table: "instruments" | "setups",
  column: "symbol" | "name",
  names: (string | undefined)[],
): Promise<Map<string, string>> {
  const { data: have, error } = await supabase
    .from(table)
    .select(`id,${column}`)
    .eq("journal_id", journalId);
  if (error) throw error;
  const named = (x: unknown) => x as Record<string, string>;
  const ids = new Map<string, string>((have ?? []).map((x) => [named(x)[column]!, named(x).id!]));
  const fresh = [...new Set(names.filter((n): n is string => !!n && !ids.has(n)))];
  if (fresh.length) {
    const { data, error: insertError } = await fromTable(table)
      .insert(
        fresh.map((n) => ({
          [column]: n,
          ...(table === "instruments"
            ? { asset_class: inferAssetClass(n, markets ?? undefined) }
            : {}),
          journal_id: journalId,
        })),
      )
      .select(`id,${column}`);
    if (insertError) throw insertError;
    data?.forEach((x) => ids.set(named(x)[column]!, named(x).id!));
  }
  return ids;
}

/**
 * Insert trades in batches, skipping any whose external_id is already in the journal, so importing the same file twice adds
 * nothing. Returns the id of every trade that was actually inserted, keyed by external_id.
 */
export async function insertNewTrades(rows: TradeInsert[]): Promise<Map<string, string>> {
  const idByExternal = new Map<string, string>();
  for (const batch of chunks(rows, CHUNK)) {
    const { data, error } = await supabase
      .from("trades")
      .upsert(batch, { onConflict: "journal_id,external_id", ignoreDuplicates: true })
      .select("id,external_id");
    if (error) throw error;
    data?.forEach((d) => d.external_id && idByExternal.set(d.external_id, d.id));
  }
  return idByExternal;
}

/** Ids of trades already in the journal, by external_id. */
export async function findTradeIds(
  journalId: string,
  externalIds: string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const batch of chunks(externalIds, LOOKUP_CHUNK)) {
    const { data, error } = await supabase
      .from("trades")
      .select("id,external_id")
      .eq("journal_id", journalId)
      .in("external_id", batch);
    if (error) throw error;
    data?.forEach((d) => d.external_id && found.set(d.external_id, d.id));
  }
  return found;
}

/** Which of these trades already have saved fills. */
export async function tradeIdsWithLegs(tradeIds: string[]): Promise<Set<string>> {
  const withLegs = new Set<string>();
  for (const batch of chunks(tradeIds, LOOKUP_CHUNK)) {
    const { data, error } = await supabase
      .from("trade_executions")
      .select("trade_id")
      .in("trade_id", batch);
    if (error) throw error;
    data?.forEach((d) => withLegs.add(d.trade_id));
  }
  return withLegs;
}

export async function insertExecutions(legs: ExecutionInsert[]): Promise<void> {
  for (const batch of chunks(legs, CHUNK)) {
    const { error } = await supabase.from("trade_executions").insert(batch);
    if (error) throw error;
  }
}

export type MtImportResult = {
  inserted: number;
  updated: number;
  unchanged: number;
  cashflows: number;
};

/** One database call is one transaction: instruments, account link, trades and deposits land together or not at all. */
export async function importMtReport(args: {
  journalId: string;
  payload: unknown;
  repair: boolean;
  force: boolean;
}) {
  const res = await supabase.rpc("import_mt_report", {
    _journal_id: args.journalId,
    _payload: args.payload as Json,
    _repair: args.repair,
    _force: args.force,
  });
  return { result: res.data as MtImportResult | null, error: res.error };
}
