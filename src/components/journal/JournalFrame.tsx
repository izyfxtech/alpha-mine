import type { ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Download,
  Images,
  LayoutGrid,
  LayoutList,
  Merge,
  RefreshCw,
  Scaling,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type JournalView = "table" | "cards" | "gallery";

/** The Journal's box (it is sized to the window by `useFillViewport`). */
export const JOURNAL_BOX =
  "flex min-h-[320px] flex-col overflow-hidden rounded-lg bg-card shadow-[0_1px_5px_rgba(60,40,90,0.07)]";
export const JOURNAL_HEAD_ROW = "h-[42px] border-b text-left text-[12px] text-foreground";
export const JOURNAL_ROW = "h-[32px]";
export const JOURNAL_FOOTER =
  "flex shrink-0 items-center justify-end gap-4 border-t px-4 py-2.5 text-xs";

/** Buttons, search box and view switch above the table. Every handler is optional, so the skeleton can show it inert. */
export function JournalToolbar({
  selected,
  day,
  query,
  activeFilters,
  view,
  onAdd,
  onImport,
  onMerge,
  onDuplicate,
  onDelete,
  onClearDay,
  onQueryChange,
  onClearFilters,
  onViewChange,
  onExport,
  onAutoSize,
  onResetColumns,
}: {
  selected: number;
  day?: string;
  query: string;
  activeFilters: number;
  view: JournalView;
  onAdd?: () => void;
  onImport?: () => void;
  onMerge?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onClearDay?: () => void;
  onQueryChange?: (text: string) => void;
  onClearFilters?: () => void;
  onViewChange?: (view: JournalView) => void;
  onExport?: () => void;
  onAutoSize?: () => void;
  onResetColumns?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 px-[22px] pb-3 pt-[18px]">
      <Button variant="ink" size="sm" className="h-9 rounded-md px-4 text-sm" onClick={onAdd}>
        Add Trade
      </Button>
      <Button variant="ink" size="sm" className="h-9 rounded-md px-4 text-sm" onClick={onImport}>
        Import Trades
      </Button>
      <span title={selected < 2 ? "Select at least 2 trades to merge" : undefined}>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-md bg-card px-4 text-sm"
          disabled={selected < 2}
          onClick={onMerge}
        >
          <Merge className="h-4 w-4" />
          Merge
        </Button>
      </span>
      <span title={!selected ? "Select trades to duplicate" : undefined}>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-md bg-card px-4 text-sm"
          disabled={!selected}
          onClick={onDuplicate}
        >
          <Copy className="h-4 w-4" />
          Duplicate
        </Button>
      </span>
      <span title={!selected ? "Select trades to delete" : undefined}>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-md bg-card px-4 text-sm text-loss hover:bg-loss-soft hover:text-loss"
          disabled={!selected}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </span>
      {selected > 0 && <span className="text-xs text-muted-foreground">{selected} selected</span>}
      {day && (
        <Button variant="ghost" size="sm" onClick={onClearDay}>
          Day: {day} <X className="ml-1 h-3 w-3" />
        </Button>
      )}
      <div className="relative w-56">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange?.(e.target.value)}
          placeholder="Search trades, notes, rules…"
          aria-label="Search trades"
          className="h-9 pl-8"
        />
        {query && (
          <button
            aria-label="Clear search"
            className="absolute right-2 top-2.5 text-muted-foreground"
            onClick={() => onQueryChange?.("")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {activeFilters > 0 && (
        <Button variant="ghost" size="sm" className="h-9 text-sm" onClick={onClearFilters}>
          Filters active ({activeFilters}) <X className="ml-1 h-3 w-3" />
        </Button>
      )}
      <div className="flex-1" />
      <div
        role="group"
        aria-label="Journal view"
        className="inline-flex h-9 overflow-hidden rounded-md border"
      >
        {(
          [
            ["table", LayoutList, "Table"],
            ["cards", LayoutGrid, "Cards"],
            ["gallery", Images, "Gallery"],
          ] as const
        ).map(([k, Icon, label], i) => (
          <button
            key={k}
            type="button"
            aria-pressed={view === k}
            title={`${label} view`}
            onClick={() => onViewChange?.(k)}
            className={cn(
              "flex items-center gap-1.5 px-3 text-sm",
              i > 0 && "border-l",
              view === k ? "bg-ink text-ink-foreground" : "hover:bg-muted",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
      {view === "table" && (
        <>
          <Button
            variant="ghost"
            size="icon"
            title="Download to Excel"
            aria-label="Download to Excel"
            onClick={onExport}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Auto-size columns"
            aria-label="Auto-size columns"
            onClick={onAutoSize}
          >
            <Scaling className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Reset to default"
            aria-label="Reset to default"
            onClick={onResetColumns}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}

/** Page size, range and page buttons under the table. */
export function JournalFooter({
  pageSize,
  from,
  to,
  total,
  page,
  pages,
  onPageSize,
  onPage,
}: {
  pageSize: number;
  from: ReactNode;
  to: ReactNode;
  total: ReactNode;
  page: number;
  pages: number;
  onPageSize?: (size: number) => void;
  onPage?: (page: number) => void;
}) {
  return (
    <div className={JOURNAL_FOOTER}>
      <span className="flex items-center gap-1">
        Page Size:
        <select
          value={pageSize}
          onChange={(e) => onPageSize?.(Number(e.target.value))}
          className="rounded border bg-card px-1 py-0.5"
        >
          {[25, 50, 100, 250].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </span>
      <span>
        {from} to {to} of {total}
      </span>
      <span className="flex items-center gap-1">
        <button onClick={() => onPage?.(0)} disabled={page === 0}>
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button onClick={() => onPage?.(page - 1)} disabled={page === 0}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-1">
          Page {page + 1} of {pages}
        </span>
        <button onClick={() => onPage?.(page + 1)} disabled={page >= pages - 1}>
          <ChevronRight className="h-4 w-4" />
        </button>
        <button onClick={() => onPage?.(pages - 1)} disabled={page >= pages - 1}>
          <ChevronsRight className="h-4 w-4" />
        </button>
      </span>
    </div>
  );
}
