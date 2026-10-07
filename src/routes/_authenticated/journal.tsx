import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFillViewport } from "@/lib/use-fill-viewport";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Copy, Download, GripVertical, ImageIcon, Merge, RefreshCw, Scaling, Star, Trash2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useJournal, useTrades } from "@/lib/journal-context";
import type { Trade } from "@/lib/metrics";
import { fmtNum } from "@/lib/metrics";
import { useTradeDrawer } from "@/components/TradeDrawer";
import { ImportDialog } from "@/components/ImportDialog";
import { Empty, TiltMeter } from "@/components/kit";
import { cn } from "@/lib/utils";
import { defaultJournalTableLayout, moveJournalColumn, normalizeJournalTableLayout, suggestedColumnWidth, type JournalTableLayout } from "@/lib/journal-table-layout";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({ meta: [{ title: "Journal — AlphaMine" }, { name: "description", content: "All trades in your journal." }, { property: "og:title", content: "Journal — AlphaMine" }, { property: "og:description", content: "All trades in your journal." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: JournalPage,
});

type Col = { k: string; l: string; get: (t: Trade) => string | number; render?: (t: Trade) => React.ReactNode; width?: number };
const num = (v: number, d: number) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const dt = (s: string | null) => (s ? s.replace("T", " ").slice(0, 16) : "");
const pill = (t: Trade, txt: string) => <span className={cn("inline-block min-w-[38px] rounded-full px-2.5 py-[3px] text-center text-[10px] font-medium capitalize leading-none", t.net_pnl > 0 ? "bg-pill-win text-profit" : t.net_pnl < 0 ? "bg-pill-loss text-loss" : "bg-muted text-foreground")}>{txt}</span>;
const LEFT_COLS = ["instrument", "setup", "trade_type", "option_type", "direction", "entry_at", "exit_at", "tilt", "id", "notes"];
const alignRight = (k: string) => !LEFT_COLS.includes(k);
const pnlText = (t: Trade) => (t.net_pnl > 0 ? "text-profit" : t.net_pnl < 0 ? "text-loss" : "text-foreground");
const COLS: Col[] = [
  { k: "id", l: "Trade ID", get: (t) => t.id.slice(0, 8), width: 105 },
  { k: "entry_at", l: "Entry Date", get: (t) => t.entry_at, render: (t) => <span className={pnlText(t)}>{dt(t.entry_at)}</span>, width: 132 },
  { k: "exit_at", l: "Exit Date", get: (t) => t.exit_at ?? "", render: (t) => <span className={pnlText(t)}>{dt(t.exit_at)}</span>, width: 132 },
  { k: "instrument", l: "Instrument", get: (t) => t.instrument, width: 105 },
  { k: "trade_type", l: "Trade Type", get: (t) => t.trade_type, render: (t) => pill(t, t.trade_type) },
  { k: "option_type", l: "Option Type", get: (t) => (t.trade_type === "options" ? "Option" : ""), width: 100 },
  { k: "setup", l: "Setup", get: (t) => t.setup },
  { k: "tilt", l: "Tiltmeter", get: (t) => t.tilt, render: (t) => <TiltMeter value={t.tilt} /> },
  { k: "direction", l: "Direction", get: (t) => t.direction, render: (t) => pill(t, t.direction) },
  { k: "quantity", l: "Quantity", get: (t) => t.quantity, render: (t) => num(t.quantity, 2) },
  { k: "entry_price", l: "Entry Price", get: (t) => t.entry_price, render: (t) => num(t.entry_price, 3) },
  { k: "exit_price", l: "Exit Price", get: (t) => t.exit_price ?? "", render: (t) => (t.exit_price == null ? "" : num(t.exit_price, 3)) },
  { k: "take_profit", l: "TP Price", get: (t) => t.take_profit ?? "", render: (t) => (t.take_profit == null ? "" : num(Number(t.take_profit), 2)) },
  { k: "stop_loss", l: "SL Price", get: (t) => t.stop_loss ?? "", render: (t) => (t.stop_loss == null ? "" : num(Number(t.stop_loss), 3)) },
  { k: "fees", l: "Fees ($)", get: (t) => t.fees, render: (t) => num(t.fees, 2) },
  { k: "gross_pnl", l: "Gross P&L", get: (t) => t.gross_pnl, render: (t) => num(t.gross_pnl, 2) },
  { k: "net_pnl", l: "Return ($)", get: (t) => t.net_pnl, render: (t) => <span className={pnlText(t)}>{num(t.net_pnl, 2)}</span> },
  { k: "ret_pct", l: "Return (%)", get: (t) => t.retPct, render: (t) => <span className={pnlText(t)}>{num(t.retPct, 2)}</span> },
  { k: "r", l: "R-Multiple", get: (t) => t.r ?? 0, render: (t) => (t.r == null ? "" : `${fmtNum(t.r)}R`) },
  { k: "risk_amount", l: "Risk Amount", get: (t) => t.risk_amount ?? "", render: (t) => (t.risk_amount == null ? "" : num(Number(t.risk_amount), 2)) },
  { k: "notes", l: "Notes", get: (t) => t.notes ?? "", render: (t) => <span className="inline-block max-w-48 truncate align-middle">{t.notes ?? ""}</span> },
];

function JournalPage() {
  const { trades } = useTrades();
  const { filters, setFilters, journal } = useJournal();
  const drawer = useTradeDrawer();
  const qc = useQueryClient();
  const [sort, setSort] = useState<{ k: string; asc: boolean }>({ k: "entry_at", asc: false });
  const keys = useMemo(() => COLS.map((c) => c.k), []);
  const defaults = useMemo(() => defaultJournalTableLayout(keys), [keys]);
  const [layout, setLayout] = useState<JournalTableLayout>(defaults);
  const [layoutReady, setLayoutReady] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const dragKey = useRef<string | null>(null);
  const [colSearch, setColSearch] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [imp, setImp] = useState(false);

  const hidden = useMemo(() => new Set(layout.hidden), [layout.hidden]);
  const cols = layout.order.map((key) => COLS.find((c) => c.k === key)).filter((c): c is Col => c !== undefined).filter((c) => !hidden.has(c.k));
  const sorted = useMemo(() => {
    const c = COLS.find((x) => x.k === sort.k);
    if (!c) return trades;
    return [...trades].sort((a, b) => { const x = c.get(a), y = c.get(b); return (x < y ? -1 : x > y ? 1 : 0) * (sort.asc ? 1 : -1); });
  }, [trades, sort]);
  const chosen = trades.filter((t) => sel.has(t.id));
  const fillRef = useFillViewport<HTMLDivElement>();
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pg = Math.min(page, pages - 1);
  const visible = sorted.slice(pg * pageSize, pg * pageSize + pageSize);
  const shotIds = useScreenshotTradeIds(journal?.id);

  useEffect(() => {
    if (!journal?.id) return;
    const raw = localStorage.getItem(`am.journal-table.${journal.id}`);
    try {
      setLayout(normalizeJournalTableLayout(raw ? JSON.parse(raw) as Partial<JournalTableLayout> : null, keys));
    } catch {
      setLayout(defaults);
    }
    setLayoutReady(true);
  }, [defaults, journal?.id, keys]);

  useEffect(() => {
    if (!journal?.id || !layoutReady) return;
    localStorage.setItem(`am.journal-table.${journal.id}`, JSON.stringify(layout));
  }, [journal?.id, layout, layoutReady]);

  async function del() {
    if (!confirm(`Delete ${sel.size} trade(s)?`)) return;
    await supabase.from("trades").delete().in("id", [...sel]);
    setSel(new Set()); qc.invalidateQueries(); toast.success("Deleted");
  }
  async function dup() {
    const rows = chosen.map((t) => ({
      journal_id: t.journal_id, instrument_id: t.instrument_id, setup_id: t.setup_id, direction: t.direction, trade_type: t.trade_type,
      entry_at: t.entry_at, exit_at: t.exit_at, entry_price: t.entry_price, exit_price: t.exit_price, quantity: t.quantity, stop_loss: t.stop_loss,
      take_profit: t.take_profit, gross_pnl: t.gross_pnl, fees: t.fees, net_pnl: t.net_pnl, risk_amount: t.risk_amount, notes: t.notes,
    }));
    await supabase.from("trades").insert(rows);
    setSel(new Set()); qc.invalidateQueries(); toast.success("Duplicated");
  }
  async function merge() {
    const ts = [...chosen].sort((a, b) => a.entry_at.localeCompare(b.entry_at));
    if (new Set(ts.map((t) => t.instrument_id)).size > 1 || new Set(ts.map((t) => t.direction)).size > 1) return toast.error("Merge needs same instrument and direction");
    const qty = ts.reduce((a, t) => a + t.quantity, 0);
    const wavg = (k: "entry_price" | "exit_price") => ts.reduce((a, t) => a + (Number(t[k]) || 0) * t.quantity, 0) / qty;
    const first = ts[0];
    await supabase.from("trades").update({
      quantity: qty, entry_price: wavg("entry_price"), exit_price: wavg("exit_price"),
      exit_at: ts.map((t) => t.exit_at).filter(Boolean).sort().pop() ?? null,
      gross_pnl: ts.reduce((a, t) => a + t.gross_pnl, 0), fees: ts.reduce((a, t) => a + t.fees, 0), net_pnl: ts.reduce((a, t) => a + t.net_pnl, 0),
    }).eq("id", first.id);
    await supabase.from("trades").delete().in("id", ts.slice(1).map((t) => t.id));
    setSel(new Set()); qc.invalidateQueries(); toast.success("Merged");
  }
  async function toggleFav(t: Trade) {
    await supabase.from("trades").update({ is_favorite: !t.is_favorite }).eq("id", t.id);
    qc.invalidateQueries({ queryKey: ["trades"] });
  }
  async function exportExcel() {
    const XLSX = await import("xlsx");
    const rows = sorted.map((t) => Object.fromEntries(cols.map((c) => [c.l, c.get(t) ?? ""])));
    const sheet = XLSX.utils.json_to_sheet(rows, { header: cols.map((c) => c.l) });
    sheet["!cols"] = cols.map((c) => ({ wpx: layout.widths[c.k] ?? c.width ?? 110 }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Journal");
    XLSX.writeFile(book, `${journal?.name ?? "journal"}.xlsx`);
  }

  function autoSizeColumns() {
    const widths = Object.fromEntries(cols.map((c) => [c.k, suggestedColumnWidth(c.l, visible.map((t) => c.get(t)), 76, 240)]));
    setLayout((current) => ({ ...current, widths: { ...current.widths, ...widths } }));
    toast.success("Columns auto-sized");
  }

  function resetColumns() {
    setLayout(defaults);
    toast.success("Default columns restored");
  }

  function resizeColumn(key: string, startX: number) {
    const col = COLS.find((item) => item.k === key);
    const startWidth = layout.widths[key] ?? col?.width ?? 110;
    const move = (event: PointerEvent) => setLayout((current) => ({ ...current, widths: { ...current.widths, [key]: Math.max(64, Math.min(360, startWidth + event.clientX - startX)) } }));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function dropColumn(target: string) {
    const source = dragKey.current;
    if (!source) return;
    setLayout((current) => ({ ...current, order: moveJournalColumn(current.order, source, target) }));
    dragKey.current = null;
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2.5 px-[22px] pb-3 pt-[18px]">
      <Button variant="ink" size="sm" className="h-[30px] rounded-md px-4 text-[12px]" onClick={() => drawer.open()}>Add Trade</Button>
      <Button variant="ink" size="sm" className="h-[30px] rounded-md px-4 text-[12px]" onClick={() => setImp(true)}>Import Trades</Button>
      <Button variant="secondary" size="sm" className="h-[30px] rounded-md px-4 text-[12px] text-t4" disabled={sel.size < 2} onClick={merge}><Merge className="h-3.5 w-3.5" />Merge</Button>
      <Button variant="secondary" size="sm" className="h-[30px] rounded-md px-4 text-[12px] text-t4" disabled={!sel.size} onClick={dup}><Copy className="h-3.5 w-3.5" />Duplicate</Button>
      <Button variant="secondary" size="sm" className="h-[30px] rounded-md px-4 text-[12px] text-t4" disabled={!sel.size} onClick={del}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
      {filters.day && <Button variant="ghost" size="sm" onClick={() => setFilters({ ...filters, day: undefined })}>Day: {filters.day} <X className="ml-1 h-3 w-3" /></Button>}
      <div className="flex-1" />
      <Button variant="ghost" size="icon" title="Download to Excel" aria-label="Download to Excel" onClick={exportExcel}><Download className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" title="Auto-size columns" aria-label="Auto-size columns" onClick={autoSizeColumns}><Scaling className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" title="Reset to default" aria-label="Reset to default" onClick={resetColumns}><RefreshCw className="h-4 w-4" /></Button>
    </div>
  );

  return (
    <div ref={fillRef} className="flex min-h-[320px] flex-col overflow-hidden rounded-lg bg-card shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
      {toolbar}
      {trades.length === 0 ? <div className="p-6"><Empty>No trades match. Add a trade or clear filters.</Empty></div> : (
        <>
        <div className="relative flex min-h-0 flex-1 border-t">
          <div className="slim-scroll min-h-0 min-w-0 flex-1 overflow-auto">
          <table className="whitespace-nowrap text-[12px]" style={{ tableLayout: "fixed", width: cols.reduce((sum, c) => sum + (layout.widths[c.k] ?? c.width ?? 110), 96) }}>
            <colgroup><col style={{ width: 40 }} /><col style={{ width: 28 }} /><col style={{ width: 28 }} />{cols.map((c) => <col key={c.k} style={{ width: layout.widths[c.k] ?? c.width ?? 110 }} />)}</colgroup>
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="h-[42px] border-b text-left text-[12px] text-foreground">
                <th className="w-10 p-3"><Checkbox checked={sel.size === trades.length} onCheckedChange={(v) => setSel(v ? new Set(trades.map((t) => t.id)) : new Set())} /></th>
                <th className="w-8" /><th className="w-8" />
                {cols.map((c) => (
                  <th key={c.k} draggable onDragStart={() => { dragKey.current = c.k; }} onDragOver={(e) => e.preventDefault()} onDrop={() => dropColumn(c.k)} className={cn("relative cursor-grab select-none overflow-hidden px-3 text-[12px] font-semibold text-foreground", alignRight(c.k) && "text-right")} onClick={() => setSort({ k: c.k, asc: sort.k === c.k ? !sort.asc : false })}>
                    <span className="inline-flex items-center gap-1">{c.l}{sort.k === c.k && (sort.asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
                    <span role="separator" aria-label={`Resize ${c.l}`} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); resizeColumn(c.k, e.clientX); }} className="absolute inset-y-1 right-0 w-1 cursor-col-resize border-r border-transparent hover:border-ring" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} onClick={() => drawer.open(t, { list: sorted })}
                  className={cn("h-[32px] cursor-pointer tabular hover:brightness-[0.97]", t.net_pnl > 0 ? "bg-row-win" : t.net_pnl < 0 ? "bg-row-loss" : "bg-card")}>
                  <td className="px-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={sel.has(t.id)} onCheckedChange={() => setSel((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })} />
                  </td>
                  <td onClick={(e) => { e.stopPropagation(); toggleFav(t); }}><Star className={cn("h-[17px] w-[17px] text-foreground", t.is_favorite && "fill-foreground")} /></td>
                  <td className="px-1">{shotIds.has(t.id) && <ImageIcon className="h-[17px] w-[17px] text-foreground" />}</td>
                  {cols.map((c) => <td key={c.k} className={cn("overflow-hidden text-ellipsis px-3", alignRight(c.k) && "text-right", pnlText(t))}>{c.render ? c.render(t) : c.get(t)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <button type="button" aria-label="Columns" aria-expanded={columnsOpen} onClick={() => setColumnsOpen((open) => !open)} className="flex w-7 shrink-0 items-center justify-center border-l bg-card text-[10px] font-semibold [writing-mode:vertical-rl] hover:bg-muted"><Columns3 className="mb-1 h-3.5 w-3.5" />Columns</button>
          {columnsOpen && <aside className="absolute bottom-0 right-7 top-0 z-20 w-60 border-l bg-card p-2 shadow-lg">
            <input autoFocus value={colSearch} onChange={(e) => setColSearch(e.target.value)} placeholder="Search columns..." className="mb-2 w-full rounded border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
            <div className="h-[calc(100%-40px)] space-y-0.5 overflow-auto">
              {layout.order.map((key) => COLS.find((c) => c.k === key)).filter((c): c is Col => c !== undefined).filter((c) => c.l.toLowerCase().includes(colSearch.toLowerCase())).map((c) => (
                <div key={c.k} draggable onDragStart={() => { dragKey.current = c.k; }} onDragOver={(e) => e.preventDefault()} onDrop={() => dropColumn(c.k)} className="flex cursor-grab items-center gap-1 rounded px-1 py-1 text-sm hover:bg-muted">
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Checkbox checked={!hidden.has(c.k)} onCheckedChange={() => setLayout((current) => ({ ...current, hidden: hidden.has(c.k) ? current.hidden.filter((key) => key !== c.k) : [...current.hidden, c.k] }))} />
                  <span className="truncate">{c.l}</span>
                </div>
              ))}
            </div>
          </aside>}
        </div>
          <div className="flex shrink-0 items-center justify-end gap-4 border-t px-4 py-2.5 text-[11px]">
            <span className="flex items-center gap-1">Page Size:
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} className="rounded border bg-card px-1 py-0.5">{[25, 50, 100, 250].map((n) => <option key={n}>{n}</option>)}</select>
            </span>
            <span>{pg * pageSize + 1} to {Math.min(sorted.length, (pg + 1) * pageSize)} of {sorted.length}</span>
            <span className="flex items-center gap-1">
              <button onClick={() => setPage(0)} disabled={pg === 0}><ChevronsLeft className="h-4 w-4" /></button>
              <button onClick={() => setPage(pg - 1)} disabled={pg === 0}><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-1">Page {pg + 1} of {pages}</span>
              <button onClick={() => setPage(pg + 1)} disabled={pg >= pages - 1}><ChevronRight className="h-4 w-4" /></button>
              <button onClick={() => setPage(pages - 1)} disabled={pg >= pages - 1}><ChevronsRight className="h-4 w-4" /></button>
            </span>
          </div>
        </>
      )}
      <ImportDialog open={imp} onOpenChange={setImp} />
    </div>
  );
}

function useScreenshotTradeIds(journalId?: string) {
  const { data } = useQuery({
    queryKey: ["screenshot-ids", journalId],
    enabled: !!journalId,
    queryFn: async () => {
      const { data } = await supabase.from("trade_screenshots").select("trade_id").eq("journal_id", journalId!);
      return new Set((data ?? []).map((r) => r.trade_id as string));
    },
  });
  return data ?? new Set<string>();
}
