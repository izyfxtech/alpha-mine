import type { Trade } from "@/lib/pnl/metrics";
import { dirOf, grossPnl, rMultiple, riskMoney, rewardRisk } from "@/lib/pnl/calc";

export interface OpenRow {
  trade: Trade;
  dir: 1 | -1;
  /** Money at risk if the stop is hit (null without a stop, or when the money cannot be worked out). */
  risk: number | null;
  /** Notional exposure at entry. */
  exposure: number;
  /** Money made if the target is hit / lost if the stop is hit. */
  atTarget: number | null;
  atStop: number | null;
  plannedRR: number | null;
  /** Unrealised result at the supplied price (null until a price is given). */
  unrealized: number | null;
  unrealizedR: number | null;
  ageDays: number;
}

/** Same formulas as a closed trade (lib/pnl/calc.ts), so what-if numbers match what closing the trade would record. */
export function openRow(t: Trade, price: number | null, now = Date.now()): OpenRow {
  const spec = t.spec ?? null,
    account = t.account ?? null;
  const at = (p: unknown) => (p == null ? null : grossPnl(t, spec, account, p));
  const hasPrice = price != null && Number.isFinite(price);
  const size = spec && spec.contractSize > 0 ? spec.contractSize : 1;
  return {
    trade: t,
    dir: dirOf(t.direction),
    risk: riskMoney(t, spec, account),
    exposure: Math.abs(Number(t.entry_price) * Number(t.quantity) * size),
    atTarget: at(t.take_profit),
    atStop: at(t.stop_loss),
    plannedRR: rewardRisk(t),
    unrealized: hasPrice ? at(price) : null,
    unrealizedR: hasPrice ? rMultiple({ ...t, is_break_even: false }, price) : null,
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
