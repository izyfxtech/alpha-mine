import { byEntry } from "@/lib/pnl/sort";
import { compareKeys, pushTo } from "@/lib/group";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Fragment, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { plannedRRR, useTrades } from "@/lib/journal/journal-context";
import { Checkbox } from "@/components/ui/checkbox";
import { computeStats, fmtMoney, isLoss, isWin, type Trade } from "@/lib/pnl/metrics";
import { KpiCards } from "@/components/analytics/KpiCards";
import { PageHeader } from "@/components/kit";
import { cn } from "@/lib/utils";
import { ColumnsTab, GroupTableHead } from "@/components/analytics/AnalyticsTable";
import { AnalyticsSidebar } from "@/components/analytics/AnalyticsSidebar";
import {
  COLS,
  ANALYTICS_ROW_CLASS,
  DEFAULT_VISIBLE,
  type Crit,
  useCriteria,
} from "@/components/analytics/analytics-config";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Trade Breakdown — EdgeWhiz" },
      {
        name: "description",
        content: "Group and drill into your trades by setup, direction, outcome and more.",
      },
      { property: "og:title", content: "Trade Breakdown — EdgeWhiz" },
      {
        property: "og:description",
        content: "Group and drill into your trades by setup, direction, outcome and more.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/reports", search: { view: "breakdown" } as never });
  },
  component: () => null,
});

/** Favourable / adverse excursion of a trade in price points, and as % of the distance to TP / SL. */
function excursion(t: Trade) {
  if (t.high_price == null || t.low_price == null) return null;
  const long = t.direction === "long";
  const hi = Number(t.high_price),
    lo = Number(t.low_price);
  const mfe = Math.max(0, long ? hi - t.entry_price : t.entry_price - lo);
  const mae = Math.max(0, long ? t.entry_price - lo : hi - t.entry_price);
  const tp = t.take_profit != null ? Math.abs(Number(t.take_profit) - t.entry_price) : 0;
  const sl = t.stop_loss != null ? Math.abs(t.entry_price - Number(t.stop_loss)) : 0;
  return { mfe, mae, up: tp ? (mfe / tp) * 100 : null, dn: sl ? (mae / sl) * 100 : null };
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** `base` is the journal's invested capital (start + deposits), so Return (%) is the same ROI every other page shows. */
function rowStats(ts: Trade[], base: number) {
  const n = ts.length;
  const sum = ts.reduce((a, t) => a + t.net_pnl, 0);
  const gw = ts.filter(isWin).reduce((a, t) => a + t.net_pnl, 0);
  const gl = Math.abs(ts.filter(isLoss).reduce((a, t) => a + t.net_pnl, 0));
  const rs = ts.map((t) => t.r).filter((x): x is number => x != null);
  let cw = 0,
    cl = 0,
    mw = 0,
    ml = 0;
  [...ts].sort(byEntry).forEach((t) => {
    if (isWin(t)) {
      cw++;
      cl = 0;
    } else if (isLoss(t)) {
      cl++;
      cw = 0;
    } else {
      cw = 0;
      cl = 0;
    }
    mw = Math.max(mw, cw);
    ml = Math.max(ml, cl);
  });
  const ex = ts
    .map(excursion)
    .filter((x): x is NonNullable<ReturnType<typeof excursion>> => x != null);
  const f = (v: number | null) =>
    v == null
      ? ""
      : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Quantity and excursion are in each instrument's own units (lots, shares, price points), so an average across instruments means nothing: leave it blank.
  const mixed = new Set(ts.map((t) => t.instrument)).size > 1;
  const cells: Record<string, string> = {
    n: String(n),
    qty: mixed ? "" : f(ts.reduce((a, t) => a + t.quantity, 0) / (n || 1)),
    wr: f(n ? (ts.filter(isWin).length / n) * 100 : 0),
    avgPnl: f(sum / (n || 1)),
    sum: f(sum),
    pf: gl ? f(gw / gl) : "",
    avgR: f(mean(rs)),
    sumR: rs.length ? f(rs.reduce((a, b) => a + b, 0)) : "",
    planR: f(mean(ts.map(plannedRRR).filter((x): x is number => x != null))),
    mw: String(mw),
    ml: String(ml),
    dd: f(mean(ex.map((x) => x.dn).filter((x): x is number => x != null))),
    up: f(mean(ex.map((x) => x.up).filter((x): x is number => x != null))),
    mae: mixed ? "" : f(mean(ex.map((x) => x.mae))),
    mfe: mixed ? "" : f(mean(ex.map((x) => x.mfe))),
    fees: f(ts.reduce((a, t) => a + t.fees, 0)),
    ret: f(base ? (sum / base) * 100 : 0),
    avgRet: f(mean(ts.map((t) => t.retPct))),
  };
  return { sum, cells };
}

function group(ts: Trade[], c: Crit) {
  const m = new Map<string, Trade[]>();
  ts.forEach((t) => c.get(t).forEach((k) => pushTo(m, k, t)));
  return [...m.entries()].sort((a, b) => compareKeys(a[0], b[0]));
}

export function TradeBreakdown({ embedded = false }: { embedded?: boolean }) {
  const { trades, journal, flows } = useTrades();
  const invested =
    (journal?.starting_balance ?? 0) + flows.reduce((a, f) => a + Number(f.amount), 0);
  const summary = useMemo(
    () => computeStats(trades, journal?.starting_balance ?? 0, flows),
    [trades, journal, flows],
  );
  const currency = journal?.currency ?? "USD";
  const [order, setOrder] = useState<string[]>(["setup"]);
  const [open, setOpen] = useState<Set<string>>(new Set(["Overall"]));
  const [visible, setVisible] = useState<string[]>(DEFAULT_VISIBLE);
  const [colsOpen, setColsOpen] = useState(false);
  const dragKey = useRef<string | null>(null);

  const criteria = useCriteria(journal?.id);
  const crits = useMemo(
    () => order.map((k) => criteria.find((c) => c.key === k)).filter((c): c is Crit => !!c),
    [order, criteria],
  );
  const toggle = (p: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  const reorder = (target: string) => {
    const src = dragKey.current;
    dragKey.current = null;
    if (!src || src === target) return;
    setOrder((o) => {
      const n = o.filter((k) => k !== src);
      n.splice(n.indexOf(target), 0, src);
      return n;
    });
    setOpen(new Set(["Overall"]));
  };

  const move = (key: string, by: -1 | 1) => {
    setOrder((o) => {
      const i = o.indexOf(key),
        j = i + by;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
    setOpen(new Set(["Overall"]));
  };

  const rows = useMemo(() => {
    const out: { path: string; label: string; depth: number; ts: Trade[]; expandable: boolean }[] =
      [];
    const walk = (ts: Trade[], depth: number, path: string) => {
      if (depth >= crits.length || !open.has(path)) return;
      group(ts, crits[depth]!).forEach(([k, sub]) => {
        const p = `${path}/${k}`;
        out.push({
          path: p,
          label: k,
          depth: depth + 1,
          ts: sub,
          expandable: depth + 1 < crits.length,
        });
        walk(sub, depth + 1, p);
      });
    };
    out.push({
      path: "Overall",
      label: "Overall",
      depth: 0,
      ts: trades,
      expandable: crits.length > 0,
    });
    walk(trades, 0, "Overall");
    return out;
  }, [trades, crits, open]);

  const shown = COLS.filter((c) => visible.includes(c.k));

  return (
    <div className="min-w-0 space-y-4 pb-4">
      {!embedded && (
        <PageHeader
          title="Trade breakdown"
          subtitle={`Grouped results for ${journal?.name ?? "your journal"}`}
        />
      )}
      {!embedded && (
        <KpiCards
          trades={trades}
          s={summary}
          fmt={(value) => fmtMoney(value, currency)}
          avgWinLabel={fmtMoney(summary.avgWin, currency)}
          avgLossLabel={fmtMoney(summary.avgLoss, currency)}
        />
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <AnalyticsSidebar
          crits={crits}
          available={criteria.filter((c) => !order.includes(c.key))}
          onDragStart={(key) => {
            dragKey.current = key;
          }}
          onDrop={reorder}
          onMove={move}
          onRemove={(key) => {
            setOrder((o) => o.filter((k) => k !== key));
            setOpen(new Set(["Overall"]));
          }}
          onAdd={(key) => {
            setOrder((o) => [...o, key]);
            setOpen(new Set(["Overall"]));
          }}
        />

        <section className="relative min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card p-3">
          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="w-full min-w-[1100px] text-xs tabular">
              <GroupTableHead columns={shown} />
              <tbody>
                {rows.map((r) => {
                  const st = rowStats(r.ts, invested);
                  const tone = st.sum > 0 ? "text-profit" : st.sum < 0 ? "text-loss" : "";
                  const bg =
                    st.sum > 0 ? "bg-row-win" : st.sum < 0 ? "bg-row-loss" : "bg-background";
                  return (
                    <Fragment key={r.path}>
                      <tr className={cn(ANALYTICS_ROW_CLASS, bg, tone)}>
                        <td
                          className={cn("sticky left-0 z-10 whitespace-nowrap border-r px-3", bg)}
                          style={{ paddingLeft: 12 + r.depth * 22 }}
                        >
                          <span className="flex items-center gap-1">
                            {r.expandable ? (
                              <button
                                onClick={() => toggle(r.path)}
                                aria-label={open.has(r.path) ? "Collapse" : "Expand"}
                              >
                                {open.has(r.path) ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : (
                              <span className="w-3.5" />
                            )}
                            {r.label}
                          </span>
                        </td>
                        {shown.map((c) => (
                          <td key={c.k} className="px-3 text-right">
                            {st.cells[c.k]}
                          </td>
                        ))}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ColumnsTab expanded={colsOpen} onClick={() => setColsOpen((o) => !o)} />
          {colsOpen && (
            <aside className="absolute bottom-0 right-7 top-0 z-20 w-56 overflow-auto bg-card p-2 shadow-lg">
              {COLS.map((c) => (
                <label
                  key={c.k}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-xs hover:bg-muted"
                >
                  <Checkbox
                    checked={visible.includes(c.k)}
                    onCheckedChange={() =>
                      setVisible((v) =>
                        v.includes(c.k)
                          ? v.filter((k) => k !== c.k)
                          : COLS.map((x) => x.k).filter((k) => k === c.k || v.includes(k)),
                      )
                    }
                  />
                  {c.l}
                </label>
              ))}
            </aside>
          )}
        </section>
      </div>
    </div>
  );
}
