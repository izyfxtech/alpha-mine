import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { countOption, fetchAllRows } from "@/lib/journal/fetch-all";
import { fromTable } from "@/lib/journal/untyped-table";

type Tables = Database["public"]["Tables"];
type TableName = keyof Tables;
type TableRow<T extends TableName> = Tables[T]["Row"];
/** The part of a journal a copy reads. */
export type CopySource = Pick<
  TableRow<"journals">,
  | "id"
  | "currency"
  | "starting_balance"
  | "broker"
  | "markets"
  | "deposit_date"
  | "trade_type"
  | "auto_pnl"
  | "session_categories"
> & { quantity_unit?: string | null };

/** What to copy besides the journal's structure (setups, instruments, comments and custom statistics are always copied). */
export interface CopyInclude {
  trades: boolean;
  plans: boolean;
  missed: boolean;
}

/** Rows per insert request, so a large journal does not exceed the request size limit. */
const INSERT_BATCH = 500;

/** Old row id -> id of its copy. */
type IdMap = Map<string, string>;

type ScreenshotOwner = "trade_id" | "missed_trade_id" | "planned_trade_id";

/** The columns a copy must not carry over: the copy gets its own id, journal and timestamp. */
function withoutIdentity<R extends { id: string; journal_id: string; created_at: string }>(row: R) {
  const { id: _id, journal_id: _journal, created_at: _created, ...rest } = row;
  return rest;
}

/** Looks an id up in a map, keeping "no value" as null (an optional link that points at nothing copied). */
const mapped = (ids: IdMap, oldId: string | null) => (oldId ? (ids.get(oldId) ?? null) : null);

/**
 * Copies a journal's structure and, optionally, its records into a new journal, remapping every id.
 * Returns the new journal's id. All or nothing: if anything fails, the new journal is deleted (which removes everything
 * copied so far) and the error is rethrown. Screenshot files are shared with the original, so they are never deleted.
 */
export async function copyJournal(
  source: CopySource,
  name: string,
  include: CopyInclude,
): Promise<string> {
  const { data: created, error } = await supabase
    .from("journals")
    .insert({
      name,
      currency: source.currency,
      starting_balance: source.starting_balance,
      broker: source.broker,
      markets: source.markets,
      deposit_date: source.deposit_date,
      trade_type: source.trade_type,
      auto_pnl: source.auto_pnl,
      quantity_unit: source.quantity_unit,
      session_categories: source.session_categories,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const journalId = created.id;

  try {
    await copyContents(source.id, journalId, include);
  } catch (e) {
    await supabase.from("journals").delete().eq("id", journalId);
    throw e;
  }
  return journalId;
}

async function copyContents(sourceId: string, journalId: string, include: CopyInclude) {
  // Every row of a table (the API caps one response at Max Rows), in a stable order.
  const all = <T extends TableName>(table: T, order: string[] = ["id"]) =>
    fetchAllRows<TableRow<T>>((from, to, first) => {
      let query = fromTable(table).select("*", countOption(first)).eq("journal_id", sourceId);
      for (const column of order) query = query.order(column);
      return query.range(from, to);
    });

  const insertInBatches = async (table: TableName, rows: Record<string, unknown>[]) => {
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const { error } = await fromTable(table).insert(rows.slice(i, i + INSERT_BATCH));
      if (error) throw new Error(error.message);
    }
  };

  /** Inserts a copy of every row (new id, new journal) and returns old id -> new id. */
  const copyRows = async <T extends TableName>(
    table: T,
    rows: (TableRow<T> & { id: string })[],
    toValues: (row: TableRow<T> & { id: string }) => Record<string, unknown>,
  ): Promise<IdMap> => {
    const ids: IdMap = new Map();
    const payload = rows.map((row) => {
      const id = crypto.randomUUID();
      ids.set(row.id, id);
      return { ...toValues(row), id, journal_id: journalId };
    });
    await insertInBatches(table, payload);
    return ids;
  };

  // Structure: always copied.
  const [instruments, setups, commentDefs, categories, options] = await Promise.all([
    all("instruments"),
    all("setups"),
    all("comment_definitions"),
    all("custom_stat_categories"),
    all("custom_stat_options"),
  ]);
  const instrumentIds = await copyRows("instruments", instruments, withoutIdentity);
  const setupIds = await copyRows("setups", setups, withoutIdentity);
  const commentDefIds = await copyRows("comment_definitions", commentDefs, withoutIdentity);
  const categoryIds = await copyRows("custom_stat_categories", categories, withoutIdentity);
  const optionIds = await copyRows("custom_stat_options", options, (o) => ({
    ...withoutIdentity(o),
    category_id: categoryIds.get(o.category_id),
  }));
  const planIds = include.plans
    ? await copyRows("trading_plans", await all("trading_plans"), withoutIdentity)
    : new Map<string, string>();

  // Screenshots are copied last, once every record they belong to has a new id.
  const sourceShots = await all("trade_screenshots");
  const shotCopies: Record<string, unknown>[] = [];
  const collectShots = (owner: ScreenshotOwner, ids: IdMap) => {
    for (const shot of sourceShots) {
      const oldOwner = shot[owner];
      const newOwner = oldOwner ? ids.get(oldOwner) : undefined;
      if (newOwner)
        shotCopies.push({
          journal_id: journalId,
          [owner]: newOwner,
          path: shot.path,
          caption: shot.caption,
        });
    }
  };

  if (include.trades) {
    const tradeIds = await copyRows("trades", await all("trades"), (t) => {
      const { trade_no: _tradeNo, ...rest } = withoutIdentity(t);
      return {
        ...rest,
        instrument_id: mapped(instrumentIds, t.instrument_id),
        setup_id: mapped(setupIds, t.setup_id),
        trading_plan_id: mapped(planIds, t.trading_plan_id),
        pnl_manual: true,
      };
    });
    const [tradeComments, tradeStats] = await Promise.all([
      all("trade_comments", ["trade_id", "comment_definition_id"]),
      all("trade_custom_stats", ["trade_id", "option_id"]),
    ]);
    await insertInBatches(
      "trade_comments",
      tradeComments
        .filter((r) => tradeIds.has(r.trade_id) && commentDefIds.has(r.comment_definition_id))
        .map((r) => ({
          trade_id: tradeIds.get(r.trade_id)!,
          comment_definition_id: commentDefIds.get(r.comment_definition_id)!,
          journal_id: journalId,
        })),
    );
    await insertInBatches(
      "trade_custom_stats",
      tradeStats
        .filter((r) => tradeIds.has(r.trade_id) && optionIds.has(r.option_id))
        .map((r) => ({
          trade_id: tradeIds.get(r.trade_id)!,
          option_id: optionIds.get(r.option_id)!,
          journal_id: journalId,
        })),
    );
    collectShots("trade_id", tradeIds);
    await copyRows("journal_cashflows", await all("journal_cashflows"), withoutIdentity);
  }

  if (include.missed) {
    const missedIds = await copyRows("missed_trades", await all("missed_trades"), withoutIdentity);
    const missedStats = await all("missed_trade_custom_stats", ["missed_trade_id", "option_id"]);
    await insertInBatches(
      "missed_trade_custom_stats",
      missedStats
        .filter((r) => missedIds.has(r.missed_trade_id) && optionIds.has(r.option_id))
        .map((r) => ({
          journal_id: journalId,
          missed_trade_id: missedIds.get(r.missed_trade_id)!,
          option_id: optionIds.get(r.option_id)!,
        })),
    );
    collectShots("missed_trade_id", missedIds);
  }

  if (include.plans) {
    const plannedIds = await copyRows(
      "planned_trades",
      await all("planned_trades"),
      withoutIdentity,
    );
    collectShots("planned_trade_id", plannedIds);
  }

  await insertInBatches("trade_screenshots", shotCopies);
}
