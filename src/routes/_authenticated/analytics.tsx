import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Columns3, GripVertical, Minus, Plus } from "lucide-react";
import { plannedRRR, useLookups, useTrades } from "@/lib/journal-context";
import { Checkbox } from "@/components/ui/checkbox";
import { isLoss, isWin, type Trade } from "@/lib/metrics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Trade Analytics — AlphaMine" }, { name: "description", content: "Group and drill into your trades by setup, direction, outcome and more." }, { property: "og:title", content: "Trade Analytics — AlphaMine" }, { property: "og:description", content: "Group and drill into your trades by setup, direction, outcome and more." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Analytics,
});

type Crit = { key: string; label: string; get: (t: Trade) => string[] };
const comments = (phase: string) => (t: Trade) => { const c = t.comments.filter((x) => x.phase === phase).map((x) => x.label); return c.length ? c : ["No comment"]; };
const CRITERIA: Crit[] = [
  { key: "setup", label: "Trade Setups", get: (t) => [t.setup] },
  { key: "outcome", label: "Outcome", get: (t) => [isWin(t) ? "Winner" : isLoss(t) ? "Loser" : "Break even"] },
  { key: "direction", label: "Direction", get: (t) => [t.direction === "long" ? "Long" : "Short"] },
  { key: "entry", label: "Entry Comment", get: comments("entry") },
  { key: "management", label: "Management Comment", get: comments("management") },
  { key: "exit", label: "Exit Comment", get: comments("exit") },
  { key: "instrument", label: "Trade Instruments", get: (t) => [t.instrument] },
  { key: "weekday", label: "Weekday", get: (t) => [new Date(t.entry_at).toLocaleDateString("en-US", { weekday: "long" })] },
  { key: "month", label: "Month", get: (t) => [t.entry_at.slice(0, 7)] },
  { key: "type", label: "Trade Type", get: (t) => [t.trade_type || "—"] },
];

/** Favourable / adverse excursion of a trade in price points, and as % of the distance to TP / SL. */
function excursion(t: Trade) {
  if (t.high_price == null || t.low_price == null) return null;
  const long = t.direction === "long";
  const hi = Number(t.high_price), lo = Number(t.low_price);
  const mfe = Math.max(0, long ? hi - t.entry_price : t.entry_price - lo);
  const mae = Math.max(0, long ? t.entry_price - lo : hi - t.entry_price);
  const tp = t.take_profit != null ? Math.abs(Number(t.take_profit) - t.entry_price) : 0;
  const sl = t.stop_loss != null ? Math.abs(t.entry_price - Number(t.stop_loss)) : 0;
  return { mfe, mae, up: tp ? (mfe / tp) * 100 : null, dn: sl ? (mae / sl) * 100 : null };
}

const COLS: { k: string; l: string }[] = [
  { k: "n", l: "Amount" }, { k: "qty", l: "Avg. Qty." }, { k: "wr", l: "Winrate (%)" }, { k: "avgPnl", l: "Avg. P&L ($)" },
  { k: "sum", l: "Sum. Gain ($)" }, { k: "pf", l: "Profit Factor" }, { k: "avgR", l: "Avg. R-Multiple" }, { k: "sumR", l: "Sum. R-Multiple" },
  { k: "planR", l: "Avg. Planned R" }, { k: "mw", l: "Max. Cons. Winners" }, { k: "ml", l: "Max. Cons. Losers" },
  { k: "dd", l: "Avg. Drawdown (%)" }, { k: "up", l: "Avg. Updraw (%)" }, { k: "mae", l: "Avg. MAE" }, { k: "mfe", l: "Avg. MFE" },
  { k: "fees", l: "Fees ($)" }, { k: "ret", l: "Return (%)" }, { k: "avgRet", l: "Avg. Return (%)" },
];
const DEFAULT_VISIBLE = COLS.map((c) => c.k);

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function rowStats(ts: Trade[]) {
  const n = ts.length;
  const sum = ts.reduce((a, t) => a + t.net_pnl, 0);
  const gw = ts.filter(isWin).reduce((a, t) => a + t.net_pnl, 0);
  const gl = Math.abs(ts.filter(isLoss).reduce((a, t) => a + t.net_pnl, 0));
  const rs = ts.map((t) => t.r).filter((x): x is number => x != null);
  let cw = 0, cl = 0, mw = 0, ml = 0;
  [...ts].sort((a, b) => a.entry_at.localeCompare(b.entry_at)).forEach((t) => {
    if (isWin(t)) { cw++; cl = 0; } else if (isLoss(t)) { cl++; cw = 0; } else { cw = 0; cl = 0; }
    mw = Math.max(mw, cw); ml = Math.max(ml, cl);
  });
  const ex = ts.map(excursion).filter((x): x is NonNullable<ReturnType<typeof excursion>> => x != null);
  const f = (v: number | null) => (v == null ? "" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const cells: Record<string, string> = {
    n: String(n), qty: f(ts.reduce((a, t) => a + t.quantity, 0) / (n || 1)), wr: f(n ? (ts.filter(isWin).length / n) * 100 : 0),
    avgPnl: f(sum / (n || 1)), sum: f(sum), pf: gl ? f(gw / gl) : "", avgR: f(mean(rs)), sumR: rs.length ? f(rs.reduce((a, b) => a + b, 0)) : "",
    planR: f(mean(ts.map(plannedRRR).filter((x): x is number => x != null))), mw: String(mw), ml: String(ml),
    dd: f(mean(ex.map((x) => x.dn).filter((x): x is number => x != null))), up: f(mean(ex.map((x) => x.up).filter((x): x is number => x != null))),
    mae: f(mean(ex.map((x) => x.mae))), mfe: f(mean(ex.map((x) => x.mfe))),
    fees: f(ts.reduce((a, t) => a + t.fees, 0)), ret: f(ts.reduce((a, t) => a + t.retPct, 0)), avgRet: f(mean(ts.map((t) => t.retPct))),
  };
  return { sum, cells };
}

function group(ts: Trade[], c: Crit) {
  const m = new Map<string, Trade[]>();
  ts.forEach((t) => c.get(t).forEach((k) => m.set(k, [...(m.get(k) ?? []), t])));
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function Analytics() {
  const { trades, journal } = useTrades();
  const { data: lookups } = useLookups(journal?.id);
  const [order, setOrder] = useState<string[]>(["setup"]);
  const [open, setOpen] = useState<Set<string>>(new Set(["Overall"]));
  const [visible, setVisible] = useState<string[]>(DEFAULT_VISIBLE);
  const [colsOpen, setColsOpen] = useState(false);
  const dragKey = useRef<string | null>(null);

  // built-in criteria + one per custom statistic category, in the order set up in Settings
  const criteria = useMemo<Crit[]>(() => {
    const optById = new Map((lookups?.statOptions ?? []).map((o) => [o.id, o]));
    const custom = (lookups?.statCategories ?? []).map((c): Crit => ({
      key: `cs:${c.id}`, label: c.name,
      get: (t) => { const v = t.customStats.map((id) => optById.get(id)).filter((o) => o?.category_id === c.id).map((o) => o!.label); return v.length ? v : ["Not set"]; },
    }));
    return [...CRITERIA, ...custom];
  }, [lookups]);
  const crits = useMemo(() => order.map((k) => criteria.find((c) => c.key === k)).filter((c): c is Crit => !!c), [order, criteria]);
  const toggle = (p: string) => setOpen((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const reorder = (target: string) => {
    const src = dragKey.current; dragKey.current = null;
    if (!src || src === target) return;
    setOrder((o) => { const n = o.filter((k) => k !== src); n.splice(n.indexOf(target), 0, src); return n; });
    setOpen(new Set(["Overall"]));
  };

  const rows = useMemo(() => {
    const out: { path: string; label: string; depth: number; ts: Trade[]; expandable: boolean }[] = [];
    const walk = (ts: Trade[], depth: number, path: string) => {
      if (depth >= crits.length || !open.has(path)) return;
      group(ts, crits[depth]!).forEach(([k, sub]) => {
        const p = `${path}/${k}`;
        out.push({ path: p, label: k, depth: depth + 1, ts: sub, expandable: depth + 1 < crits.length });
        walk(sub, depth + 1, p);
      });
    };
    out.push({ path: "Overall", label: "Overall", depth: 0, ts: trades, expandable: crits.length > 0 });
    walk(trades, 0, "Overall");
    return out;
  }, [trades, crits, open]);

  const shown = COLS.filter((c) => visible.includes(c.k));
  const rowCls = "h-[30px] text-[11px]";
  const item = "flex h-[40px] items-center justify-between border-b px-1 text-[11px] last:border-0";

  return (
    <div className="grid grid-cols-[240px_1fr] gap-[22px]">
      <div className="space-y-[22px]">
        <section className="min-h-[200px] rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
          <h3 className="mb-3 text-[13px] font-semibold">Ordering</h3>
          {crits.map((c) => (
            <div key={c.key} draggable onDragStart={() => { dragKey.current = c.key; }} onDragOver={(e) => e.preventDefault()} onDrop={() => reorder(c.key)} className={cn(item, "cursor-grab")}>
              <span className="flex items-center gap-1.5"><GripVertical className="h-3.5 w-3.5 text-muted-foreground" />{c.label}</span>
              <button aria-label={`Remove ${c.label}`} onClick={() => { setOrder((o) => o.filter((k) => k !== c.key)); setOpen(new Set(["Overall"])); }}><Minus className="h-4 w-4" /></button>
            </div>
          ))}
          {!crits.length && <p className="text-[11px] text-muted-foreground">Add a criterion below to group trades.</p>}
        </section>
        <section className="rounded-lg bg-card p-[22px] shadow-[0_1px_5px_rgba(60,40,90,0.07)]">
          <h3 className="mb-3 text-[13px] font-semibold">Add Ordering Criteria</h3>
          {criteria.filter((c) => !order.includes(c.key)).map((c) => (
            <div key={c.key} className={item}>
              {c.label}
              <button aria-label={`Add ${c.label}`} onClick={() => { setOrder((o) => [...o, c.key]); setOpen(new Set(["Overall"])); }}><Plus className="h-4 w-4" /></button>
            </div>
          ))}
        </section>
      </div>

      <section className="relative min-w-0 pr-7">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[11px] tabular">
            <thead>
              <tr className="h-[34px]">
                <th className="sticky left-0 z-10 w-[230px] border-r bg-background px-3 text-left font-semibold">Group</th>
                {shown.map((c) => <th key={c.k} className="whitespace-nowrap px-3 text-right font-semibold">{c.l}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = rowStats(r.ts);
                const tone = st.sum > 0 ? "text-profit" : st.sum < 0 ? "text-loss" : "";
                const bg = st.sum > 0 ? "bg-row-win" : st.sum < 0 ? "bg-row-loss" : "bg-background";
                return (
                  <Fragment key={r.path}>
                    <tr className={cn(rowCls, bg, tone)}>
                      <td className={cn("sticky left-0 z-10 whitespace-nowrap border-r px-3", bg)} style={{ paddingLeft: 12 + r.depth * 22 }}>
                        <span className="flex items-center gap-1">
                          {r.expandable ? (
                            <button onClick={() => toggle(r.path)} aria-label={open.has(r.path) ? "Collapse" : "Expand"}>{open.has(r.path) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>
                          ) : <span className="w-3.5" />}
                          {r.label}
                        </span>
                      </td>
                      {shown.map((c) => <td key={c.k} className="px-3 text-right">{st.cells[c.k]}</td>)}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" aria-label="Columns" aria-expanded={colsOpen} onClick={() => setColsOpen((o) => !o)} className="absolute bottom-0 right-0 top-0 flex w-7 items-center justify-center bg-card text-[10px] font-semibold [writing-mode:vertical-rl] hover:bg-muted"><Columns3 className="mb-1 h-3.5 w-3.5" />Columns</button>
        {colsOpen && (
          <aside className="absolute bottom-0 right-7 top-0 z-20 w-56 overflow-auto bg-card p-2 shadow-lg">
            {COLS.map((c) => (
              <label key={c.k} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-[11px] hover:bg-muted">
                <Checkbox checked={visible.includes(c.k)} onCheckedChange={() => setVisible((v) => (v.includes(c.k) ? v.filter((k) => k !== c.k) : COLS.map((x) => x.k).filter((k) => k === c.k || v.includes(k))))} />
                {c.l}
              </label>
            ))}
          </aside>
        )}
      </section>
    </div>
  );
}
