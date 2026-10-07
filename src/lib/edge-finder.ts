import type { Trade } from "@/lib/metrics";

export type EdgeKind = "strength" | "weakness" | "neutral";
export interface EdgeInsight {
  id: string;
  kind: EdgeKind;
  group: "System Edge" | "Edge Leak" | "Mistake Impact" | "Risk" | "Outliers";
  title: string;
  body: string;
  /** Short headline number shown on the card, e.g. "+$1,240". */
  value?: string;
}

const PHASES: [string, string][] = [["pre_trade", "Pre-Trade"], ["entry", "Entry"], ["management", "Management"], ["exit", "Exit"]];
const MIN_TRADES = 10;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const money = (n: number, cur: string) => `${n < 0 ? "-" : n > 0 ? "+" : ""}${new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(Math.abs(n))}`;

/** Peak-to-trough drawdown of the running P&L, as a % of the starting balance. */
function maxDrawdownPct(ts: Trade[], balance: number) {
  let eq = balance, peak = balance, dd = 0;
  ts.forEach((t) => { eq += t.net_pnl; peak = Math.max(peak, eq); dd = Math.max(dd, peak ? ((peak - eq) / peak) * 100 : 0); });
  return dd;
}

/**
 * Automatically looks for the strong and weak parts of a journal. Everything is derived from the
 * existing trades, comments, setups and instruments, so it needs no extra input from the trader.
 */
export function computeEdgeFinder(all: Trade[], balance: number, currency = "USD"): EdgeInsight[] {
  const ts = [...all].sort((a, b) => a.entry_at.localeCompare(b.entry_at));
  if (ts.length < MIN_TRADES) return [];
  const out: EdgeInsight[] = [];
  const overallAvg = sum(ts.map((t) => t.net_pnl)) / ts.length;

  // 1. True system edge: trades that only carry positive comments
  const clean = ts.filter((t) => t.comments.length > 0 && t.comments.every((c) => c.sentiment === "positive"));
  if (clean.length >= 5) {
    const net = sum(clean.map((t) => t.net_pnl)), avg = net / clean.length, wr = (clean.filter((t) => t.net_pnl > 0).length / clean.length) * 100;
    out.push({ id: "system-edge", group: "System Edge", kind: avg > 0 ? "strength" : "weakness", value: money(net, currency),
      title: "Your system's edge when you follow your rules",
      body: `${clean.length} trades with only positive comments returned ${money(net, currency)} (${wr.toFixed(0)}% winrate, ${money(avg, currency)} per trade). Across all trades the average is ${money(overallAvg, currency)}.` });
  }

  // 2. Total edge leak: trades that carry at least one negative comment
  const leak = ts.filter((t) => t.comments.some((c) => c.sentiment === "negative"));
  if (leak.length >= 3) {
    const net = sum(leak.map((t) => t.net_pnl));
    out.push({ id: "edge-leak", group: "Edge Leak", kind: net < 0 ? "weakness" : "neutral", value: money(net, currency),
      title: net < 0 ? "Rule violations are leaking your edge" : "Trades with rule violations are not hurting you (yet)",
      body: `${leak.length} of ${ts.length} trades had a negative comment and returned ${money(net, currency)} in total.` });
  }

  // 3. Mistake impact by comment phase, then by the single worst comments
  const phaseCost = PHASES.map(([key, label]) => {
    const g = ts.filter((t) => t.comments.some((c) => c.phase === key && c.sentiment === "negative"));
    return { key, label, n: g.length, net: sum(g.map((t) => t.net_pnl)) };
  }).filter((p) => p.n >= 3 && p.net < 0).sort((a, b) => a.net - b.net);
  phaseCost.slice(0, 2).forEach((p) => out.push({ id: `mistake-${p.key}`, group: "Mistake Impact", kind: "weakness", value: money(p.net, currency),
    title: `${p.label} mistakes hurt the most`, body: `${p.n} trades with a negative ${p.label.toLowerCase()} comment returned ${money(p.net, currency)}.` }));
  const byLabel = new Map<string, { n: number; net: number }>();
  ts.forEach((t) => t.comments.filter((c) => c.sentiment === "negative").forEach((c) => { const g = byLabel.get(c.label) ?? { n: 0, net: 0 }; g.n++; g.net += t.net_pnl; byLabel.set(c.label, g); }));
  const worst = [...byLabel.entries()].filter(([, g]) => g.n >= 3 && g.net < 0).sort((a, b) => a[1].net - b[1].net)[0];
  if (worst) out.push({ id: `label-${worst[0]}`, group: "Mistake Impact", kind: "weakness", value: money(worst[1].net, currency),
    title: `"${worst[0]}" is your costliest mistake`, body: `It appears on ${worst[1].n} trades that returned ${money(worst[1].net, currency)} together.` });

  // 4. Return to drawdown over 7 / 30 / 180 / 365 days
  const last = new Date(ts[ts.length - 1]!.entry_at).getTime();
  const periods = [7, 30, 180, 365].map((d) => {
    const w = ts.filter((t) => new Date(t.entry_at).getTime() >= last - d * 864e5);
    const ret = balance ? (sum(w.map((t) => t.net_pnl)) / balance) * 100 : 0, dd = maxDrawdownPct(w, balance);
    return { d, n: w.length, ret, ratio: dd > 0 ? ret / dd : ret > 0 ? Infinity : 0 };
  }).filter((p) => p.n >= 5);
  if (periods.length) {
    const best = [...periods].sort((a, b) => b.ratio - a.ratio)[0]!, bad = periods.filter((p) => p.ratio < 1 && p.ret < 5).sort((a, b) => a.ratio - b.ratio)[0];
    const f = (r: number) => (Number.isFinite(r) ? r.toFixed(2) : "no drawdown");
    out.push({ id: "rd-best", group: "Risk", kind: best.ratio >= 1.5 ? "strength" : "neutral", value: f(best.ratio),
      title: `Best return-to-drawdown: last ${best.d} days`, body: `Over ${best.d} days you made ${best.ret.toFixed(2)}% for a ratio of ${f(best.ratio)}. Higher means each unit of risk paid more.` });
    if (bad) out.push({ id: "rd-weak", group: "Risk", kind: "weakness", value: f(bad.ratio),
      title: `Returns do not justify the risk over ${bad.d} days`, body: `${bad.ret.toFixed(2)}% return against its drawdown gives a ratio of ${f(bad.ratio)}. Below 1 means drawdown outweighed the gain.` });
  }

  // 5. Outliers: groups whose average result differs clearly from the journal's overall average
  const sd = Math.sqrt(sum(ts.map((t) => (t.net_pnl - overallAvg) ** 2)) / ts.length) || 1;
  const dims: [string, (t: Trade) => string][] = [
    ["Setup", (t) => t.setup || "No setup"], ["Instrument", (t) => t.instrument || "Unknown"],
    ["Weekday", (t) => new Date(t.entry_at).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })],
    ["Hour", (t) => `${String(new Date(t.entry_at).getUTCHours()).padStart(2, "0")}:00`],
  ];
  dims.forEach(([dim, key]) => {
    const g = new Map<string, Trade[]>();
    ts.forEach((t) => g.set(key(t), [...(g.get(key(t)) ?? []), t]));
    [...g.entries()].filter(([, v]) => v.length >= 5).forEach(([k, v]) => {
      const avg = sum(v.map((t) => t.net_pnl)) / v.length, z = (avg - overallAvg) / (sd / Math.sqrt(v.length));
      if (Math.abs(z) < 2) return;
      out.push({ id: `outlier-${dim}-${k}`, group: "Outliers", kind: z > 0 ? "strength" : "weakness", value: `${money(avg, currency)}/trade`,
        title: `${dim} "${k}" ${z > 0 ? "outperforms" : "underperforms"}`, body: `${v.length} trades average ${money(avg, currency)} versus ${money(overallAvg, currency)} across the journal.` });
    });
  });
  return out;
}
