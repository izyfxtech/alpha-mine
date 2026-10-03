import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Minus, Plus } from "lucide-react";
import { useTrades } from "@/lib/journal-context";
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

const COLS = ["Amount", "Avg. Qty.", "Winrate (%)", "Avg. P&L ($)", "Sum. Gain ($)", "Profit Factor", "Avg. R-Multiple", "Sum. R-Multiple", "Max. Cons. Winners", "Max. Cons. Losers"];

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
  const f = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    sum,
    cells: [String(n), f(ts.reduce((a, t) => a + t.quantity, 0) / (n || 1)), f(n ? (ts.filter(isWin).length / n) * 100 : 0), f(sum / (n || 1)), f(sum), gl ? f(gw / gl) : "", rs.length ? f(rs.reduce((a, b) => a + b, 0) / rs.length) : "", rs.length ? f(rs.reduce((a, b) => a + b, 0)) : "", String(mw), String(ml)],
  };
}

function group(ts: Trade[], c: Crit) {
  const m = new Map<string, Trade[]>();
  ts.forEach((t) => c.get(t).forEach((k) => m.set(k, [...(m.get(k) ?? []), t])));
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function Analytics() {
  const { trades } = useTrades();
  const [order, setOrder] = useState<string[]>(["setup"]);
  const [open, setOpen] = useState<Set<string>>(new Set(["Overall"]));
  const crits = order.map((k) => CRITERIA.find((c) => c.key === k)!);
  const toggle = (p: string) => setOpen((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const rows = useMemo(() => {
    const out: { path: string; label: string; depth: number; ts: Trade[]; expandable: boolean }[] = [];
    const walk = (ts: Trade[], depth: number, path: string) => {
      if (depth >= crits.length || !open.has(path)) return;
      group(ts, crits[depth]).forEach(([k, sub]) => {
        const p = `${path}/${k}`;
        out.push({ path: p, label: k, depth: depth + 1, ts: sub, expandable: depth + 1 < crits.length });
        walk(sub, depth + 1, p);
      });
    };
    out.push({ path: "Overall", label: "Overall", depth: 0, ts: trades, expandable: crits.length > 0 });
    walk(trades, 0, "Overall");
    return out;
  }, [trades, crits, open]);

  return (
    <div className="grid gap-4 grid-cols-[240px_1fr]">
      <div className="space-y-4">
        <section className="min-h-[240px] rounded-xl border bg-card p-3">
          <h3 className="mb-3 px-1 text-[15px] font-semibold">Ordering</h3>
          {crits.map((c) => (
            <div key={c.key} className="flex items-center justify-between border-b px-1 py-2.5 text-xs last:border-0">
              {c.label}
              <button aria-label={`Remove ${c.label}`} onClick={() => setOrder((o) => o.filter((k) => k !== c.key))}><Minus className="h-4 w-4" /></button>
            </div>
          ))}
          {!crits.length && <p className="px-1 text-xs text-muted-foreground">Add a criterion below to group trades.</p>}
        </section>
        <section className="rounded-xl border bg-card p-3">
          <h3 className="mb-3 px-1 text-[15px] font-semibold">Add Ordering Criteria</h3>
          {CRITERIA.filter((c) => !order.includes(c.key)).map((c) => (
            <div key={c.key} className="flex items-center justify-between border-b px-1 py-2.5 text-xs last:border-0">
              {c.label}
              <button aria-label={`Add ${c.label}`} onClick={() => setOrder((o) => [...o, c.key])}><Plus className="h-4 w-4" /></button>
            </div>
          ))}
        </section>
      </div>

      <section className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[1100px] text-xs tabular">
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 w-52 border-r bg-card px-3 py-3 text-left font-semibold">Group</th>
              {COLS.map((c) => <th key={c} className="whitespace-nowrap px-3 py-3 text-right font-semibold">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = rowStats(r.ts);
              const tone = s.sum > 0 ? "text-profit" : s.sum < 0 ? "text-loss" : "";
              const bg = s.sum > 0 ? "bg-profit-soft/40" : s.sum < 0 ? "bg-loss-soft/50" : "";
              return (
                <Fragment key={r.path}>
                  <tr className={cn("border-b border-border/50", bg, tone)}>
                    <td className={cn("sticky left-0 border-r px-3 py-2", bg || "bg-card")} style={{ paddingLeft: 12 + r.depth * 22 }}>
                      <span className="flex items-center gap-1">
                        {r.expandable ? (
                          <button onClick={() => toggle(r.path)} className="text-foreground">{open.has(r.path) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>
                        ) : <span className="w-3.5" />}
                        {r.label}
                      </span>
                    </td>
                    {s.cells.map((c, i) => <td key={i} className="px-3 py-2 text-right">{c}</td>)}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
