import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, ArrowDownRight, ArrowUpRight, ChevronRight, Info } from "lucide-react";
import { Empty } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEdgeCards } from "@/lib/pnl/use-edge-insights";
import type { EdgeCard, EdgeSection, Rating, TableSection, Trend } from "@/lib/pnl/edge-finder";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/edge-finder")({
  head: () => ({ meta: [{ title: "Edge Finder — AlphaMine" }, { name: "description", content: "Automatically finds the strong and weak parts of your trading." }] }),
  component: EdgeFinder,
});

const RATING_BG: Record<Rating, string> = { good: "bg-chart-1", ok: "bg-[color:var(--star)]", poor: "bg-chart-2" };
const RATING_LABEL: Record<Rating, string> = { good: "Strong", ok: "Average", poor: "Needs attention" };

function TrendPill({ t }: { t: Trend }) {
  const Icon = t.dir === "up" ? ArrowUpRight : t.dir === "down" ? ArrowDownRight : ArrowRight;
  return <span className="inline-flex items-center gap-1 rounded-full bg-chip px-2.5 py-0.5 text-xs text-t3"><Icon className="h-3 w-3" aria-hidden />{t.label}<span className="sr-only">{t.dir === "up" ? " up" : t.dir === "down" ? " down" : " no change"} compared with 30 days ago</span></span>;
}

/** Six-segment strength bar: green, yellow or red depending on the rating. */
function Segments({ score, rating }: { score: number; rating: Rating }) {
  return (
    <div className="flex gap-1" role="img" aria-label={`${RATING_LABEL[rating]}, ${score} of 6`}>
      {Array.from({ length: 6 }, (_, i) => <span key={i} className={cn("h-[5px] w-[18px] rounded-full", i < score ? RATING_BG[rating] : "bg-muted")} />)}
    </div>
  );
}

function SectionView({ s, trend }: { s: EdgeSection; trend?: Trend }) {
  return (
    <div className="relative pl-5">
      <span className={cn("absolute bottom-0 left-0 top-1 w-[3px] rounded-full", RATING_BG[s.rating])} aria-hidden />
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">{s.title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-t3">{s.text}</p>
          {s.kind === "metric" && s.note && <p className={cn("mt-1.5 text-[12px]", s.id === "rr" || s.id === "winrate" ? "font-medium text-profit" : "text-t4")}>{s.note}</p>}
        </div>
        {s.kind === "metric" && (
          <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5 text-right">
            <span className="text-[17px] font-medium tabular">{s.value}</span>
            {trend && <TrendPill t={trend} />}
          </div>
        )}
      </div>
      {s.kind === "table" && <DataTable t={s} />}
    </div>
  );
}

function DataTable({ t }: { t: TableSection }) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border">
      <table className="w-full text-[13px]">
        <thead><tr className="text-left">{t.columns.map((c, i) => <th key={c} className={cn("px-5 py-3 font-semibold", i === t.columns.length - 1 && "text-right")}>{c}</th>)}</tr></thead>
        <tbody>
          {t.rows.map((r, ri) => (
            <tr key={ri} className="border-t">
              {r.cells.map((c, i) => (
                <td key={i} className={cn("px-5 py-3 tabular", i === r.cells.length - 1 && "text-right font-medium", i > 0 && i === r.cells.length - 1 && (r.tone === "neg" ? "text-loss" : r.tone === "pos" ? "text-profit" : ""), i > 0 && i < r.cells.length - 1 && r.tone === "neg" && t.id === "mistakes" && "text-loss")}>
                  {c}
                  {i === r.cells.length - 1 && r.sub && <span className={cn("block text-[12px]", r.tone === "neg" ? "text-loss" : "text-profit")}>{r.sub}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EdgeFinder() {
  const { cards, ignored, ignore, restoreAll } = useEdgeCards();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = cards.find((c) => c.id === openId);
  const list = cards.filter((c) => !ignored.includes(c.id));
  if (!cards.length) return <Empty>Edge Finder needs a journal with trades.</Empty>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[13px] text-t4">
          Based on all your trades, ignoring the current filters
          <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild><button type="button" aria-label="How Edge Finder works"><Info className="h-4 w-4" /></button></TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">Insights are recalculated from your trades every time you open this page. Trends compare each card with the same analysis as of 30 days before your latest trade.</TooltipContent></Tooltip></TooltipProvider>
        </p>
        {ignored.length > 0 && <Button variant="ghost" size="sm" onClick={restoreAll}>Show {ignored.length} ignored</Button>}
      </div>
      <div className="space-y-4">
        {list.map((c) => <SummaryRow key={c.id} c={c} onOpen={() => setOpenId(c.id)} />)}
        {!list.length && <Empty>All insights are ignored.</Empty>}
      </div>
      <Sheet open={!!open} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
          {open && (
            <>
              <div className="px-7 pb-2 pt-6"><SheetTitle className="text-[18px] font-semibold">{open.title}</SheetTitle><SheetDescription className="sr-only">Details behind the {open.title} insight.</SheetDescription></div>
              <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-7 pb-6 pt-6">
                {open.sections.map((s, i) => <SectionView key={s.id} s={s} trend={i === 0 ? open.trend : undefined} />)}
              </div>
              <div className="flex items-center justify-between border-t px-7 py-4">
                <Button variant="ink" onClick={() => setOpenId(null)}>Back to Summary</Button>
                <Button variant="outline" onClick={() => { ignore(open.id); setOpenId(null); }}>Ignore</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryRow({ c, onOpen }: { c: EdgeCard; onOpen: () => void }) {
  if (!c.ready) {
    return (
      <div className="rounded-lg bg-card px-[30px] py-5 opacity-70 shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
        <h2 className="text-[17px] font-semibold">{c.title}</h2>
        <p className="mt-1 text-[13px] text-t3">{c.missing}</p>
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-8 rounded-lg bg-card px-[30px] py-5 text-left shadow-[0_1px_5px_rgba(60,40,90,0.07)] transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <h2 className="text-[17px] font-semibold">{c.title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-t3">{c.text}</p>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-2.5"><Segments score={c.score} rating={c.rating} />{c.trend && <TrendPill t={c.trend} />}</div>
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
    </button>
  );
}
