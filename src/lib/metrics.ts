// Shared metrics engine: every page computes stats from here so numbers always match.
export type Sentiment = "positive" | "negative" | "neutral";

export interface TradeRow {
  id: string;
  journal_id: string;
  instrument_id: string | null;
  setup_id: string | null;
  trading_plan_id: string | null;
  direction: string;
  trade_type: string;
  entry_at: string;
  exit_at: string | null;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  stop_loss: number | null;
  take_profit: number | null;
  high_price: number | null;
  low_price: number | null;
  otp_hit: boolean | null;
  gross_pnl: number;
  fees: number;
  net_pnl: number;
  risk_amount: number | null;
  is_favorite: boolean;
  notes: string | null;
  created_at: string;
  is_break_even: boolean;
  trade_no: number;
}

export interface Trade extends TradeRow {
  instrument: string;
  setup: string;
  comments: { id: string; label: string; phase: string; sentiment: Sentiment }[];
  customStats: string[]; // custom_stat_options ids
  tilt: number; // signed discipline points: +1 per positive comment, -1 per negative
  followedPlan: boolean; // no negative comment on the trade
  accountSize: number; // running balance before this trade (start + cashflows + prior net)
  retPct: number; // net P&L as % of accountSize
  r: number | null;
  holdMinutes: number | null;
}

export function enrichTrade(
  t: TradeRow,
  instruments: Map<string, string>,
  setups: Map<string, string>,
  comments: Trade["comments"],
): Trade {
  const pos = comments.filter((c) => c.sentiment === "positive").length;
  const neg = comments.filter((c) => c.sentiment === "negative").length;
  const tilt = pos - neg;
  const risk = riskOf(t);
  const net = Number(t.net_pnl);
  return {
    ...t,
    entry_price: Number(t.entry_price),
    exit_price: t.exit_price == null ? null : Number(t.exit_price),
    quantity: Number(t.quantity),
    gross_pnl: Number(t.gross_pnl),
    fees: Number(t.fees),
    net_pnl: net,
    instrument: (t.instrument_id && instruments.get(t.instrument_id)) || "—",
    setup: (t.setup_id && setups.get(t.setup_id)) || "No setup",
    comments,
    customStats: [],
    tilt,
    followedPlan: neg === 0,
    accountSize: 0,
    retPct: 0,
    r: risk ? net / risk : null,
    holdMinutes: t.exit_at ? (new Date(t.exit_at).getTime() - new Date(t.entry_at).getTime()) / 60000 : null,
  };
}

export function riskOf(t: Pick<TradeRow, "risk_amount" | "stop_loss" | "entry_price" | "quantity">) {
  if (t.risk_amount && Number(t.risk_amount) > 0) return Number(t.risk_amount);
  if (t.stop_loss != null) {
    const r = Math.abs(Number(t.entry_price) - Number(t.stop_loss)) * Number(t.quantity);
    return r > 0 ? r : null;
  }
  return null;
}

export const isWin = (t: Pick<Trade, "net_pnl" | "is_break_even">) => !t.is_break_even && t.net_pnl > 0;
export const isLoss = (t: Pick<Trade, "net_pnl" | "is_break_even">) => !t.is_break_even && t.net_pnl < 0;
export const isBE = (t: Pick<Trade, "net_pnl" | "is_break_even">) => !!t.is_break_even || t.net_pnl === 0;

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);
export const dayKey = (iso: string) => iso.slice(0, 10);

/** Tilt meter fill (0..1) for a points value; 3 points fills the bar. */
export const TILT_CAP = 3;
export const tiltFill = (points: number) => Math.min(1, Math.abs(points) / TILT_CAP);

export type Cashflow = { occurred_on: string; amount: number };

/**
 * Sets accountSize (balance before the trade) and retPct on every trade.
 * Balance = starting balance + deposits/withdrawals dated on or before the trade day + prior net P&L.
 */
export function annotateAccount<T extends Trade>(trades: T[], start: number, cashflows: Cashflow[] = []): T[] {
  const flows = [...cashflows].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  const sorted = [...trades].sort((a, b) => a.entry_at.localeCompare(b.entry_at));
  let bal = start;
  let fi = 0;
  const out = new Map<string, { accountSize: number; retPct: number }>();
  for (const t of sorted) {
    const d = dayKey(t.entry_at);
    while (fi < flows.length && flows[fi].occurred_on <= d) bal += Number(flows[fi++].amount);
    out.set(t.id, { accountSize: bal, retPct: bal ? (t.net_pnl / bal) * 100 : 0 });
    bal += t.net_pnl;
  }
  return trades.map((t) => ({ ...t, ...(out.get(t.id) ?? { accountSize: start, retPct: 0 }) }));
}

export function equityCurve(trades: Trade[], start: number) {
  const sorted = [...trades].sort((a, b) => a.entry_at.localeCompare(b.entry_at));
  let eq = start;
  let peak = start;
  let tilt = 0;
  return sorted.map((t, i) => {
    eq += t.net_pnl;
    peak = Math.max(peak, eq);
    tilt += t.tilt;
    return {
      i: i + 1,
      id: t.id,
      date: dayKey(t.entry_at),
      equity: +eq.toFixed(2),
      pnl: t.net_pnl,
      drawdown: peak ? +(((eq - peak) / peak) * 100).toFixed(2) : 0,
      tilt, // running sum of discipline points
    };
  });
}

/** Seven milestone tiers; each tier needs this share of the milestone goal. */
export const MILESTONE_LEVELS = ["Rookie", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Legend"] as const;
const LEVEL_SHARE = [0, 0.05, 0.15, 0.3, 0.5, 0.75, 1];
export function milestoneLevel(current: number, goal: number) {
  let level = 0;
  for (let i = 0; i < LEVEL_SHARE.length; i++) if (current >= LEVEL_SHARE[i] * goal) level = i;
  if (level === LEVEL_SHARE.length - 1) return { level: level + 1, name: MILESTONE_LEVELS[level], progress: 100 };
  const lo = LEVEL_SHARE[level] * goal;
  const hi = LEVEL_SHARE[level + 1] * goal;
  return { level: level + 1, name: MILESTONE_LEVELS[level], progress: Math.floor(((current - lo) / (hi - lo)) * 100) };
}

/** cashflow = net deposits minus withdrawals; ROI is net P&L over starting balance plus net cashflow. */
export function computeStats(trades: Trade[], startingBalance: number, cashflow = 0) {
  const wins = trades.filter(isWin);
  const losses = trades.filter(isLoss);
  const be = trades.filter(isBE);
  const net = sum(trades.map((t) => t.net_pnl));
  const grossWin = sum(wins.map((t) => t.net_pnl));
  const grossLoss = Math.abs(sum(losses.map((t) => t.net_pnl)));
  const profitFactor = grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0;
  const curve = equityCurve(trades, startingBalance);
  const maxDD = curve.length ? Math.abs(Math.min(0, ...curve.map((c) => c.drawdown))) : 0;

  const days = new Map<string, number>();
  trades.forEach((t) => days.set(dayKey(t.entry_at), (days.get(dayKey(t.entry_at)) ?? 0) + t.net_pnl));
  const dayVals = [...days.values()];
  const holds = trades.map((t) => t.holdMinutes).filter((x): x is number => x != null);
  const rs = trades.map((t) => t.r).filter((x): x is number => x != null);

  const sorted = [...trades].sort((a, b) => a.entry_at.localeCompare(b.entry_at));
  let weeks = 1;
  if (sorted.length > 1) {
    const span = new Date(sorted[sorted.length - 1].entry_at).getTime() - new Date(sorted[0].entry_at).getTime();
    weeks = Math.max(1, span / (7 * 864e5));
  }
  const invested = startingBalance + cashflow;
  const roi = invested ? (net / invested) * 100 : 0;
  const returnDD = maxDD ? roi / maxDD : roi;
  const sampleFactor = Math.min(1, trades.length / 100);
  const pfScore = Math.min(isFinite(profitFactor) ? profitFactor : 3, 3) / 3;
  const score = trades.length ? Math.max(0, Math.min(100, (Math.min(Math.max(returnDD, 0), 5) / 5) * 40 + pfScore * 40 + sampleFactor * 20)) : 0;

  const streak: ("W" | "L" | "B")[] = sorted.slice(-5).map((t) => (isWin(t) ? "W" : isLoss(t) ? "L" : "B"));

  const sqn = rs.length > 1 ? (avg(rs) / stdev(rs)) * Math.sqrt(Math.min(rs.length, 100)) : 0;

  return {
    count: trades.length,
    net,
    wins: wins.length,
    losses: losses.length,
    be: be.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    winRateNoBE: wins.length + losses.length ? (wins.length / (wins.length + losses.length)) * 100 : 0,
    avgPnl: avg(trades.map((t) => t.net_pnl)),
    avgWin: avg(wins.map((t) => t.net_pnl)),
    avgLoss: avg(losses.map((t) => t.net_pnl)),
    profitFactor,
    expectancy: avg(trades.map((t) => t.net_pnl)),
    avgR: avg(rs),
    totalR: sum(rs),
    biggestWin: wins.length ? Math.max(...wins.map((t) => t.net_pnl)) : 0,
    biggestLoss: losses.length ? Math.min(...losses.map((t) => t.net_pnl)) : 0,
    fees: sum(trades.map((t) => t.fees)),
    avgHoldMin: avg(holds),
    roi,
    maxDD,
    winDays: dayVals.filter((v) => v > 0).length,
    lossDays: dayVals.filter((v) => v < 0).length,
    tradingDays: dayVals.length,
    avgPerDay: dayVals.length ? net / dayVals.length : 0,
    perDay: dayVals.length ? trades.length / dayVals.length : 0,
    perWeek: trades.length / weeks,
    score,
    streak,
    sqn,
    followedPlanPct: trades.length ? (trades.filter((t) => t.followedPlan).length / trades.length) * 100 : 0,
    balance: invested + net,
    curve,
  };
}
export type Stats = ReturnType<typeof computeStats>;

export function stdev(a: number[]) {
  if (a.length < 2) return 0;
  const m = avg(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}

export function groupBy<K extends string | number>(trades: Trade[], key: (t: Trade) => K) {
  const m = new Map<K, Trade[]>();
  trades.forEach((t) => {
    const k = key(t);
    m.set(k, [...(m.get(k) ?? []), t]);
  });
  return m;
}

export function groupPerformance<K extends string | number>(trades: Trade[], key: (t: Trade) => K) {
  return [...groupBy(trades, key).entries()].map(([k, ts]) => {
    const w = ts.filter(isWin).length;
    const gw = sum(ts.filter(isWin).map((t) => t.net_pnl));
    const gl = Math.abs(sum(ts.filter(isLoss).map((t) => t.net_pnl)));
    return {
      key: String(k),
      trades: ts.length,
      wins: w,
      losses: ts.filter(isLoss).length,
      be: ts.filter(isBE).length,
      pnl: +sum(ts.map((t) => t.net_pnl)).toFixed(2),
      winRate: +((w / ts.length) * 100).toFixed(1),
      profitFactor: gl ? +(gw / gl).toFixed(2) : gw ? 99 : 0,
      avg: +avg(ts.map((t) => t.net_pnl)).toFixed(2),
    };
  });
}

export function consecutive(trades: Trade[]) {
  const sorted = [...trades].sort((a, b) => a.entry_at.localeCompare(b.entry_at));
  const winRuns: Record<number, number> = {};
  const lossRuns: Record<number, number> = {};
  let cur = 0;
  let type: "w" | "l" | null = null;
  const flush = () => {
    if (!type || !cur) return;
    const target = type === "w" ? winRuns : lossRuns;
    target[cur] = (target[cur] ?? 0) + 1;
  };
  sorted.forEach((t) => {
    const ty = isWin(t) ? "w" : isLoss(t) ? "l" : null;
    if (ty === type) cur++;
    else {
      flush();
      type = ty;
      cur = ty ? 1 : 0;
    }
  });
  flush();
  const max = Math.max(1, ...Object.keys(winRuns).map(Number), ...Object.keys(lossRuns).map(Number));
  return Array.from({ length: max }, (_, i) => ({ run: i + 1, winners: winRuns[i + 1] ?? 0, losers: lossRuns[i + 1] ?? 0 }));
}

export function fmtMoney(v: number, currency = "USD") {
  if (!isFinite(v)) return "∞";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
}
export const fmtPct = (v: number) => `${isFinite(v) ? v.toFixed(2) : "∞"}%`;
export const fmtNum = (v: number, d = 2) => (isFinite(v) ? v.toFixed(d) : "∞");
export function fmtHold(min: number) {
  return `${(min / 60).toFixed(1)}h / ${(min / 1440).toFixed(1)}d / ${Math.round(min).toLocaleString()}m`;
}
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Fixed-order buckets (weekday, hour, month…) with P&L and win/loss/BE counts; empty buckets included. */
export function bucketPerformance<K extends string | number>(trades: Trade[], key: (t: Trade) => K, keys: { k: K; label: string }[]) {
  return keys.map(({ k, label }) => {
    const ts = trades.filter((t) => key(t) === k);
    return {
      key: label,
      trades: ts.length,
      wins: ts.filter(isWin).length,
      losses: ts.filter(isLoss).length,
      be: ts.filter(isBE).length,
      pnl: +sum(ts.map((t) => t.net_pnl)).toFixed(2),
    };
  });
}
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
