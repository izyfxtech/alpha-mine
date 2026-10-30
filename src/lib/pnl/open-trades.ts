import { riskOf, type Trade } from "@/lib/pnl/metrics";

export interface OpenRow {
  trade: Trade;
  dir: 1 | -1;
  /** Money at risk if the stop is hit (null without a stop or risk amount). */
  risk: number | null;
  /** Notional exposure at entry. */
  exposure: number;
  /** Money made if the target is hit, and the planned reward:risk. */
  atTarget: number | null;
  atStop: number | null;
  plannedRR: number | null;
  /** Unrealised result at the supplied price (null until a price is given). */
  unrealized: number | null;
  unrealizedR: number | null;
  ageDays: number;
}

const move = (t: Trade, price: number) => (price - Number(t.entry_price)) * Number(t.quantity) * (t.direction === "short" ? -1 : 1);

/** Same price formula as the journal trigger, so what-if numbers match what closing the trade would record. */
export function openRow(t: Trade, price: number | null, now = Date.now()): OpenRow {
  const risk = riskOf(t);
  const atTarget = t.take_profit != null ? move(t, Number(t.take_profit)) : null;
  const atStop = t.stop_loss != null ? move(t, Number(t.stop_loss)) : null;
  const unrealized = price != null && Number.isFinite(price) ? move(t, price) : null;
  return {
    trade: t, dir: t.direction === "short" ? -1 : 1, risk,
    exposure: Math.abs(Number(t.entry_price) * Number(t.quantity)),
    atTarget, atStop,
    plannedRR: risk && atTarget != null ? atTarget / risk : null,
    unrealized, unrealizedR: unrealized != null && risk ? unrealized / risk : null,
    ageDays: Math.max(0, (now - new Date(t.entry_at).getTime()) / 86400000),
  };
}

export function openTotals(rows: OpenRow[]) {
  const sum = (f: (r: OpenRow) => number | null) => rows.reduce((s, r) => s + (f(r) ?? 0), 0);
  return {
    n: rows.length,
    risk: sum((r) => r.risk),
    unpriced: rows.filter((r) => r.risk == null).length,
    exposure: sum((r) => r.exposure),
    unrealized: rows.some((r) => r.unrealized != null) ? sum((r) => r.unrealized) : null,
  };
}
