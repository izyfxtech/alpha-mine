import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { countOption, fetchAllRows } from "@/lib/journal/fetch-all";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type TableName = "backtests" | "alt_strategies" | "planned_trades" | "notebook_folders" | "trading_plans" | "missed_trades" | "notebook_pages" | "diary_sessions" | "instruments" | "setups" | "comment_definitions" | "journal_cashflows" | "custom_stat_categories" | "custom_stat_options" | "prop_challenges" | "trading_rules";
export type Row<T extends TableName> = Tables[T]["Row"];

/** Journal-scoped list + insert/update/delete helpers for simple tables. */
/** Tables behind the pickers (instruments, setups, tags, rules, plans). */
const LOOKUP_TABLES = new Set(["instruments", "setups", "comment_definitions", "trading_plans", "custom_stat_categories", "custom_stat_options", "trading_rules"]);
/** Tables whose rows are folded into every trade (names, tags, rule checks, balance via cashflows). */
const TRADE_DEPENDENT_TABLES = new Set(["instruments", "setups", "comment_definitions", "custom_stat_categories", "custom_stat_options", "trading_rules", "journal_cashflows", "trades"]);

export function useJournalTable<T extends TableName>(table: T, journalId: string | undefined, orderBy = "created_at", ascending = false) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [table, journalId, orderBy, ascending],
    enabled: !!journalId,
    queryFn: async () => {
      // Every row (not just the first Max Rows), ordered with `id` as the tiebreaker so pages never repeat or skip.
      const rows = await fetchAllRows<Row<T>>((from, to, first) => (supabase as any).from(table).select("*", countOption(first)).eq("journal_id", journalId!).order(orderBy, { ascending }).order("id").range(from, to));
      return rows;
    },
  });
  // Only what the write can change is refetched. A note autosave must not download the whole trade history again (AM-M31).
  const done = () => {
    qc.invalidateQueries({ queryKey: [table] });
    if (LOOKUP_TABLES.has(table)) qc.invalidateQueries({ queryKey: ["lookups"] });
    if (TRADE_DEPENDENT_TABLES.has(table)) qc.invalidateQueries({ queryKey: ["trades"] });
  };
  const fail = (e: { message: string } | null) => { if (e) { toast.error(e.message); return true; } return false; };
  return {
    rows: q.data ?? [],
    isLoading: q.isLoading,
    insert: async (values: Partial<Row<T>>) => {
      const { data, error } = await (supabase as any).from(table).insert({ ...values, journal_id: journalId } as never).select().single();
      if (!fail(error)) done();
      return data as unknown as Row<T> | null;
    },
    /** Returns whether it worked, so a sheet can stay open (keeping what was typed) when it did not. */
    update: async (id: string, values: Partial<Row<T>>): Promise<boolean> => {
      const { error } = await (supabase as any).from(table).update(values as never).eq("id", id);
      if (fail(error)) return false;
      done();
      return true;
    },
    /** Move a row up/down and rewrite every row's position so order is stable. */
     move: async (id: string, dir: -1 | 1, group?: { field: string; value: string }) => {
       const rows = [...((q.data ?? []) as unknown as (Record<string, unknown> & { id: string })[])].filter((r) => !group || r[group.field] === group.value);
      const i = rows.findIndex((r) => r.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= rows.length) return;
      [rows[i], rows[j]] = [rows[j], rows[i]];
       const results = await Promise.all(rows.map((r, position) => (supabase as any).from(table).update({ position }).eq("id", r.id)));
      if (!fail(results.find((r: { error: { message: string } | null }) => r.error)?.error ?? null)) done();
    },
    /** Persist a drag-and-drop order: every id gets position = its index in the given list. */
    reorder: async (orderedIds: string[]) => {
      const results = await Promise.all(orderedIds.map((id, position) => (supabase as any).from(table).update({ position }).eq("id", id)));
      if (!fail(results.find((r: { error: { message: string } | null }) => r.error)?.error ?? null)) done();
    },
    /** Deletes one row. Returns whether it worked, so callers never act as if a failed delete had succeeded. */
    remove: async (id: string): Promise<boolean> => {
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (fail(error)) return false;
      done();
      return true;
    },
  };
}
