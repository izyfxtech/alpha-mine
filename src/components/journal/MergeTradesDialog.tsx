import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { sweepStorage } from "@/lib/media/sweep-storage";
import { fmtPrice } from "@/lib/pnl/format-price";
import { localDateTime } from "@/lib/time/local-time";
import { fmtNum, type Trade } from "@/lib/pnl/metrics";
import { defaultKeeper, isImported, looksLikeDuplicate, mergeBlocker, type MergeMode } from "@/lib/journal/merge-trades";
import { cn } from "@/lib/utils";
import { MAX_SHOTS } from "@/lib/media/limits";

const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const OPTIONS: { mode: MergeMode; title: string; text: string }[] = [
  { mode: "duplicate", title: "Same trade, logged twice", text: "For example typed by hand and also imported. One set of numbers is kept; nothing is added up." },
  { mode: "combine", title: "Parts of one position", text: "Scale-in or partial exits. Sizes and P&L are added together, prices are size-weighted." },
];

/** Asks how the selected trades relate before merging them, then calls merge_trades. Screenshots, notes, comments, tags and rule checks are kept from every trade in both cases. */
export function MergeTradesDialog({ trades, open, onOpenChange, onMerged }: { trades: Trade[]; open: boolean; onOpenChange: (o: boolean) => void; onMerged: () => void }) {
  const qc = useQueryClient();
  const sorted = useMemo(() => [...trades].sort((a, b) => a.entry_at.localeCompare(b.entry_at)), [trades]);
  const likelyDuplicate = useMemo(() => looksLikeDuplicate(sorted), [sorted]);
  const [mode, setMode] = useState<MergeMode>("combine");
  const [keepId, setKeepId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Each time the dialog opens, pre-select what the trades look like; the trader can change it.
  useEffect(() => {
    if (!open) return;
    setMode(likelyDuplicate ? "duplicate" : "combine");
    setKeepId(defaultKeeper(sorted)?.id ?? "");
    setBusy(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const ids = sorted.map((t) => t.id);
  const { data: shots = [] } = useQuery({
    queryKey: ["merge-shot-count", ids],
    enabled: open && ids.length > 1,
    queryFn: async () => {
      const { data, error } = await supabase.from("trade_screenshots").select("trade_id").in("trade_id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });
  const blocker = mergeBlocker(sorted, mode);
  const totalQty = sorted.reduce((a, t) => a + Number(t.quantity), 0);
  const totalNet = sorted.reduce((a, t) => a + t.net_pnl, 0);
  const keeper = sorted.find((t) => t.id === keepId) ?? defaultKeeper(sorted);

  async function run() {
    if (blocker || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("merge_trades", { _ids: ids, _mode: mode, ...(mode === "duplicate" && keeper ? { _keep: keeper.id } : {}) });
    if (error) { setBusy(false); return toast.error(error.message); }
    sweepStorage(); qc.invalidateQueries(); onMerged(); onOpenChange(false);
    toast.success(mode === "duplicate" ? "Merged into one trade" : "Trades combined");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge {sorted.length} trades</DialogTitle>
          <DialogDescription>How do these trades relate? Notes, screenshots, comments, tags and rule checks from all of them are kept either way.</DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Merge type" className="grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <button key={o.mode} type="button" role="radio" aria-checked={mode === o.mode} onClick={() => setMode(o.mode)}
              className={cn("rounded-md border p-3 text-left transition-colors hover:bg-muted", mode === o.mode && "border-ink bg-muted ring-1 ring-ink")}>
              <span className="flex items-center justify-between gap-2 text-sm font-semibold">{o.title}
                {o.mode === "duplicate" && likelyDuplicate && <span className="rounded-full bg-profit-soft px-2 py-0.5 text-xs font-medium text-profit">Looks like this</span>}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{o.text}</span>
            </button>
          ))}
        </div>

        <div className="max-h-56 overflow-auto rounded-md border">
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 bg-card text-left text-muted-foreground">
              <tr>{mode === "duplicate" && <th className="w-24 px-2 py-2 font-medium">Keep numbers</th>}<th className="px-2 py-2 font-medium">Trade</th><th className="px-2 py-2 font-medium">Entry</th><th className="px-2 py-2 text-right font-medium">Size</th><th className="px-2 py-2 text-right font-medium">Entry → Exit</th><th className="px-2 py-2 text-right font-medium">Net P&amp;L</th></tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.id} className={cn("border-t", mode === "duplicate" && keeper?.id === t.id && "bg-muted")}>
                  {mode === "duplicate" && <td className="px-2 py-2"><input type="radio" name="merge-keep" aria-label={`Keep the numbers of ${t.instrument} ${localDateTime(t.entry_at)}`} checked={keeper?.id === t.id} onChange={() => setKeepId(t.id)} /></td>}
                  <td className="px-2 py-2"><span className="font-medium">{t.instrument}</span> <span className="capitalize text-muted-foreground">{t.direction}</span> <span className={cn("ml-1 rounded px-1.5 py-0.5", isImported(t) ? "bg-muted" : "border")}>{isImported(t) ? "Imported" : "Manual"}</span></td>
                  <td className="px-2 py-2">{localDateTime(t.entry_at)}</td>
                  <td className="px-2 py-2 text-right">{fmtNum(Number(t.quantity), 2)}</td>
                  <td className="px-2 py-2 text-right">{fmtPrice(t.entry_price)} → {fmtPrice(t.exit_price)}</td>
                  <td className={cn("px-2 py-2 text-right", t.net_pnl > 0 && "text-profit", t.net_pnl < 0 && "text-loss")}>{money(t.net_pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-sm">
          {mode === "combine"
            ? <>Result: one trade of <b>{fmtNum(totalQty, 2)}</b> with a net P&amp;L of <b>{money(totalNet)}</b>.</>
            : <>Result: one trade with the figures of the selected trade (<b>{fmtNum(Number(keeper?.quantity ?? 0), 2)}</b>, net <b>{money(keeper?.net_pnl ?? 0)}</b>). The others are removed after their extras are carried over{keeper && isImported(keeper) ? "; the imported trade keeps updating on re-import" : ""}.</>}
        </p>
        {shots.length > MAX_SHOTS && <p className="rounded-md bg-loss-soft px-3 py-2 text-xs text-loss">Together these trades have {shots.length} screenshots, and a trade holds {MAX_SHOTS}. The oldest {MAX_SHOTS} are kept; the rest are removed.</p>}
        {blocker && <p className="rounded-md bg-loss-soft px-3 py-2 text-xs text-loss">{blocker}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="ink" onClick={run} disabled={!!blocker || busy}>{busy ? "Merging…" : "Merge"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
