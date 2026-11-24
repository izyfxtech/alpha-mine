import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney, type Trade } from "@/lib/pnl/metrics";
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export function RecentTrades({ trades, currency }: { trades: Trade[]; currency: string }) {
  const recent = [...trades]
    .sort((a, b) => (b.exit_at ?? b.entry_at).localeCompare(a.exit_at ?? a.entry_at))
    .slice(0, 6);

  return (
    <Card className="overflow-hidden border-border/70 bg-card shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-2 p-4 pb-3">
        <div>
          <CardTitle className="text-sm">Recent trades</CardTitle>
          <CardDescription className="mt-1 text-xs">
            Latest activity in this journal
          </CardDescription>
        </div>
        <Link
          to="/journal"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-info hover:underline"
        >
          Open journal <ChevronRight className="size-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[470px] text-xs">
            <caption className="sr-only">
              The six most recent trades in the selected journal
            </caption>
            <thead className="border-y bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Close date
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Instrument
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Side
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Net P&amp;L
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.map((trade) => (
                <tr
                  key={trade.id}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/25"
                >
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                    {format(new Date(trade.exit_at ?? trade.entry_at), "MMM d, yyyy")}
                  </td>
                  <td className="px-3 py-3 font-medium text-foreground">{trade.instrument}</td>
                  <td className="px-3 py-3">
                    <span className={trade.direction === "long" ? "text-profit" : "text-loss"}>
                      {trade.direction === "long" ? "Long" : "Short"}
                    </span>
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums font-medium ${trade.net_pnl > 0 ? "text-profit" : trade.net_pnl < 0 ? "text-loss" : "text-muted-foreground"}`}
                  >
                    {fmtMoney(trade.net_pnl, currency)}
                  </td>
                </tr>
              ))}
              {!recent.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No trades in the current view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
