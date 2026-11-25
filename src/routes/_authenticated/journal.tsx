import { pushTo } from "@/lib/group";
import { loadXlsx } from "@/lib/import/spreadsheet";
import { useWhenChanged } from "@/lib/use-when-changed";
import { useDebouncedCallback } from "use-debounce";
import { useStoredString } from "@/lib/use-stored-value";

import { createFileRoute } from "@tanstack/react-router";

import { countOption, fetchAllRows } from "@/lib/journal/fetch-all";
import { useMemo, useRef, useState } from "react";
import {
  JOURNAL_BOX,
  JOURNAL_HEAD_ROW,
  JOURNAL_ROW,
  JournalFooter,
  JournalToolbar,
  type JournalView,
} from "@/components/journal/JournalFrame";
import {
  COLS,
  alignRight,
  columnWidth,
  pnlText,
  tableWidth,
  visibleColumns,
  type Col,
} from "@/components/journal/journal-columns";
import { useFillViewport } from "@/lib/use-fill-viewport";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateData } from "@/lib/journal/query-cache";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Columns3, GripVertical, ImageIcon, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { sweepStorage } from "@/lib/media/sweep-storage";
import { activeFilterCount, useJournal, useTrades } from "@/lib/journal/journal-context";
import type { Trade } from "@/lib/pnl/metrics";
import { isOpen } from "@/lib/pnl/metrics";

import { useTradeDrawer } from "@/components/journal/TradeDrawer";
import { ImportDialog } from "@/components/journal/ImportDialog";
import { MergeTradesDialog } from "@/components/journal/MergeTradesDialog";
import { useScreenshots, type Shot } from "@/components/journal/Screenshots";
import { ScreenshotGallery, TradeCards } from "@/components/journal/TradeViews";
import { Empty } from "@/components/kit";
import { cn } from "@/lib/utils";
import {
  defaultJournalTableLayout,
  moveJournalColumn,
  suggestedColumnWidth,
  useJournalTableLayout,
} from "@/lib/journal/journal-table-layout";
import { useDialogs } from "@/components/ui/confirm";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({
    meta: [
      { title: "Journal — EdgeWhiz" },
      { name: "description", content: "All trades in your journal." },
      { property: "og:title", content: "Journal — EdgeWhiz" },
      { property: "og:description", content: "All trades in your journal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JournalPage,
});

function JournalPage() {
  const { confirm } = useDialogs();
  const { trades } = useTrades({ includeOpen: true });
  const { filters, setFilters, journal } = useJournal();
  const [qText, setQText] = useState(filters.q ?? "");
  useWhenChanged(filters.q, (q) => setQText(q ?? ""));
  // Typing updates the box at once; the list filter follows once typing pauses.
  const applyQuery = useDebouncedCallback((text: string) => {
    if (text.trim() !== (filters.q ?? "")) setFilters({ ...filters, q: text.trim() || undefined });
  }, 250);
  const changeQuery = (text: string) => {
    setQText(text);
    applyQuery(text);
  };
  const drawer = useTradeDrawer();
  const qc = useQueryClient();
  const [sort, setSort] = useState<{ k: string; asc: boolean }>({ k: "entry_at", asc: false });
  const keys = useMemo(() => COLS.map((c) => c.k), []);
  const defaults = useMemo(() => defaultJournalTableLayout(keys), [keys]);
  const [layout, setLayout] = useJournalTableLayout(journal?.id, keys);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const dragKey = useRef<string | null>(null);
  const [colSearch, setColSearch] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [imp, setImp] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const hidden = useMemo(() => new Set(layout.hidden), [layout.hidden]);
  const cols = visibleColumns(layout);
  const sorted = useMemo(() => {
    const c = COLS.find((x) => x.k === sort.k);
    if (!c) return trades;
    return [...trades].sort((a, b) => {
      const x = c.get(a),
        y = c.get(b);
      return (x < y ? -1 : x > y ? 1 : 0) * (sort.asc ? 1 : -1);
    });
  }, [trades, sort]);
  const chosen = trades.filter((t) => sel.has(t.id));
  // The selection can only hold trades on the current filtered list: a filter change drops the rest, so Delete,
  // Duplicate and Merge always act on exactly the trades the user can see ticked (AM-Y04).
  useWhenChanged(trades, (list) =>
    setSel((current) => {
      const visibleIds = new Set(list.map((t) => t.id));
      const kept = [...current].filter((id) => visibleIds.has(id));
      return kept.length === current.size ? current : new Set(kept); // same Set when nothing changed
    }),
  );
  const fillRef = useFillViewport<HTMLDivElement>();
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pg = Math.min(page, pages - 1);
  const visible = sorted.slice(pg * pageSize, pg * pageSize + pageSize);
  const shotIds = useScreenshotTradeIds(journal?.id);
  const [storedView, changeView] = useStoredString("am.journal-view");
  const view: JournalView =
    storedView === "cards" || storedView === "gallery" ? storedView : "table";
  // Signed screenshot URLs are only fetched for the views that show images.
  const { data: allShots = [], isLoading: shotsLoading } = useScreenshots(
    view === "table" ? undefined : journal?.id,
  );
  const shotsByTrade = useMemo(() => {
    const m = new Map<string, Shot[]>();
    for (const sh of allShots) if (sh.trade_id) pushTo(m, sh.trade_id, sh);
    return m;
  }, [allShots]);

  async function del() {
    const ids = chosen.map((t) => t.id);
    if (!ids.length) return;
    if (
      !(await confirm({
        title: `Delete ${ids.length} trade${ids.length === 1 ? "" : "s"}?`,
        message: "Their notes, tags and screenshots are deleted too. This cannot be undone.",
        destructive: true,
      }))
    )
      return;
    const { error } = await supabase.from("trades").delete().in("id", ids);
    if (error) return toast.error(error.message);
    sweepStorage();
    setSel(new Set());
    invalidateData(qc, "trades", "screenshots", "progress");
    toast.success("Deleted");
  }
  async function dup() {
    const rows = chosen.map((t) => ({
      journal_id: t.journal_id,
      instrument_id: t.instrument_id,
      setup_id: t.setup_id,
      direction: t.direction,
      trade_type: t.trade_type,
      entry_at: t.entry_at,
      exit_at: t.exit_at,
      entry_price: t.entry_price,
      exit_price: t.exit_price,
      quantity: t.quantity,
      stop_loss: t.stop_loss,
      take_profit: t.take_profit,
      high_price: t.high_price,
      low_price: t.low_price,
      otp_hit: t.otp_hit,
      is_favorite: t.is_favorite,
      gross_pnl: t.gross_pnl,
      fees: t.fees,
      net_pnl: t.net_pnl,
      risk_amount: t.risk_amount,
      notes: t.notes,
      // keep imported P&L as it is (otherwise the auto-P&L trigger would recompute it from prices) but never copy external_id: it must stay unique
      pnl_manual: t.pnl_manual,
      is_break_even: t.is_break_even,
      commission: t.commission,
      swap: t.swap,
      raw_symbol: t.raw_symbol,
    }));
    const { error } = await supabase.from("trades").insert(rows);
    if (error) return toast.error(error.message);
    setSel(new Set());
    invalidateData(qc, "trades", "progress");
    toast.success("Duplicated");
  }
  // Merging asks how the trades relate (one position built in parts, or the same trade logged twice): see MergeTradesDialog.
  function merge() {
    if (chosen.length < 2) return;
    if (chosen.some(isOpen)) return toast.error("Close open trades before merging them");
    setMergeOpen(true);
  }
  async function toggleFav(t: Trade) {
    await supabase.from("trades").update({ is_favorite: !t.is_favorite }).eq("id", t.id);
    qc.invalidateQueries({ queryKey: ["trades"] });
  }
  async function exportExcel() {
    const XLSX = await loadXlsx();
    const rows = sorted.map((t) => Object.fromEntries(cols.map((c) => [c.l, c.get(t) ?? ""])));
    const sheet = XLSX.utils.json_to_sheet(rows, { header: cols.map((c) => c.l) });
    sheet["!cols"] = cols.map((c) => ({ wpx: columnWidth(layout, c) }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Journal");
    XLSX.writeFile(book, `${journal?.name ?? "journal"}.xlsx`);
  }

  function autoSizeColumns() {
    const widths = Object.fromEntries(
      cols.map((c) => [
        c.k,
        suggestedColumnWidth(
          c.l,
          visible.map((t) => c.get(t)),
          76,
          240,
        ),
      ]),
    );
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
    const move = (event: PointerEvent) =>
      setLayout((current) => ({
        ...current,
        widths: {
          ...current.widths,
          [key]: Math.max(64, Math.min(360, startWidth + event.clientX - startX)),
        },
      }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function dropColumn(target: string) {
    const source = dragKey.current;
    if (!source) return;
    setLayout((current) => ({
      ...current,
      order: moveJournalColumn(current.order, source, target),
    }));
    dragKey.current = null;
  }

  const toolbar = (
    <JournalToolbar
      selected={sel.size}
      day={filters.day}
      query={qText}
      activeFilters={activeFilterCount(filters)}
      view={view}
      onAdd={() => drawer.open()}
      onImport={() => setImp(true)}
      onMerge={merge}
      onDuplicate={dup}
      onDelete={del}
      onClearDay={() => setFilters({ ...filters, day: undefined })}
      onQueryChange={(text) => {
        changeQuery(text);
        if (!text) setFilters({ ...filters, q: undefined });
      }}
      onClearFilters={() => {
        changeQuery("");
        setFilters({});
      }}
      onViewChange={changeView}
      onExport={exportExcel}
      onAutoSize={autoSizeColumns}
      onResetColumns={resetColumns}
    />
  );

  return (
    <div ref={fillRef} className={JOURNAL_BOX}>
      {toolbar}
      {trades.length === 0 ? (
        <div className="p-6">
          <Empty>No trades match. Add a trade or clear filters.</Empty>
        </div>
      ) : (
        <>
          {view === "table" ? (
            <div className="relative flex min-h-0 flex-1 border-t">
              <div className="slim-scroll min-h-0 min-w-0 flex-1 overflow-auto">
                <table
                  className="whitespace-nowrap text-[12px]"
                  style={{ tableLayout: "fixed", width: tableWidth(layout, cols) }}
                >
                  <colgroup>
                    <col style={{ width: 40 }} />
                    <col style={{ width: 28 }} />
                    <col style={{ width: 28 }} />
                    {cols.map((c) => (
                      <col key={c.k} style={{ width: columnWidth(layout, c) }} />
                    ))}
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className={JOURNAL_HEAD_ROW}>
                      <th className="w-10 p-3">
                        <Checkbox
                          checked={
                            trades.length > 0 && chosen.length === trades.length
                              ? true
                              : chosen.length > 0
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={(v) =>
                            setSel(v ? new Set(trades.map((t) => t.id)) : new Set())
                          }
                        />
                      </th>
                      <th className="w-8" />
                      <th className="w-8" />
                      {cols.map((c) => (
                        <th
                          key={c.k}
                          draggable
                          onDragStart={() => {
                            dragKey.current = c.k;
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => dropColumn(c.k)}
                          className={cn(
                            "relative cursor-grab select-none overflow-hidden px-3 text-[12px] font-semibold text-foreground",
                            alignRight(c.k) && "text-right",
                          )}
                          onClick={() =>
                            setSort({ k: c.k, asc: sort.k === c.k ? !sort.asc : false })
                          }
                        >
                          <span className="inline-flex items-center gap-1">
                            {c.l}
                            {sort.k === c.k &&
                              (sort.asc ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : (
                                <ArrowDown className="h-3 w-3" />
                              ))}
                          </span>
                          <span
                            role="separator"
                            aria-label={`Resize ${c.l}`}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              resizeColumn(c.k, e.clientX);
                            }}
                            className="absolute inset-y-1 right-0 w-1 cursor-col-resize border-r border-transparent hover:border-ring"
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => drawer.open(t, { list: sorted })}
                        className={cn(
                          JOURNAL_ROW,
                          "cursor-pointer tabular hover:brightness-[0.97]",
                          t.net_pnl > 0 ? "bg-row-win" : t.net_pnl < 0 ? "bg-row-loss" : "bg-card",
                        )}
                      >
                        <td className="px-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={sel.has(t.id)}
                            onCheckedChange={() =>
                              setSel((s) => {
                                const n = new Set(s);
                                if (n.has(t.id)) n.delete(t.id);
                                else n.add(t.id);
                                return n;
                              })
                            }
                          />
                        </td>
                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFav(t);
                          }}
                        >
                          <Star
                            className={cn(
                              "h-[17px] w-[17px] text-foreground",
                              t.is_favorite && "fill-foreground",
                            )}
                          />
                        </td>
                        <td className="px-1">
                          {shotIds.has(t.id) && (
                            <ImageIcon className="h-[17px] w-[17px] text-foreground" />
                          )}
                        </td>
                        {cols.map((c) => (
                          <td
                            key={c.k}
                            className={cn(
                              "overflow-hidden text-ellipsis px-3",
                              alignRight(c.k) && "text-right",
                              pnlText(t),
                            )}
                          >
                            {c.render ? c.render(t) : c.get(t)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                aria-label="Columns"
                aria-expanded={columnsOpen}
                onClick={() => setColumnsOpen((open) => !open)}
                className="flex w-7 shrink-0 items-center justify-center border-l bg-card text-xs font-semibold [writing-mode:vertical-rl] hover:bg-muted"
              >
                <Columns3 className="mb-1 h-3.5 w-3.5" />
                Columns
              </button>
              {columnsOpen && (
                <aside className="absolute bottom-0 right-7 top-0 z-20 w-60 border-l bg-card p-2 shadow-lg">
                  <input
                    autoFocus
                    value={colSearch}
                    onChange={(e) => setColSearch(e.target.value)}
                    placeholder="Search columns..."
                    className="mb-2 w-full rounded border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="h-[calc(100%-40px)] space-y-0.5 overflow-auto">
                    {layout.order
                      .map((key) => COLS.find((c) => c.k === key))
                      .filter((c): c is Col => c !== undefined)
                      .filter((c) => c.l.toLowerCase().includes(colSearch.toLowerCase()))
                      .map((c) => (
                        <div
                          key={c.k}
                          draggable
                          onDragStart={() => {
                            dragKey.current = c.k;
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => dropColumn(c.k)}
                          className="flex cursor-grab items-center gap-1 rounded px-1 py-1 text-sm hover:bg-muted"
                        >
                          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <Checkbox
                            checked={!hidden.has(c.k)}
                            onCheckedChange={() =>
                              setLayout((current) => ({
                                ...current,
                                hidden: hidden.has(c.k)
                                  ? current.hidden.filter((key) => key !== c.k)
                                  : [...current.hidden, c.k],
                              }))
                            }
                          />
                          <span className="truncate">{c.l}</span>
                        </div>
                      ))}
                  </div>
                </aside>
              )}
            </div>
          ) : (
            <div className="slim-scroll min-h-0 flex-1 overflow-auto border-t">
              {view === "cards" ? (
                <TradeCards
                  trades={visible}
                  shotsByTrade={shotsByTrade}
                  onOpen={(t) => drawer.open(t, { list: sorted })}
                  selected={sel}
                  onToggle={(id) =>
                    setSel((s) => {
                      const n = new Set(s);
                      if (n.has(id)) n.delete(id);
                      else n.add(id);
                      return n;
                    })
                  }
                />
              ) : (
                <ScreenshotGallery
                  trades={sorted}
                  shotsByTrade={shotsByTrade}
                  loading={shotsLoading}
                  onOpen={(t) => drawer.open(t, { list: sorted })}
                />
              )}
            </div>
          )}
          {view !== "gallery" && (
            <JournalFooter
              pageSize={pageSize}
              from={pg * pageSize + 1}
              to={Math.min(sorted.length, (pg + 1) * pageSize)}
              total={sorted.length}
              page={pg}
              pages={pages}
              onPageSize={(size) => {
                setPageSize(size);
                setPage(0);
              }}
              onPage={setPage}
            />
          )}
        </>
      )}
      <ImportDialog open={imp} onOpenChange={setImp} />
      <MergeTradesDialog
        trades={chosen}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        onMerged={() => setSel(new Set())}
      />
    </div>
  );
}

function useScreenshotTradeIds(journalId?: string) {
  const { data } = useQuery({
    queryKey: ["screenshot-ids", journalId],
    enabled: !!journalId,
    queryFn: async () => {
      const rows = await fetchAllRows<{ id: string; trade_id: string | null }>((from, to, first) =>
        supabase
          .from("trade_screenshots")
          .select("id,trade_id", countOption(first))
          .eq("journal_id", journalId!)
          .order("id")
          .range(from, to),
      );
      return new Set(rows.map((r) => r.trade_id as string));
    },
  });
  return data ?? new Set<string>();
}
