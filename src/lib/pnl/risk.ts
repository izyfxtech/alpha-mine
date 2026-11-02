import { normalizeSymbol, splitKnownPair } from "@engine/instruments";
import { METAL_CODES, CRYPTO_CODES } from "@engine/currency";
import type { QuantityUnit } from "@/lib/pnl/asset-class";

/**
 * Planned risk (the money lost if the stop is hit) for ONE trade, so that R (= net result / planned risk) exists for every
 * trade that has a stop loss, whichever way it was entered.
 *
 * Order of trust:
 *   1. `risk_amount` as stored (the database for stocks, the P&L engine with real exchange rates for imports).
 *   2. Worked out here from the stop, for the cases that need no exchange-rate history:
 *        - units (stocks):     |entry - stop| x quantity
 *        - lots, forex pairs:  |entry - stop| x lots x contract size, in the quote currency; that is already the account
 *                              currency when the pair is quoted in it (EURUSD on a USD account) and is divided by the entry
 *                              price when the account currency is the pair's base (USDJPY on a USD account), which is
 *                              also what the engine does (entry-time rate).
 *   3. null. A cross pair that needs a third currency's rate, an unknown unit, a missing stop, or a stop that is not on
 *      the losing side (a trailed stop): R is left blank rather than guessed, as the P&L engine does.
 */
export interface RiskInput {
  risk_amount?: number | string | null;
  stop_loss?: number | string | null;
  entry_price: number | string;
  quantity: number | string;
  direction: string;
}
export interface RiskContext {
  symbol?: string | null;
  unit?: QuantityUnit | null;
  accountCurrency?: string | null;
}

const CONTRACT: Record<string, number> = { XAU: 100, XAG: 5000, XPT: 100, XPD: 100 };

/** Money value, in account currency, of a price move of `delta` (absolute) on `quantity`. */
export function moveValue(delta: number, quantity: number, entry: number, ctx: RiskContext): number | null {
  if (!Number.isFinite(delta) || !Number.isFinite(quantity) || quantity <= 0) return null;
  if (ctx.unit === "units") return delta * quantity;
  if (ctx.unit !== "lots" || !ctx.symbol) return null;
  const pair = splitKnownPair(normalizeSymbol(ctx.symbol));
  if (!pair) return null;
  const contract = CONTRACT[pair.base] ?? (METAL_CODES.has(pair.base) ? 100 : CRYPTO_CODES.has(pair.base) ? 1 : 100_000);
  const inQuote = delta * quantity * contract;
  const account = (ctx.accountCurrency ?? "").toUpperCase();
  if (!account) return null;
  if (pair.quote === account) return inQuote;
  if (pair.base === account && entry > 0) return inQuote / entry;
  return null;
}

export function plannedRisk(t: RiskInput, ctx: RiskContext = {}): number | null {
  const stored = t.risk_amount == null ? NaN : Number(t.risk_amount);
  if (Number.isFinite(stored) && stored > 0) return stored;
  if (t.stop_loss == null || t.stop_loss === "") return null;
  const stop = Number(t.stop_loss), entry = Number(t.entry_price), qty = Number(t.quantity);
  if (!Number.isFinite(stop) || !Number.isFinite(entry)) return null;
  const long = t.direction !== "short";
  if (long ? stop >= entry : stop <= entry) return null; // stop at or beyond break-even: the risk it once described is gone
  const v = moveValue(Math.abs(entry - stop), qty, entry, ctx);
  return v != null && v > 0 ? v : null;
}
