import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { RichEditor } from "@/components/RichEditor";
import { axis, tooltipStyle } from "@/components/kit";
import { useJournal } from "@/lib/journal-context";
import { useJournalTable, type Row } from "@/lib/crud";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/strategy-lab/backtester")({
  head: () => ({
    meta: [
      { title: "Backtester — AlphaMine" },
      { name: "description", content: "Record backtest outcomes side by side and compare win rates and totals." },
      { property: "og:title", content: "Backtester — AlphaMine" },
      { property: "og:description", content: "Record backtest outcomes side by side and compare win rates and totals." },
    ],
  }),
  component: Backtester,
});

type BT = Row<"backtests">;
const LINE_COLORS = ["var(--color-profit)", "var(--color-loss)", "var(--color-info)", "var(--color-star)", "var(--color-chart-2)", "var(--color-chart-3)"];

/** Per-outcome summary for a grid of results (rows × outcomes). */
export function summarize(outcomes: string[], rows: number[][]) {
  return outcomes.map((_, j) => {
    const col = rows.map((r) => Number(r[j]) || 0);
    const w = col.filter((v) => v > 0).length, l = col.filter((v) => v < 0).length, be = col.length - w - l;
    return { w, l, be, total: col.reduce((s, v) => s + v, 0), winrate: col.length ? (w / col.length) * 100 : 0 };
  });
}
const joinBy = (xs: (string | number)[]) => xs.join(" / ");

function Backtester() {
  const { journal } = useJournal();
  const t = useJournalTable("backtests", journal?.id, "created_at", true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<BT | "new" | null>(null);
  const maxOutcomes = Math.max(2, ...t.rows.map((r) => r.outcomes.length));

  const del = async () => {
    if (!confirm(`Delete ${sel.size} backtest(s)?`)) return;
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
              <th className="px-3 font-semibold">Name</th>
              {["Trades", "Winners", "Losers", "Break even", "Winrate"].map((h) => <th key={h} className="px-3 text-center font-semibold">{h}</th>)}
              {Array.from({ length: maxOutcomes }, (_, i) => <th key={i} className="px-3 text-right font-semibold">Outcome {i + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {t.rows.length === 0 && <tr><td colSpan={8 + maxOutcomes} className="py-12 text-center text-sm text-muted-foreground">No backtests yet. Click “Add More” to record one.</td></tr>}
            {t.rows.map((r) => {
              const rows = (r.results as number[][]) ?? [];
              const s = summarize(r.outcomes, rows);
              const tot = s[0]?.total ?? 0;
              return (
                <tr key={r.id} onClick={() => setEdit(r)} className="cursor-pointer border-b border-border/40 tabular hover:bg-muted/50">
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={sel.has(r.id)} onCheckedChange={() => setSel((p) => { const x = new Set(p); x.has(r.id) ? x.delete(r.id) : x.add(r.id); return x; })} />
                  </td>
                  <td><span className={cn("block h-5 w-0.5", tot > 0 ? "bg-profit" : tot < 0 ? "bg-loss" : "bg-foreground")} /></td>
                  <td className="px-3">{r.name}</td>
                  <td className="px-3 text-center">{rows.length}</td>
                  <td className="px-3 text-center">{joinBy(s.map((x) => x.w))}</td>
                  <td className="px-3 text-center">{joinBy(s.map((x) => x.l))}</td>
                  <td className="px-3 text-center">{joinBy(s.map((x) => x.be))}</td>
                  <td className="px-3 text-center">{joinBy(s.map((x) => `${x.winrate.toFixed(2)}%`))}</td>
                  {Array.from({ length: maxOutcomes }, (_, i) => <td key={i} className="px-3 text-right">{s[i] ? s[i].total.toFixed(3) : ""}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edit && <BacktestSheet key={edit === "new" ? "new" : edit.id} row={edit === "new" ? null : edit} onClose={() => setEdit(null)}
        onSave={async (v) => { if (edit === "new") await t.insert(v); else await t.update(edit.id, v); setEdit(null); }} />}
    </div>
  );
}

function BacktestSheet({ row, onClose, onSave }: { row: BT | null; onClose: () => void; onSave: (v: Partial<BT>) => Promise<void> }) {
  const [name, setName] = useState(row?.name ?? "New Backtest");
  const [outcomes, setOutcomes] = useState<string[]>(row?.outcomes ?? ["Outcome 1", "Outcome 2"]);
  const [rows, setRows] = useState<string[][]>(() => ((row?.results as number[][]) ?? Array.from({ length: 10 }, () => [0, 0])).map((r) => r.map(String)));
  const [notes, setNotes] = useState(row?.notes ?? "");
  const nums = rows.map((r) => outcomes.map((_, j) => Number(r[j]) || 0));
  const s = summarize(outcomes, nums);
  const chart = nums.map((r, i) => {
    const point: Record<string, number> = { n: i + 1 };
    outcomes.forEach((o, j) => { point[o] = +(nums.slice(0, i + 1).reduce((a, x) => a + (x[j] ?? 0), 0)).toFixed(3); });
    return point;
  });
  const setCell = (i: number, j: number, v: string) => setRows((p) => p.map((r, ri) => (ri === i ? outcomes.map((_, jj) => (jj === j ? v : r[jj] ?? "0")) : r)));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[860px] [&>button]:hidden">
        <div className="flex items-center justify-between px-5 py-4"><SheetTitle className="text-base">{row ? "Edit Backtest" : "New Backtest"}</SheetTitle><button onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button></div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="mb-3" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="max-h-[300px] overflow-y-auto rounded-md border">
                <table className="w-full text-xs tabular">
                  <thead className="sticky top-0 bg-card"><tr>
                    <th className="w-10 px-2 py-2 text-left">#</th>
                    {outcomes.map((o, j) => <th key={j} className="px-1 text-right"><input aria-label={`Outcome ${j + 1} name`} className="w-full bg-transparent text-right font-semibold outline-none" value={o} onChange={(e) => setOutcomes((p) => p.map((x, k) => (k === j ? e.target.value : x)))} /></th>)}
                    <th className="w-8" />
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-2 py-1">{i + 1}</td>
                        {outcomes.map((_, j) => <td key={j} className="px-1"><input type="number" step="any" aria-label={`Row ${i + 1} ${outcomes[j]}`} className="w-full bg-transparent text-right outline-none" value={r[j] ?? "0"} onChange={(e) => setCell(i, j, e.target.value)} /></td>)}
                        <td><button aria-label={`Delete row ${i + 1}`} onClick={() => setRows((p) => p.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-loss"><Trash2 className="h-3.5 w-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setRows((p) => [...p, outcomes.map(() => "0")])}><Plus className="h-3.5 w-3.5" />Add Row</Button>
                <Button variant="outline" size="sm" disabled={outcomes.length >= 6} onClick={() => { setOutcomes((p) => [...p, `Outcome ${p.length + 1}`]); setRows((p) => p.map((r) => [...r, "0"])); }}><Plus className="h-3.5 w-3.5" />Add Outcome</Button>
              </div>
            </div>
            <RichEditor value={notes} onChange={setNotes} className="min-h-[300px]" />
          </div>
          <div className="mt-5 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="n" tick={axis} tickLine={false} axisLine={false} />
                <YAxis tick={axis} tickLine={false} axisLine={false} width={50} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {outcomes.map((o, j) => <Line key={o + j} dataKey={o} type="monotone" dot={false} strokeWidth={2} stroke={LINE_COLORS[j % LINE_COLORS.length]} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2 text-center text-xs">
            {[["Trades", `${rows.length}`], ["Winners", joinBy(s.map((x) => x.w))], ["Losers", joinBy(s.map((x) => x.l))], ["Break even", joinBy(s.map((x) => x.be))], ["Winrate", joinBy(s.map((x) => `${x.winrate.toFixed(2)}%`))],
              ...outcomes.map((o, j) => [o, (s[j]?.total ?? 0).toFixed(2)])].map(([l, v]) => (
              <div key={l} className="rounded-md bg-muted/60 p-3"><p className="text-muted-foreground">{l}</p><p className="mt-1 font-semibold tabular">{v}</p></div>
            ))}
          </div>
        </div>
        <div className="flex gap-2 border-t px-5 py-4">
          <Button variant="ink" size="sm" onClick={() => onSave({ name: name || "Backtest", outcomes, results: nums as never, notes })}>Save</Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
