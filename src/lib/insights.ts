import { WEEKDAYS, groupPerformance, type Trade } from "@/lib/metrics";

export type Insight = { id: string; title: string; body: string; at: string; tradeId: string };

/** Coaching notifications derived from the closed-trade history (newest first). */
export function computeInsights(all: Trade[]): Insight[] {
  const ts = all.filter((t) => t.exit_price != null || t.net_pnl !== 0).sort((a, b) => a.entry_at.localeCompare(b.entry_at));
  const out: Insight[] = [];
  let run = 0, runSum = 0, minLoss = 0, runTilt = 0, broken = 0, earlyTp = 0;
  const losses: number[] = [];
  ts.forEach((t) => {
    const p = t.net_pnl, at = t.exit_at ?? t.entry_at;
    const sign = p > 0 ? 1 : p < 0 ? -1 : 0;
    if (sign && Math.sign(run) === sign) { run += sign; runSum += p; runTilt += t.tilt; } else { run = sign; runSum = p; runTilt = t.tilt; }
    if (Math.abs(run) === 5) out.push({ id: `streak-${t.id}`, tradeId: t.id, at, title: run > 0 ? "5 Wins in a Row!" : runTilt > 0 ? "5 Losses with a Green Tiltmeter" : "5 Losses in a Row!",
      body: run < 0 && runTilt > 0 ? `You lost 5 trades in a row (${runSum.toFixed(2)}) but followed your rules. Losing streaks are part of trading — stay disciplined.` : `You realized 5 ${run > 0 ? "winning" : "losing"} trades in a row with a total ${run > 0 ? "profit" : "loss"} of ${runSum.toFixed(2)}.` });
    broken = t.comments.some((c) => c.sentiment === "negative") ? broken + 1 : 0;
    if (broken === 3) out.push({ id: `rules-${t.id}`, tradeId: t.id, at, title: "Repeated Rule-Breaking", body: "Your last 3 trades all have negative trade comments. Take a break and review your trading plan." });
    if (p < 0) {
      const avg = losses.length ? losses.reduce((s, v) => s + v, 0) / losses.length : 0;
      if (losses.length >= 3 && p <= avg * 3) out.push({ id: `big-${t.id}`, tradeId: t.id, at, title: "Losing Trade Bigger Than Usual",
        body: `Your last trade was ${(p / avg).toFixed(0)} times the size of your average losing trade. Keep an eye on your risk management and position sizing.` });
      if (losses.length >= 3 && p < minLoss) out.push({ id: `max-${t.id}`, tradeId: t.id, at, title: "New Largest Loss", body: `This trade is your largest loss so far with a total of ${p.toFixed(2)}.` });
      minLoss = Math.min(minLoss, p);
      losses.push(p);
    }
    if (t.take_profit != null && t.exit_price != null && p > 0) {
      const short = t.direction === "short";
      if (short ? t.exit_price > t.take_profit : t.exit_price < t.take_profit)
      {
        earlyTp++;
        out.push({ id: `tp-${t.id}`, tradeId: t.id, at, title: "Trade Closed Before TP", body: `You closed a winning ${t.instrument} trade before price hit your take profit. That's ${earlyTp} winner${earlyTp > 1 ? "s" : ""} closed early so far. Trust the system.` });
      }
    }
  });
  // Weekly and monthly digests: best setup, weekday and hour of each completed period.
  const digest = (key: (t: Trade) => string, label: string) => {
    const periods = new Map<string, Trade[]>();
    ts.forEach((t) => periods.set(key(t), [...(periods.get(key(t)) ?? []), t]));
    [...periods.entries()].slice(0, -1).forEach(([k, pts]) => {
      if (pts.length < 3) return;
      const top = (f: (t: Trade) => string) => groupPerformance(pts, f).sort((a, b) => b.pnl - a.pnl)[0];
      const s = top((t) => t.setup), d = top((t) => WEEKDAYS[new Date(t.entry_at).getDay()]), h = top((t) => `${String(new Date(t.entry_at).getHours()).padStart(2, "0")}:00`);
      const last = pts[pts.length - 1];
      out.push({ id: `${label}-${k}`, tradeId: last.id, at: last.exit_at ?? last.entry_at, title: `${label === "week" ? "Weekly" : "Monthly"} Summary`,
        body: `Best setup: ${s.key} (${s.pnl.toFixed(2)}). Best day: ${d.key}. Best hour: ${h.key}.` });
    });
  };
  const weekOf = (t: Trade) => { const d = new Date(t.entry_at); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  digest(weekOf, "week");
  digest((t) => t.entry_at.slice(0, 7), "month");
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
}
