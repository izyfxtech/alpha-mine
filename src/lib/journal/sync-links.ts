import { supabase } from "@/integrations/supabase/client";

/**
 * Make the tag links of one record equal `wanted`, safely: missing links are added first, then the ones no longer wanted are removed.
 * A failure part-way therefore leaves the record with extra tags at worst, never with its tags wiped (AM-L25). Returns an error message or null.
 */
export async function syncLinks(table: string, ownerColumn: string, ownerId: string, journalId: string, wanted: string[], valueColumn = "option_id"): Promise<string | null> {
  const db = supabase as unknown as { from: (t: string) => any };
  const cur = await db.from(table).select(valueColumn).eq(ownerColumn, ownerId);
  if (cur.error) return cur.error.message;
  const have = new Set<string>((cur.data ?? []).map((r: Record<string, string>) => r[valueColumn]));
  const want = new Set(wanted);
  const add = [...want].filter((id) => !have.has(id));
  const drop = [...have].filter((id) => !want.has(id));
  if (add.length) {
    const { error } = await db.from(table).insert(add.map((v) => ({ [ownerColumn]: ownerId, [valueColumn]: v, journal_id: journalId })));
    if (error) return error.message;
  }
  if (drop.length) {
    const { error } = await db.from(table).delete().eq(ownerColumn, ownerId).in(valueColumn, drop);
    if (error) return error.message;
  }
  return null;
}
