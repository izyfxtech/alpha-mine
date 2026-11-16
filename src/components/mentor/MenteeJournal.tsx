import { useMemo, useState } from "react";
import { startOfMonth } from "date-fns";
import { MessageSquare } from "lucide-react";
import { ProfitCalendar } from "@/components/analytics/ProfitCalendar";
import { KpiCards } from "@/components/analytics/KpiCards";
import { EquityChart } from "@/components/charts";
import { CalendarToolbar } from "@/components/home/CalendarToolbar";
import { Empty, Panel, cumulative } from "@/components/kit";
import { Lightbox } from "@/components/journal/Lightbox";
import { useScreenshots } from "@/components/journal/Screenshots";
import { FeedbackThread } from "@/components/mentor/FeedbackThread";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useTrades } from "@/lib/journal/journal-context";
import { useFeedbackSummary } from "@/lib/mentor/hooks";
import { computeStats, fmtHold, fmtMoney, fmtNum, fmtPct, type Trade } from "@/lib/pnl/metrics";
import { localDateTime } from "@/lib/time/local-time";
import { cn } from "@/lib/utils";

/** The headline numbers, equity curve and calendar of a student's journal, plus a place for feedback on the journal as a whole. */
export function MenteeOverview() {
  const { trades, journal, flows } = useTrades();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const cur = journal?.currency ?? "USD";
  const s = useMemo(
    () => computeStats(trades, journal?.starting_balance ?? 0, flows),
    [trades, journal, flows],
  );
  const curve = useMemo(() => cumulative(trades), [trades]);
  if (!journal) return null;
  if (!trades.length) return <Empty>This journal has no closed trades yet.</Empty>;
  return (
    <div className="space-y-[30px]">
      <KpiCards
        trades={trades}
        s={s}
        fmt={(v) => fmtMoney(v, cur)}
        avgWinLabel={fmtMoney(s.avgWin, cur)}
        avgLossLabel={fmtMoney(s.avgLoss, cur)}
      />
      <div className="grid gap-[30px] lg:grid-cols-2">
        <Panel title="Equity Graph">
          <EquityChart data={curve} height={300} compact fmt={(n) => fmtMoney(n, cur)} />
        </Panel>
        <Panel
          title="Profit Calendar"
          action={<CalendarToolbar month={month} onMonthChange={setMonth} onSave={() => {}} />}
        >
          <ProfitCalendar trades={trades} month={month} fmt={(pnl) => fmtMoney(pnl, cur)} />
        </Panel>
      </div>
      <Panel title="Feedback on this journal">
        <FeedbackThread journalId={journal.id} targetType="journal" targetId={null} />
      </Panel>
    </div>
  );
}

const PAGE = 50;

/** The student's closed trades, newest first. Opening one shows the review panel. */
export function MenteeTrades({ onOpen }: { onOpen: (tradeId: string) => void }) {
  const { trades, journal } = useTrades({ unfiltered: true });
  const { data: summary } = useFeedbackSummary(journal?.id);
  const [shown, setShown] = useState(PAGE);
  const cur = journal?.currency ?? "USD";
  const sorted = useMemo(
    () => [...trades].sort((a, b) => b.entry_at.localeCompare(a.entry_at)),
    [trades],
  );
  if (!sorted.length) return <Empty>This journal has no closed trades yet.</Empty>;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg bg-card shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Entry</th>
              <th className="px-3 py-2.5 font-medium">Instrument</th>
              <th className="px-3 py-2.5 font-medium">Side</th>
              <th className="px-3 py-2.5 font-medium">Setup</th>
              <th className="px-3 py-2.5 text-right font-medium">R</th>
              <th className="px-3 py-2.5 text-right font-medium">Net P&L</th>
              <th className="px-4 py-2.5 text-right font-medium">Feedback</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, shown).map((t) => {
              const fb = summary?.get(t.id);
              return (
                <tr
                  key={t.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Review ${t.instrument} ${t.direction} from ${localDateTime(t.entry_at)}`}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  onClick={() => onOpen(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(t.id);
                    }
                  }}
                >
                  <td className="whitespace-nowrap px-4 py-2.5">{localDateTime(t.entry_at)}</td>
                  <td className="px-3 py-2.5 font-medium">{t.instrument}</td>
                  <td className="px-3 py-2.5 capitalize">{t.direction}</td>
                  <td className="px-3 py-2.5">{t.setup}</td>
                  <td className="tabular px-3 py-2.5 text-right">
                    {t.r == null ? "–" : `${fmtNum(t.r)}R`}
                  </td>
                  <td
                    className={cn(
                      "tabular px-3 py-2.5 text-right",
                      t.net_pnl > 0 ? "text-profit" : t.net_pnl < 0 ? "text-loss" : "",
                    )}
                  >
                    {fmtMoney(t.net_pnl, cur)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {fb ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs",
                          fb.open ? "font-semibold" : "text-muted-foreground",
                        )}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {fb.open ? `${fb.open} open` : "resolved"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown < sorted.length && (
        <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({sorted.length - shown} left)
        </Button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className="tabular text-sm">{children}</p>
    </div>
  );
}

function TradeFacts({ t, currency }: { t: Trade; currency: string }) {
  const price = (v: number | null | undefined) => (v == null ? "–" : String(v));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Field label="Net P&L">{fmtMoney(t.net_pnl, currency)}</Field>
        <Field label="R multiple">{t.r == null ? "–" : `${fmtNum(t.r)}R`}</Field>
        <Field label="Return">{t.accountSize ? fmtPct(t.retPct) : "–"}</Field>
        <Field label="Entry">{price(t.entry_price)}</Field>
        <Field label="Exit">{price(t.exit_price)}</Field>
        <Field label="Held">{t.holdMinutes == null ? "–" : fmtHold(t.holdMinutes)}</Field>
        <Field label="Stop">{price(t.initial_stop ?? t.stop_loss)}</Field>
        <Field label="Target">{price(t.take_profit)}</Field>
        <Field label="Setup">{t.setup}</Field>
      </div>
      {t.comments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {t.comments.map((c) => (
            <span
              key={c.id}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs",
                c.sentiment === "positive" && "border-profit/40 text-profit",
                c.sentiment === "negative" && "border-loss/40 text-loss",
              )}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}
      {t.notes && (
        <div>
          <p className="text-[11px] uppercase text-muted-foreground">Student's notes</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{t.notes}</p>
        </div>
      )}
    </div>
  );
}

function Shots({
  journalId,
  tradeId,
  title,
}: {
  journalId: string;
  tradeId: string;
  title: string;
}) {
  const { data: shots = [] } = useScreenshots(journalId, tradeId);
  const [open, setOpen] = useState<number | null>(null);
  if (!shots.length) return null;
  return (
    <div>
      <p className="mb-2 text-[11px] uppercase text-muted-foreground">Screenshots</p>
      <div className="grid grid-cols-3 gap-2">
        {shots.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className="overflow-hidden rounded-md border bg-muted"
            aria-label={`Open screenshot ${i + 1}`}
            onClick={() => setOpen(i)}
          >
            {s.thumb ? (
              <img
                src={s.thumb}
                alt=""
                loading="lazy"
                className="aspect-video w-full object-cover"
              />
            ) : null}
          </button>
        ))}
      </div>
      {open != null && (
        <Lightbox
          items={shots.map((s) => ({ url: s.url, title, subtitle: s.caption ?? undefined }))}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** One student trade: the facts, the screenshots the student shared, and the feedback thread. */
export function TradeReview({
  tradeId,
  onClose,
}: {
  tradeId: string | undefined;
  onClose: () => void;
}) {
  const { all, journal } = useTrades({ unfiltered: true, includeOpen: true });
  const trade = tradeId ? all.find((t) => t.id === tradeId) : undefined;
  return (
    <Sheet open={!!tradeId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="space-y-0 border-b p-4 pr-12">
          <SheetTitle>
            {trade ? `${trade.instrument} ${trade.direction}` : "Trade"}
            {trade && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {localDateTime(trade.entry_at)}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {journal && trade ? (
            <>
              <TradeFacts t={trade} currency={journal.currency} />
              <Shots
                journalId={journal.id}
                tradeId={trade.id}
                title={`${trade.instrument} ${trade.direction}`}
              />
              <div>
                <p className="mb-2 text-[11px] uppercase text-muted-foreground">Feedback</p>
                <FeedbackThread journalId={journal.id} targetType="trade" targetId={trade.id} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">This trade is not available.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
