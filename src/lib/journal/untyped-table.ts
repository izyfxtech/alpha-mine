import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Query builder for a table chosen at run time.
 *
 * The generated client types every table separately, so `supabase.from(name)` cannot be typed when `name` is a variable (the
 * generic journal-table helper, the journal copy, the data export). This is the one place that steps outside those types: callers
 * state the rows they expect themselves, with `Row<T>` from `crud.ts` or `asPage` from `fetch-all.ts`. Everything with a fixed
 * table name should keep using `supabase.from("trades")` directly so it stays fully typed.
 */
export function fromTable(table: string) {
  return (supabase as unknown as SupabaseClient).from(table);
}
