import { supabase } from "@/integrations/supabase/client";

export interface PnlAuditProgress {
  processed: number;
  applied: number;
  reconciliation: Record<string, number>;
}

/**
 * Runs the compute-pnl Edge Function until a journal is fully audited. With `apply`, planned risk is also written
 * to trades that have none, so R-multiples appear for imported MetaTrader trades. Gross and net are never changed.
 */
export async function auditJournalPnl(journalId: string, opts: { apply?: boolean; onProgress?: (p: PnlAuditProgress) => void } = {}): Promise<PnlAuditProgress> {
  const total: PnlAuditProgress = { processed: 0, applied: 0, reconciliation: {} };
  for (let guard = 0; guard < 500; guard++) {
    const { data, error } = await supabase.functions.invoke("compute-pnl", { body: { journal_id: journalId, apply: opts.apply === true } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    total.processed += data.processed ?? 0;
    total.applied += data.applied ?? 0;
    for (const [k, v] of Object.entries((data.reconciliation ?? {}) as Record<string, number>)) total.reconciliation[k] = (total.reconciliation[k] ?? 0) + v;
    opts.onProgress?.({ ...total });
    if (!data.remaining) return total;
  }
  throw new Error("compute-pnl did not finish; try again");
}
