import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Filters } from "@/lib/journal/journal-context";

export interface SavedFilter { id: string; name: string; filters: Filters }

/** Keep only what is worth saving: drop empty values so a saved set reads cleanly and old keys can't linger. */
export function cleanFilters(f: Filters): Filters {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v) && !v.length) continue;
    if (k === "stats") {
      const stats = Object.fromEntries(Object.entries(v as Record<string, string[]>).filter(([, ids]) => ids.length));
      if (Object.keys(stats).length) out.stats = stats;
      continue;
    }
    if (typeof v === "object" && !Array.isArray(v) && (v as { min?: number; max?: number }).min == null && (v as { min?: number; max?: number }).max == null) continue;
    out[k] = v;
  }
  return out as Filters;
}

export function useSavedFilters(journalId?: string) {
  const qc = useQueryClient();
  const key = ["saved_filters", journalId];
  const q = useQuery({
    queryKey: key,
    enabled: !!journalId,
    queryFn: async (): Promise<SavedFilter[]> => {
      const { data, error } = await supabase.from("saved_filters").select("id,name,filters").eq("journal_id", journalId!).order("name");
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, name: r.name, filters: (r.filters ?? {}) as Filters }));
    },
  });
  return {
    saved: q.data ?? [],
    /** Saves under `name`; the same name replaces the old set. */
    save: async (name: string, filters: Filters) => {
      const n = name.trim();
      if (!journalId || !n) return false;
      const { error } = await supabase.from("saved_filters").upsert({ journal_id: journalId, name: n, filters: cleanFilters(filters) as unknown as Json }, { onConflict: "journal_id,name" });
      if (error) { toast.error(error.message); return false; }
      await qc.invalidateQueries({ queryKey: key });
      return true;
    },
    remove: async (id: string) => {
      const { error } = await supabase.from("saved_filters").delete().eq("id", id);
      if (error) { toast.error(error.message); return; }
      await qc.invalidateQueries({ queryKey: key });
    },
  };
}
