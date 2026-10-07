import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { RichEditor } from "@/components/RichEditor";
import { axis, seriesValues, tooltipStyle, tradeAxis, yScale } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import { useJournal, useLookups, useTrades } from "@/lib/journal-context";
import { useJournalTable, type Row } from "@/lib/crud";
import type { Trade } from "@/lib/metrics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/strategy-lab/alternatives")({
  head: () => ({
    meta: [
      { title: "Alternative Strategies — AlphaMine" },
      { name: "description", content: "Compare your real trade results with what an alternative strategy would have made." },
      { property: "og:title", content: "Alternative Strategies — AlphaMine" },
      { property: "og:description", content: "Compare your real trade results with what an alternative strategy would have made." },
    ],
  }),
  component: Alternatives,
});

type Strat = Row<"alt_strategies">;
type Result = { strategy_id: string; trade_id: string; alt_profit: number; alt_r: number };
const f2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function useResults(journalId?: string) {
  return useQuery({
    queryKey: ["alt_strategy_results", journalId],
    enabled: !!journalId,
    queryFn: async () => {
      const { data, error } = await supabase.from("alt_strategy_results").select("strategy_id,trade_id,alt_profit,alt_r").eq("journal_id", journalId!);
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, alt_profit: Number(r.alt_profit), alt_r: Number(r.alt_r) })) as Result[];
    },
  });
}

function Alternatives() {
  const { journal } = useJournal();
  const { trades } = useTrades({ unfiltered: true });
  const { data: lk } = useLookups(journal?.id);
  const t = useJournalTable("alt_strategies", journal?.id, "created_at", true);
  const { data: results = [] } = useResults(journal?.id);
  const qc = useQueryClient();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Strat | "new" | null>(null);

  const tradesFor = (setupId: string | null) => trades.filter((x) => x.setup_id === setupId).sort((a, b) => a.entry_at.localeCompare(b.entry_at));
  const del = async () => {
    if (!confirm(`Delete ${sel.size} strateg${sel.size === 1 ? "y" : "ies"}?`)) return;
    await Promise.all([...sel].map((id) => t.remove(id)));
    setSel(new Set());
  };

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 p-4">
        <Button variant="ink" onClick={() => setEdit("new")}><Plus className="h-4 w-4" />Add More</Button>
        <Button variant="secondary" disabled={!sel.size} onClick={del}><Trash2 className="h-4 w-4" />Delete</Button>
      </div>
      <div className="overflow-auto">
        <table className="w-full whitespace-nowrap text-xs">
          <thead>
            <tr className="border-b text-left">
              <th className="w-10 px-3 py-2.5"><Checkbox checked={!!t.rows.length && sel.size === t.rows.length} onCheckedChange={(v) => setSel(v ? new Set(t.rows.map((r) => r.id)) : new Set())} /></th>
              <th className="w-4" />
              <th className="px-3 font-semibold">Name</th><th className="px-3 font-semibold">Setup</th>
              {["Trades", "Winners", "Losers", "Winrate (%)", "Return", "Return (alt.)", "Difference"].map((h) => <th key={h} className="px-3 text-right font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {t.rows.length === 0 && <tr><td colSpan={11} className="py-12 text-center text-sm text-muted-foreground">No alternative strategies yet. Click “Add More” to compare a different way of trading a setup.</td></tr>}
            {t.rows.map((r) => {
              const tr = tradesFor(r.setup_id);
              const res = new Map(results.filter((x) => x.strategy_id === r.id).map((x) => [x.trade_id, x]));
              const w = tr.filter((x) => x.net_pnl > 0).length, l = tr.filter((x) => x.net_pnl < 0).length;
              const ret = tr.reduce((s, x) => s + x.net_pnl, 0), alt = tr.reduce((s, x) => s + (res.get(x.id)?.alt_profit ?? x.net_pnl), 0);
              const diff = alt - ret;
              return (
                <tr key={r.id} onClick={() => setEdit(r)} className="cursor-pointer border-b border-border/40 tabular hover:bg-muted/50">
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}><Checkbox checked={sel.has(r.id)} onCheckedChange={() => setSel((p) => { const x = new Set(p); x.has(r.id) ? x.delete(r.id) : x.add(r.id); return x; })} /></td>
                  <td><span className={cn("block h-5 w-0.5", ret >= 0 ? "bg-profit" : "bg-loss")} /></td>
                  <td className="px-3">{r.name}</td>
                  <td className="px-3">{lk?.setups.find((s) => s.id === r.setup_id)?.name ?? "—"}</td>
                  <td className="px-3 text-right">{tr.length}</td><td className="px-3 text-right">{w}</td><td className="px-3 text-right">{l}</td>
                  <td className="px-3 text-right">{tr.length ? f2((w / tr.length) * 100) : "0.00"}</td>
                  <td className="px-3 text-right">{f2(ret)}</td><td className="px-3 text-right">{f2(alt)}</td>
                  <td className={cn("px-3 text-right", diff > 0 ? "text-profit" : diff < 0 ? "text-loss" : "")}>{f2(diff)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edit && <StrategySheet key={edit === "new" ? "new" : edit.id} row={edit === "new" ? null : edit} setups={lk?.setups ?? []} tradesFor={tradesFor}
        results={results} onClose={() => setEdit(null)}
        onSave={async (v, rows) => {
          let id = edit === "new" ? null : edit.id;
          if (id) await t.update(id, v); else id = (await t.insert(v))?.id ?? null;
          if (!id || !journal) return;
          await supabase.from("alt_strategy_results").delete().eq("strategy_id", id);
          if (rows.length) {
            const { error } = await supabase.from("alt_strategy_results").insert(rows.map((x) => ({ ...x, strategy_id: id!, journal_id: journal.id })));
            if (error) { toast.error(error.message); return; }
          }
          qc.invalidateQueries({ queryKey: ["alt_strategy_results"] });
          setEdit(null);
        }} />}
    </div>
  );
}

function StrategySheet({ row, setups, tradesFor, results, onClose, onSave }: {
  row: Strat | null; setups: { id: string; name: string }[]; tradesFor: (setupId: string | null) => Trade[]; results: Result[];
  onClose: () => void; onSave: (v: Partial<Strat>, rows: { trade_id: string; alt_profit: number; alt_r: number }[]) => Promise<void>;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [setupId, setSetupId] = useState<string>(row?.setup_id ?? setups[0]?.id ?? "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const tr = useMemo(() => tradesFor(setupId || null), [tradesFor, setupId]);
  const [alt, setAlt] = useState<Record<string, { p: string; r: string }>>({});
  useEffect(() => {
    const m: Record<string, { p: string; r: string }> = {};
    for (const x of results.filter((r) => r.strategy_id === row?.id)) m[x.trade_id] = { p: String(x.alt_profit), r: String(x.alt_r) };
    setAlt(m);
  }, [row?.id, results]);
  const chart = tr.map((x, i) => ({ n: i + 1, Profit: +x.net_pnl.toFixed(2), "Alternative Profit": Number(val(x).p) || 0, "R-Multiple": +(x.r ?? 0).toFixed(2), "Alternative R-Multiple": Number(val(x).r) || 0 }));
  const def = (x: Trade) => ({ p: String(+x.net_pnl.toFixed(2)), r: String(+(x.r ?? 0).toFixed(2)) });
  const val = (x: Trade) => alt[x.id] ?? def(x);
  const setCell = (x: Trade, k: "p" | "r", v: string) => setAlt((p) => ({ ...p, [x.id]: { ...(p[x.id] ?? def(x)), [k]: v } }));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[860px] [&>button]:hidden">
        <div className="flex items-center justify-between px-5 py-4"><SheetTitle className="text-base">{row ? "Edit Strategy" : "New Strategy"}</SheetTitle><button onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <div className="mb-3 grid grid-cols-2 gap-4">
            <div className="space-y-1"><Label className="text-xs">Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Setup *</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={setupId} onChange={(e) => setSetupId(e.target.value)}>
                {setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="max-h-[320px] overflow-y-auto rounded-md border">
              <table className="w-full text-xs tabular">
                <thead className="sticky top-0 bg-card"><tr className="text-right">
                  <th className="px-2 py-2 text-left">#</th><th className="px-2">Profit</th><th className="px-2">R-Multiple</th><th className="px-2">alt. Profit</th><th className="px-2">alt. R-Multiple</th>
                </tr></thead>
                <tbody>
                  {tr.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No trades use this setup yet.</td></tr>}
                  {tr.map((x, i) => (
                    <tr key={x.id} className="border-t border-border/40 text-right">
                      <td className="px-2 py-1 text-left">{i + 1}</td>
                      <td className="px-2">{f2(x.net_pnl)}</td><td className="px-2">{(x.r ?? 0).toFixed(2)}</td>
                      <td className="px-1"><input type="number" step="any" aria-label={`Trade ${i + 1} alternative profit`} className="w-full bg-transparent text-right outline-none" value={val(x).p} onChange={(e) => setCell(x, "p", e.target.value)} /></td>
                      <td className="px-1"><input type="number" step="any" aria-label={`Trade ${i + 1} alternative R-multiple`} className="w-full bg-transparent text-right outline-none" value={val(x).r} onChange={(e) => setCell(x, "r", e.target.value)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <RichEditor value={notes} onChange={setNotes} className="min-h-[320px]" />
          </div>
          <div className="mt-5 h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="n" tick={axis} tickLine={false} axisLine={false} {...tradeAxis(chart.length)} />
                <YAxis yAxisId="p" tick={axis} tickLine={false} axisLine={false} width={55} {...yScale(seriesValues(chart, ["Profit", "Alternative Profit"]))} label={{ value: "Profit", angle: -90, position: "insideLeft", style: axis }} />
                <YAxis yAxisId="r" orientation="right" tick={axis} tickLine={false} axisLine={false} width={40} {...yScale(seriesValues(chart, ["R-Multiple", "Alternative R-Multiple"]))} label={{ value: "R-Multiple", angle: 90, position: "insideRight", style: axis }} />
                <Tooltip {...tooltipStyle} />
                <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="p" dataKey="Profit" type="monotone" dot={false} strokeWidth={2} stroke="var(--color-chart-1)" />
                <Line yAxisId="p" dataKey="Alternative Profit" type="monotone" dot={false} strokeWidth={2} stroke="var(--color-chart-1)" strokeOpacity={0.45} />
                <Line yAxisId="r" dataKey="R-Multiple" type="monotone" dot={false} strokeWidth={2} stroke="var(--color-chart-2)" />
                <Line yAxisId="r" dataKey="Alternative R-Multiple" type="monotone" dot={false} strokeWidth={2} stroke="var(--color-chart-2)" strokeOpacity={0.45} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="flex gap-2 border-t px-5 py-4">
          <Button variant="ink" size="sm" disabled={!name.trim() || !setupId} onClick={() => onSave({ name: name.trim(), setup_id: setupId, notes },
            tr.map((x) => ({ trade_id: x.id, alt_profit: Number(val(x).p) || 0, alt_r: Number(val(x).r) || 0 })))}>Save</Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
