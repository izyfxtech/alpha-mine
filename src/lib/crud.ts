import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type TableName = "backtests" | "alt_strategies" | "planned_trades" | "notebook_folders" | "trading_plans" | "missed_trades" | "notebook_pages" | "diary_sessions" | "instruments" | "setups" | "comment_definitions" | "journal_cashflows" | "custom_stat_categories" | "custom_stat_options";
export type Row<T extends TableName> = Tables[T]["Row"];

/** Journal-scoped list + insert/update/delete helpers for simple tables. */
export function useJournalTable<T extends TableName>(table: T, journalId: string | undefined, orderBy = "created_at", ascending = false) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [table, journalId, orderBy, ascending],
    enabled: !!journalId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from(table).select("*").eq("journal_id", journalId!).order(orderBy, { ascending });
      if (error) throw error;
      return data as unknown as Row<T>[];
    },
  });
  const done = () => { qc.invalidateQueries({ queryKey: [table] }); qc.invalidateQueries({ queryKey: ["lookups"] }); qc.invalidateQueries({ queryKey: ["trades"] }); };
  const fail = (e: { message: string } | null) => { if (e) { toast.error(e.message); return true; } return false; };
  return {
    rows: q.data ?? [],
    isLoading: q.isLoading,
    insert: async (values: Partial<Row<T>>) => {
      const { data, error } = await (supabase as any).from(table).insert({ ...values, journal_id: journalId } as never).select().single();
      if (!fail(error)) done();
      return data as unknown as Row<T> | null;
    },
    update: async (id: string, values: Partial<Row<T>>) => {
      const { error } = await (supabase as any).from(table).update(values as never).eq("id", id);
      if (!fail(error)) done();
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
    remove: async (id: string) => {
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (!fail(error)) done();
    },
  };
}
