import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useJournal } from "@/lib/journal-context";
import { seedDemoTrades } from "@/lib/demo";

const FIELDS = ["entry_at", "exit_at", "instrument", "setup", "direction", "entry_price", "exit_price", "quantity", "stop_loss", "take_profit", "gross_pnl", "fees", "net_pnl"] as const;

function parseCSV(text: string) {
  const rows = text.trim().split(/\r?\n/).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  return { header: rows[0] ?? [], rows: rows.slice(1) };
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { journal } = useJournal();
  const qc = useQueryClient();
  const [csv, setCsv] = useState<{ header: string[]; rows: string[][] } | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    const p = parseCSV(await file.text());
    setCsv(p);
    const auto: Record<string, string> = {};
    FIELDS.forEach((f) => {
      const hit = p.header.find((h) => h.toLowerCase().replace(/[^a-z]/g, "") === f.replace(/_/g, ""));
      if (hit) auto[f] = hit;
    });
    setMap(auto);
  }

  async function run() {
    if (!csv || !journal) return;
    setBusy(true);
    try {
      const col = (r: string[], f: string) => (map[f] ? r[csv.header.indexOf(map[f])] : undefined);
      const { data: ins } = await supabase.from("instruments").select("id,symbol").eq("journal_id", journal.id);
      const im = new Map((ins ?? []).map((i) => [i.symbol, i.id]));
      const newSyms = [...new Set(csv.rows.map((r) => col(r, "instrument")).filter((s): s is string => !!s && !im.has(s)))];
      if (newSyms.length) {
        const { data } = await supabase.from("instruments").insert(newSyms.map((symbol) => ({ symbol, journal_id: journal.id }))).select("id,symbol");
        data?.forEach((i) => im.set(i.symbol, i.id));
      }
      const n = (v?: string) => (v == null || v === "" ? null : Number(v));
      const rows = csv.rows.filter((r) => col(r, "entry_at") && col(r, "entry_price")).map((r) => {
        const gross = n(col(r, "gross_pnl")) ?? n(col(r, "net_pnl")) ?? 0;
        const fees = n(col(r, "fees")) ?? 0;
        const d = (col(r, "direction") ?? "long").toLowerCase();
        return {
          journal_id: journal.id,
          instrument_id: im.get(col(r, "instrument") ?? "") ?? null,
          direction: d.startsWith("s") || d === "sell" ? "short" : "long",
          entry_at: new Date(col(r, "entry_at")!).toISOString(),
          exit_at: col(r, "exit_at") ? new Date(col(r, "exit_at")!).toISOString() : null,
          entry_price: Number(col(r, "entry_price")),
          exit_price: n(col(r, "exit_price")),
          quantity: n(col(r, "quantity")) ?? 1,
          stop_loss: n(col(r, "stop_loss")),
          take_profit: n(col(r, "take_profit")),
          gross_pnl: gross,
          fees,
          net_pnl: n(col(r, "net_pnl")) ?? gross - fees,
        };
      });
      const { error } = await supabase.from("trades").insert(rows);
      if (error) throw error;
      toast.success(`Imported ${rows.length} trades`);
      qc.invalidateQueries();
      setCsv(null);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function demo() {
    if (!journal) return;
    setBusy(true);
    try {
      await seedDemoTrades(journal.id);
      toast.success("Sample trades added");
      qc.invalidateQueries();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import trades</DialogTitle>
          <DialogDescription>Upload a CSV export from your broker and match its columns.</DialogDescription>
        </DialogHeader>
        <input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="text-sm" />
        {csv && (
          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto text-sm">
            {FIELDS.map((f) => (
              <label key={f} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{f.replace(/_/g, " ")}</span>
                <select className="h-8 rounded-md border bg-background px-2" value={map[f] ?? ""} onChange={(e) => setMap({ ...map, [f]: e.target.value })}>
                  <option value="">—</option>
                  {csv.header.map((h) => <option key={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-between gap-2">
          {import.meta.env.DEV ? <Button variant="ghost" onClick={demo} disabled={busy}>Add sample trades (dev only)</Button> : <span />}
          <Button onClick={run} disabled={!csv || busy}>Import {csv ? `${csv.rows.length} rows` : ""}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
