/**
 * Prop firm challenge tracking. Pure and deterministic: trades in, progress out.
 *
 * Replays closed trades in exit order and applies the rule set the way a firm would, stopping at the first
 * breach (FAILED) or at the first trade after which every rule is satisfied (PASSED).
 *
 * Scope and honest limits (shown to the user via `notes`):
 *  - Closed trades only. Firms that trail on open-position equity can breach earlier than this engine sees.
 *  - Days are cut in the challenge's time zone (default UTC). Set it to the firm's day boundary.
 *  - Rules covered: profit target, max drawdown (static / EOD trailing / intraday trailing), daily loss limit,
 *    minimum trading days, minimum profitable days, consistency (best day share of profit).
 *    Payout rules, scaling plans and position-size limits are not modelled.
 */
import { zoneOffsetMs } from "../../supabase/functions/_shared/pnl-engine/time.ts";

export type Amount = { value: number; unit: "absolute" | "percent" };

export type Rule =
  | { id: string; kind: "profit_target"; target: Amount }
  | { id: string; kind: "max_drawdown"; limit: Amount; mode: "static" | "eod_trailing" | "intraday_trailing"; lockAtStart?: boolean }
  | { id: string; kind: "daily_loss"; limit: Amount }
  | { id: string; kind: "min_trading_days"; days: number }
  | { id: string; kind: "min_profitable_days"; days: number; minDailyProfit: number }
  | { id: string; kind: "consistency"; maxBestDayPercent: number };

export interface Challenge {
  startBalance: number;
  /** Trades that closed before this instant (UTC ms) are ignored. */
  startMs?: number | null;
  timeZone?: string;
  rules: Rule[];
}

export interface ChallengeTrade {
  exitMs: number;
  net: number;
}

export type RuleStatus = "met" | "pending" | "breached";

export interface RuleProgress {
  id: string;
  kind: Rule["kind"];
  label: string;
  status: RuleStatus;
  /** Human readable "current / required". */
  detail: string;
  /** 0..100 progress towards satisfying (or, for limits, usage of the limit). */
  pct: number;
}

export type ChallengeStatus = "active" | "passed" | "failed";

export interface ChallengeProgress {
  status: ChallengeStatus;
  /** UTC ms of the trade that ended the challenge (pass or breach). */
  endedAtMs: number | null;
  balance: number;
  profit: number;
  /** Lowest balance allowed right now by the drawdown rule, or null when none is set. */
  floor: number | null;
  tradingDays: number;
  bestDay: { day: string; net: number } | null;
  rules: RuleProgress[];
  notes: string[];
}

const abs = (a: Amount, start: number) => (a.unit === "percent" ? (start * a.value) / 100 : a.value);
const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function dayKey(ms: number, zone = "UTC"): string {
  const shifted = zone === "UTC" ? ms : ms + zoneOffsetMs(zone, ms);
  return new Date(shifted).toISOString().slice(0, 10);
}

interface State {
  balance: number;
  /** day -> realised net */
  days: Map<string, number>;
  /** Peak used by trailing drawdown: includes completed days only for EOD, every trade for intraday. */
  eodPeak: number;
  intradayPeak: number;
  lastDay: string | null;
}

function floorOf(rule: Extract<Rule, { kind: "max_drawdown" }>, c: Challenge, s: State): number {
  const limit = abs(rule.limit, c.startBalance);
  if (rule.mode === "static") return c.startBalance - limit;
  const peak = rule.mode === "eod_trailing" ? s.eodPeak : s.intradayPeak;
  const f = peak - limit;
  return rule.lockAtStart ? Math.min(f, c.startBalance) : f;
}

function evaluateRules(c: Challenge, s: State): RuleProgress[] {
  const profit = s.balance - c.startBalance;
  const dayNets = [...s.days.values()];
  const best = bestDayOf(s.days);
  return c.rules.map((r): RuleProgress => {
    switch (r.kind) {
      case "profit_target": {
        const target = abs(r.target, c.startBalance);
        return { id: r.id, kind: r.kind, label: "Profit target", status: profit >= target ? "met" : "pending", detail: `${money(profit)} / ${money(target)}`, pct: target > 0 ? clampPct((profit / target) * 100) : 100 };
      }
      case "max_drawdown": {
        const limit = abs(r.limit, c.startBalance);
        const floor = floorOf(r, c, s);
        const breached = s.balance <= floor;
        const used = Math.max(0, (peakOf(r, c, s) - s.balance));
        return { id: r.id, kind: r.kind, label: `Max drawdown (${r.mode.replace("_", " ")})`, status: breached ? "breached" : "pending", detail: `floor ${money(floor)} · ${money(used)} of ${money(limit)} used`, pct: limit > 0 ? clampPct((used / limit) * 100) : 0 };
      }
      case "daily_loss": {
        const limit = abs(r.limit, c.startBalance);
        const worst = Math.min(0, ...dayNets);
        const breached = worst <= -limit;
        return { id: r.id, kind: r.kind, label: "Daily loss limit", status: breached ? "breached" : "pending", detail: `worst day ${money(worst)} / -${money(limit)}`, pct: limit > 0 ? clampPct((-worst / limit) * 100) : 0 };
      }
      case "min_trading_days": {
        const n = dayNets.length;
        return { id: r.id, kind: r.kind, label: "Minimum trading days", status: n >= r.days ? "met" : "pending", detail: `${n} / ${r.days} days`, pct: r.days > 0 ? clampPct((n / r.days) * 100) : 100 };
      }
      case "min_profitable_days": {
        const n = dayNets.filter((d) => d >= r.minDailyProfit && d > 0).length;
        return { id: r.id, kind: r.kind, label: `Profitable days (≥ ${money(r.minDailyProfit)})`, status: n >= r.days ? "met" : "pending", detail: `${n} / ${r.days} days`, pct: r.days > 0 ? clampPct((n / r.days) * 100) : 100 };
      }
      case "consistency": {
        if (profit <= 0 || !best) return { id: r.id, kind: r.kind, label: `Consistency (best day < ${r.maxBestDayPercent}%)`, status: "pending", detail: "no profit yet", pct: 0 };
        const share = (best.net / profit) * 100;
        return { id: r.id, kind: r.kind, label: `Consistency (best day < ${r.maxBestDayPercent}%)`, status: share < r.maxBestDayPercent ? "met" : "pending", detail: `best day is ${share.toFixed(1)}% of profit`, pct: clampPct(100 - Math.max(0, share - r.maxBestDayPercent)) };
      }
    }
  });
}

/** Peak that anchors the drawdown floor for display (static rules use the start balance). */
function peakOf(rule: Extract<Rule, { kind: "max_drawdown" }>, c: Challenge, s: State): number {
  return floorOf(rule, c, s) + abs(rule.limit, c.startBalance);
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function bestDayOf(days: Map<string, number>): { day: string; net: number } | null {
  let best: { day: string; net: number } | null = null;
  for (const [day, net] of days) if (!best || net > best.net) best = { day, net };
  return best && best.net > 0 ? best : null;
}

export function evaluateChallenge(c: Challenge, input: ChallengeTrade[]): ChallengeProgress {
  const zone = c.timeZone || "UTC";
  const trades = input
    .filter((t) => (c.startMs == null || t.exitMs >= c.startMs) && Number.isFinite(t.net))
    .sort((a, b) => a.exitMs - b.exitMs);

  const s: State = { balance: c.startBalance, days: new Map(), eodPeak: c.startBalance, intradayPeak: c.startBalance, lastDay: null };
  const notes: string[] = [];
  if (c.rules.some((r) => r.kind === "max_drawdown" && r.mode !== "static")) notes.push("Trailing drawdown is tracked on closed trades only; open-position equity can move the real floor sooner.");
  if (zone === "UTC") notes.push("Trading days are cut at midnight UTC. Set the firm's time zone if its day ends elsewhere.");

  let status: ChallengeStatus = "active";
  let endedAtMs: number | null = null;

  for (const t of trades) {
    const day = dayKey(t.exitMs, zone);
    if (s.lastDay !== null && day !== s.lastDay) s.eodPeak = Math.max(s.eodPeak, s.balance); // previous day closed
    s.lastDay = day;
    s.balance = round2(s.balance + t.net);
    s.days.set(day, round2((s.days.get(day) ?? 0) + t.net));
    s.intradayPeak = Math.max(s.intradayPeak, s.balance);

    const rules = evaluateRules(c, s);
    if (rules.some((r) => r.status === "breached")) {
      status = "failed";
      endedAtMs = t.exitMs;
      break;
    }
    // A challenge needs a profit target to be passable; without one it just keeps running.
    if (c.rules.some((r) => r.kind === "profit_target") && rules.every((r) => r.status === "met" || r.kind === "max_drawdown" || r.kind === "daily_loss")) {
      status = "passed";
      endedAtMs = t.exitMs;
      break;
    }
  }

  const rules = evaluateRules(c, s);
  const dd = c.rules.find((r): r is Extract<Rule, { kind: "max_drawdown" }> => r.kind === "max_drawdown");
  return {
    status,
    endedAtMs,
    balance: s.balance,
    profit: round2(s.balance - c.startBalance),
    floor: dd ? floorOf(dd, c, s) : null,
    tradingDays: s.days.size,
    bestDay: bestDayOf(s.days),
    rules: status === "passed" ? rules.map((r) => (r.kind === "max_drawdown" || r.kind === "daily_loss" ? { ...r, status: "met" as const } : r)) : rules,
    notes,
  };
}

/** Sensible starting points; every number stays editable. */
export const PRESETS: { key: string; label: string; rules: Rule[] }[] = [
  {
    key: "two-step-p1",
    label: "10% target · 5% daily · 10% static drawdown",
    rules: [
      { id: "t", kind: "profit_target", target: { value: 10, unit: "percent" } },
      { id: "dd", kind: "max_drawdown", limit: { value: 10, unit: "percent" }, mode: "static" },
      { id: "dl", kind: "daily_loss", limit: { value: 5, unit: "percent" } },
      { id: "td", kind: "min_trading_days", days: 4 },
    ],
  },
  {
    key: "futures-eod",
    label: "6% target · 4% EOD trailing drawdown · consistency 50%",
    rules: [
      { id: "t", kind: "profit_target", target: { value: 6, unit: "percent" } },
      { id: "dd", kind: "max_drawdown", limit: { value: 4, unit: "percent" }, mode: "eod_trailing", lockAtStart: true },
      { id: "c", kind: "consistency", maxBestDayPercent: 50 },
      { id: "td", kind: "min_trading_days", days: 5 },
    ],
  },
  { key: "custom", label: "Custom (start empty)", rules: [] },
];
