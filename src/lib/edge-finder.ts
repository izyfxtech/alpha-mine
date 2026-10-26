import { computeStats, potentialR, type Trade } from "@/lib/metrics";

export type Rating = "good" | "ok" | "poor";
export interface Trend { dir: "up" | "down" | "flat"; label: string }
export type Tone = "pos" | "neg" | undefined;

export interface MetricSection { kind: "metric"; id: string; title: string; text: string; rating: Rating; value: string; trend?: Trend; note?: string }
export interface TableSection { kind: "table"; id: string; title: string; text: string; rating: Rating; columns: string[]; rows: { cells: string[]; tone?: Tone; sub?: string }[] }
export type EdgeSection = MetricSection | TableSection;

export interface EdgeCard {
  id: string;
  title: string;
  /** One-sentence verdict shown on the summary list. */
  text: string;
  rating: Rating;
  /** 0-6 filled segments of the bar on the summary list. */
  score: number;
  /** Number used to compare against an earlier snapshot of the journal. */
  headline: number;
  trend?: Trend;
  sections: EdgeSection[];
  /** false when there is not enough data for the card to say anything yet. */
  ready: boolean;
  missing?: string;
}

const SCORE: Record<Rating, number> = { good: 6, ok: 4, poor: 2 };
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const pct = (n: number, d = 1) => `${n.toFixed(d)}%`;
const money = (n: number, cur: string) => `${n < 0 ? "-" : "+"}${new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(Math.abs(n))}`;
const MIN_TRADES = 10;

const hasNeg = (t: Trade, phase?: string) => t.comments.some((c) => c.sentiment === "negative" && (!phase || c.phase === phase));

function rrOf(ts: Trade[]) {
  const w = ts.filter((t) => t.net_pnl > 0), l = ts.filter((t) => t.net_pnl < 0);
  const aw = w.length ? sum(w.map((t) => t.net_pnl)) / w.length : 0, al = l.length ? Math.abs(sum(l.map((t) => t.net_pnl)) / l.length) : 0;
  return al ? aw / al : aw ? 99 : 0;
}

/** Return / max-drawdown over the last `days` days (or all trades when null). */
function riskWindow(all: Trade[], balance: number, days: number | null) {
  const last = all.length ? new Date(all[all.length - 1]!.entry_at).getTime() : 0;
  const ts = days == null ? all : all.filter((t) => new Date(t.entry_at).getTime() >= last - days * 864e5);
  let eq = balance, peak = balance, dd = 0;
  ts.forEach((t) => { eq += t.net_pnl; peak = Math.max(peak, eq); dd = Math.max(dd, peak ? ((peak - eq) / peak) * 100 : 0); });
  const ret = balance ? (sum(ts.map((t) => t.net_pnl)) / balance) * 100 : 0;
  return { n: ts.length, ret, dd, ratio: dd > 0 ? ret / dd : ret > 0 ? Infinity : 0 };
}

function build(all: Trade[], balance: number, cur: string, optionNames: Map<string, { label: string; category: string }>): EdgeCard[] {
  const ts = [...all].sort((a, b) => a.entry_at.localeCompare(b.entry_at));
  const n = ts.length;
  const empty = (id: string, title: string, missing: string): EdgeCard => ({ id, title, text: missing, rating: "ok", score: 0, headline: 0, sections: [], ready: false, missing });
  if (n < MIN_TRADES) return ["profitability", "system-edge", "process", "outlier", "management", "risk"].map((id, i) => empty(id, ["Profitability", "True System Edge", "Trading Process", "Performance Outlier", "Trade Management", "Risk Management"][i]!, `Needs at least ${MIN_TRADES} trades (you have ${n}).`));
  const stats = computeStats(ts, balance);
  const wr = (stats.winRate ?? 0), net = sum(ts.map((t) => t.net_pnl));
  const cards: EdgeCard[] = [];

  /* 1. Profitability */
  {
    const expectancy = sum(ts.map((t) => t.retPct)) / n;
    const rr = rrOf(ts);
    const exRating: Rating = expectancy > 0 ? "good" : expectancy === 0 ? "ok" : "poor";
    const rrRating: Rating = rr >= 1.5 ? "good" : rr >= 1 ? "ok" : "poor";
    const wrRating: Rating = wr >= 50 && net > 0 ? "good" : wr >= 40 ? "ok" : "poor";
    const text = exRating === "good" ? "Your trading is generating net gains on average. That is a good sign that your overall approach produces positive results over time." : exRating === "ok" ? "Your trading is roughly break-even on average. Small improvements in execution or selection could tip it into profit." : "Your trading is losing money on average. Review your setups and risk before adding size.";
    cards.push({ id: "profitability", title: "Profitability", text, rating: exRating, score: SCORE[exRating], headline: expectancy, ready: true, sections: [
      { kind: "metric", id: "expectancy", title: "Expectancy", rating: exRating, value: pct(expectancy), text },
      { kind: "metric", id: "rr", title: "Reward:Risk", rating: rrRating, value: `${rr.toFixed(1)}:1`, note: rr > 0 ? `Required winrate to break even: ${(100 / (1 + rr)).toFixed(1)}%` : undefined,
        text: rrRating === "good" ? "Your average winner is comfortably larger than your average loser, which gives you room for a lower winrate." : rrRating === "ok" ? "Your average winner is only a little larger than your average loser. This supports profitability if your winrate stays strong, but there is room to improve." : "Your average loser is bigger than your average winner, so you need a high winrate to stay profitable." },
      { kind: "metric", id: "winrate", title: "Winrate", rating: wrRating, value: `${wr.toFixed(0)}%`, note: wr > 0 && wr < 100 ? `Required reward:risk to break even: ${((100 - wr) / wr).toFixed(1)}:1` : undefined,
        text: wrRating === "good" ? "Your winrate is above 50% and your return is positive. Your strategy wins consistently; keeping discipline and trade selection is the key to keeping this edge." : wrRating === "ok" ? "Your winrate is moderate. It works when your winners are large enough, so keep an eye on reward:risk." : "Your winrate is low. Unless your winners are very large, tighten your trade selection." },
    ] });
  }

  /* 2. True System Edge: rule-following trades vs trades with a mistake */
  {
    const commented = ts.filter((t) => t.comments.length > 0);
    const clean = commented.filter((t) => !hasNeg(t)), bad = commented.filter((t) => hasNeg(t));
    if (clean.length < 5) cards.push(empty("system-edge", "True System Edge", "Tag at least 5 trades with comments and no negative one to see how your system performs when you follow your rules."));
    else {
      const edge = sum(clean.map((t) => t.retPct)), leak = sum(bad.map((t) => t.retPct));
      const rating: Rating = edge > 0 ? (leak < -edge ? "ok" : "good") : "poor";
      const phases: [string, string][] = [["pre_trade", "Pre Trade Comments"], ["entry", "Entry Comments"], ["management", "Trade Management"], ["exit", "Exit Comments"]];
      const rows = phases.map(([ph, label]) => {
        const g = ts.filter((t) => hasNeg(t, ph));
        return { label, g };
      }).filter((x) => x.g.length).map(({ label, g }) => {
        const p = sum(g.map((t) => t.net_pnl)), pr = sum(g.map((t) => t.retPct));
        return { cells: [label, String(g.length), `${Math.round((g.filter((t) => t.net_pnl > 0).length / g.length) * 100)}%`, money(p, cur)], sub: `${pr.toFixed(0)}%`, tone: (p < 0 ? "neg" : "pos") as Tone };
      });
      cards.push({ id: "system-edge", title: "True System Edge", rating, score: SCORE[rating], headline: edge, ready: true,
        text: edge > 0 ? "True Edge shows how your strategy performs when you follow your rules. Your rule-abiding trades are profitable, which shows what your approach can do when executed with discipline." : "Even your rule-abiding trades are not profitable. The problem may be the strategy itself rather than execution.",
        sections: [
          { kind: "metric", id: "edge", title: "True System Edge", rating: edge > 0 ? "good" : "poor", value: pct(edge), text: "Return from the trades where you followed your rules (comments present, none negative), as a share of the account." },
          { kind: "metric", id: "leak", title: "Total Edge Leak", rating: leak < 0 ? "poor" : "ok", value: pct(leak), text: "The total impact of every trade where a mistake was recorded. It shows how much performance is lost to rule violations in your execution." },
          ...(rows.length ? [{ kind: "table", id: "mistakes", title: "Mistake Impact Analysis", rating: "poor", text: "Where execution errors hurt the most, so you can decide what to work on next.", columns: ["Tag", "Trades", "Winrate", "Performance"], rows } as TableSection] : []),
        ] });
    }
    if (!cards.some((c) => c.id === "system-edge")) cards.push(empty("system-edge", "True System Edge", "Tag trades with comments to see this."));
  }

  /* 3. Trading Process: efficiency + best / worst hours */
  {
    const eff = (ts.filter((t) => !hasNeg(t)).length / n) * 100;
    const rating: Rating = eff >= 70 ? "good" : eff >= 40 ? "ok" : "poor";
    const text = net > 0 ? (rating === "good" ? "Your process is disciplined and it shows in the results. Keep following your rules." : "Your trading shows a positive return despite low efficiency. Mistakes or inconsistencies may be limiting your full potential, and improving discipline could strengthen your edge further.") : "Mistakes and inconsistency are costing you. Work on following your plan before changing the strategy.";
    const byHour = new Map<number, number>();
    ts.forEach((t) => { const h = new Date(t.entry_at).getHours(); byHour.set(h, (byHour.get(h) ?? 0) + t.net_pnl); });
    const hours = [...byHour.entries()].map(([h, v]) => ({ h: `${String(h).padStart(2, "0")}:00`, v }));
    const best = hours.filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 4), worst = hours.filter((x) => x.v < 0).sort((a, b) => a.v - b.v).slice(0, 4);
    cards.push({ id: "process", title: "Trading Process", text, rating, score: SCORE[rating], headline: eff, ready: true, sections: [
      { kind: "metric", id: "eff", title: "Trading Process", rating, value: `${eff.toFixed(0)}%`, text, note: "Efficiency: share of trades without a negative comment" },
      ...(best.length ? [{ kind: "table", id: "best-hours", title: "Best Trading Hours", rating: "good", text: "You perform best during these hours. That could reflect better market conditions, a closer fit with your strategy, or simply times when you are more focused.", columns: ["Time", "Total Profit"], rows: best.map((x) => ({ cells: [x.h, money(x.v, cur)], tone: "pos" as Tone })) } as TableSection] : []),
      ...(worst.length ? [{ kind: "table", id: "worst-hours", title: "Worst Trading Hours", rating: "poor", text: "Your results are much weaker in these hours. They may not suit your approach, or focus and execution tend to drop then.", columns: ["Time", "Total Loss"], rows: worst.map((x) => ({ cells: [x.h, money(x.v, cur)], tone: "neg" as Tone })) } as TableSection] : []),
    ] });
  }

  /* 4. Performance Outlier */
  {
    const mean = net / n, sd = Math.sqrt(sum(ts.map((t) => (t.net_pnl - mean) ** 2)) / n) || 1;
    const pos = ts.filter((t) => t.net_pnl - mean > 2 * sd).length, neg = ts.filter((t) => t.net_pnl - mean < -2 * sd).length;
    const rating: Rating = pos > neg ? "good" : pos === neg ? "ok" : "poor";
    const text = rating === "good" ? "Your positive outliers outnumber the negative ones. This is a good sign that your edge is present and that certain trades generate well above-average returns." : rating === "ok" ? "Your biggest winners and losers balance out. Look at what made the outliers different." : "Your negative outliers outnumber the positive ones. A few large losses are dragging your results.";
    const g = new Map<string, number[]>();
    ts.forEach((t) => t.customStats.forEach((id) => g.set(id, [...(g.get(id) ?? []), t.net_pnl])));
    const tags = [...g.entries()].filter(([id, v]) => v.length >= 2 && optionNames.has(id)).map(([id, v]) => ({ id, avg: sum(v) / v.length, ...optionNames.get(id)! }));
    const prof = tags.filter((x) => x.avg > 0).sort((a, b) => b.avg - a.avg).slice(0, 8), lose = tags.filter((x) => x.avg < 0).sort((a, b) => a.avg - b.avg).slice(0, 8);
    cards.push({ id: "outlier", title: "Performance Outlier", text, rating, score: SCORE[rating], headline: pos - neg, ready: true, sections: [
      { kind: "metric", id: "outliers", title: "Performance Outlier", rating, value: `${pos + neg} Outliers`, text, note: `${pos} unusually good, ${neg} unusually bad (more than 2 standard deviations from your average trade)` },
      ...(prof.length ? [{ kind: "table", id: "prof", title: "Profitable Custom Stats", rating: "good", text: "Your strongest custom statistics stand out with the best average result. Building on them can reinforce what already works.", columns: ["Tag", "Category", "Avg. Profit"], rows: prof.map((x) => ({ cells: [x.label, x.category, money(x.avg, cur)], tone: "pos" as Tone })) } as TableSection] : []),
      ...(lose.length ? [{ kind: "table", id: "lose", title: "Losing Custom Stats", rating: "poor", text: "Your weakest custom statistics show the lowest results and repeatedly drag on your performance. Addressing them can improve your trading.", columns: ["Tag", "Category", "Avg. Loss"], rows: lose.map((x) => ({ cells: [x.label, x.category, money(x.avg, cur)], tone: "neg" as Tone })) } as TableSection] : []),
    ] });
  }

  /* 5. Trade Management: R gained or lost versus leaving every trade alone */
  {
    const rows = ts.map((t) => ({ t, a: t.r, p: potentialR(t) })).filter((x): x is { t: Trade; a: number; p: number } => x.a != null && x.p != null);
    if (rows.length < 5) cards.push(empty("management", "Trade Management", "Add a stop loss and take profit (plus whether the target was hit) to at least 5 trades to see the effect of your trade management."));
    else {
      const effect = sum(rows.map((r) => r.a - r.p));
      const rating: Rating = effect > 0.5 ? "good" : effect >= -0.5 ? "ok" : "poor";
      const text = rating === "good" ? "Your trade management has a positive effect on performance. You consistently improve outcomes beyond the original plan, which reflects good decision making after entry." : rating === "ok" ? "Your trade management has little effect either way. Your results are close to what leaving trades alone would give." : "Managing your trades is costing you R compared with leaving them alone. Review early exits and stop moves.";
      const exits = new Map<string, number[]>();
      ts.forEach((t) => t.comments.filter((c) => c.phase === "exit" && c.sentiment === "negative").forEach((c) => exits.set(c.label, [...(exits.get(c.label) ?? []), t.net_pnl])));
      const worst = [...exits.entries()].filter(([, v]) => v.length >= 2).map(([label, v]) => ({ label, total: sum(v) })).sort((a, b) => a.total - b.total)[0];
      cards.push({ id: "management", title: "Trade Management", text, rating, score: SCORE[rating], headline: effect, ready: true, sections: [
        { kind: "metric", id: "effect", title: "Trade Management", rating, value: `${effect.toFixed(2)}R`, text, note: `Based on ${rows.length} trades with a stop loss and take profit` },
        ...(worst ? [{ kind: "metric", id: "worst-exit", title: "Worst Exit Comment", rating: "poor", value: worst.label, text: "This exit tag points to a specific problem in how you leave trades. Working on the pattern behind it will improve your exits and overall profitability." } as MetricSection] : []),
      ] });
    }
  }

  /* 6. Risk Management */
  {
    const all_ = riskWindow(ts, balance, null);
    const ratio = Number.isFinite(all_.ratio) ? all_.ratio : 99;
    const rating: Rating = ratio >= 2 ? "good" : ratio >= 1 ? "ok" : "poor";
    const text = rating === "good" ? "Your return significantly exceeds your drawdowns, showing strong risk-adjusted performance. This supports consistency and long-term growth." : rating === "ok" ? "Your return outweighs your drawdowns, but not by much. Reducing drawdowns would improve your risk-adjusted performance." : "Your drawdowns are as large as or larger than your return. Review position sizing and loss limits.";
    const periods = ([[7, "Last 7 days"], [30, "Last 30 days"], [180, "Last 180 days"], [365, "Last 365 days"]] as [number, string][]).map(([d, l]) => ({ l, ...riskWindow(ts, balance, d) })).filter((p) => p.n >= 3);
    cards.push({ id: "risk", title: "Risk Management", text, rating, score: SCORE[rating], headline: ratio, ready: true, sections: [
      { kind: "metric", id: "rd", title: "Return/Drawdown", rating, value: Number.isFinite(all_.ratio) ? all_.ratio.toFixed(2) : "No drawdown", text },
      { kind: "metric", id: "dd", title: "Max Drawdown", rating: all_.dd < 10 ? "good" : all_.dd < 20 ? "ok" : "poor", value: pct(all_.dd, 2), text: all_.dd < 10 ? "Your deepest drop from a peak is shallow. Keep position sizes consistent." : all_.dd < 20 ? "Your deepest drop from a peak is noticeable. Make sure it is within what you planned for." : "Your deepest drop from a peak is large. A drawdown this deep takes a much bigger gain to recover." },
      ...(periods.length ? [{ kind: "table", id: "periods", title: "Return to drawdown by period", rating, text: "Shorter windows show whether your recent risk-adjusted performance is improving.", columns: ["Period", "Return", "Max DD", "Ratio"], rows: periods.map((p) => ({ cells: [p.l, pct(p.ret), pct(p.dd), Number.isFinite(p.ratio) ? p.ratio.toFixed(2) : "–"], tone: (p.ret < 0 ? "neg" : "pos") as Tone })) } as TableSection] : []),
    ] });
  }
  return cards;
}
const days30 = 30 * 864e5;
const trendOf = (now: number, before: number | undefined): Trend | undefined => {
  if (before === undefined) return undefined;
  if (now === before) return { dir: "flat", label: "0%" };
  const rel = before !== 0 ? ((now - before) / Math.abs(before)) * 100 : 100;
  if (Math.abs(rel) < 5) return { dir: "flat", label: "Similar" };
  return { dir: rel > 0 ? "up" : "down", label: `${Math.abs(Math.round(rel))}%` };
};

/** Builds the six Edge Finder cards. The trend compares each card with the same analysis as of 30 days before the last trade. */
export function computeEdgeFinder(all: Trade[], balance: number, currency = "USD", optionNames = new Map<string, { label: string; category: string }>()): EdgeCard[] {
  const now = build(all, balance, currency, optionNames);
  const last = all.reduce((m, t) => Math.max(m, new Date(t.entry_at).getTime()), 0);
  const earlier = all.filter((t) => new Date(t.entry_at).getTime() <= last - days30);
  const before = earlier.length >= MIN_TRADES ? build(earlier, balance, currency, optionNames) : null;
  return now.map((c) => {
    const prev = before?.find((p) => p.id === c.id);
    const trend = c.ready && prev?.ready ? trendOf(c.headline, prev.headline) : undefined;
    return trend ? { ...c, trend } : c;
  });
}
