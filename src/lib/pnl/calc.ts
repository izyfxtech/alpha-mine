import type { Spec } from "@/lib/pnl/instrument-catalogue";

/**
 * The trade maths, all of it, in one place.
 *
 *   R      = side x (exit - entry) / |entry - stop|           prices only: no lots, contract size or currency
 *   gross  = side x (exit - entry) x quantity x contract size  needs the instrument's class (instrument-catalogue.ts)
 *   net    = gross - (commission + swap + other fees)
 *
 * R is therefore identical for every instrument and exists for every trade that has an entry, an initial stop and an exit.
 * Money is converted to the account currency only when that is exact; otherwise it is null and the trader types it.
 */

const num = (v: unknown): number | null =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
export const dirOf = (direction: string): 1 | -1 => (direction === "short" ? -1 : 1);

/** Price move in the trade's favour (positive = profit). */
const priceMove = (direction: string, from: number, to: number) => (to - from) * dirOf(direction);

/** Distance from entry to the INITIAL stop. A stop on the profit side (moved past break-even) says nothing about the risk taken, so it gives null. */
function riskDistance(direction: string, entry: unknown, stop: unknown): number | null {
  const e = num(entry),
    s = num(stop);
  if (e == null || s == null || s <= 0) return null; // a stop of 0 means "none"
  const d = priceMove(direction, s, e);
  return d > 0 ? d : null;
}

/** The stop the trade was opened with: the saved initial stop, else the current one. Later trailing never changes R. */
const stopOf = (t: { initial_stop?: unknown; stop_loss?: unknown }) =>
  num(t.initial_stop) != null && (num(t.initial_stop) ?? 0) > 0 ? t.initial_stop : t.stop_loss;

export interface PricedTrade {
  direction: string;
  entry_price: unknown;
  stop_loss?: unknown;
  initial_stop?: unknown;
  exit_price?: unknown;
  take_profit?: unknown;
  is_break_even?: boolean | null;
}

/** R of an exited trade, or of any price passed in (an open trade's what-if). Null when the stop or the price is missing. */
export function rMultiple(t: PricedTrade, at: unknown = t.exit_price): number | null {
  const risk = riskDistance(t.direction, t.entry_price, stopOf(t));
  const e = num(t.entry_price),
    x = num(at);
  if (risk == null || e == null || x == null) return null;
  if (t.is_break_even && at === t.exit_price) return 0;
  return priceMove(t.direction, e, x) / risk;
}

/** Why a closed trade has no R, in words for the UI. Null when it has one. */
export function rBlankReason(t: PricedTrade): string | null {
  if (rMultiple(t) != null) return null;
  const stop = num(stopOf(t));
  if (stop == null || stop <= 0) return "No stop loss";
  if (num(t.exit_price) == null) return "No exit price";
  return "Stop was moved to or past entry and the original stop was not recorded";
}

/** Planned reward : risk. Null unless there is a stop and a target on the winning side. */
export function rewardRisk(t: PricedTrade): number | null {
  const r = rMultiple(t, t.take_profit);
  return r != null && r > 0 ? r : null;
}

const stable = (c: string) => {
  const u = c.toUpperCase();
  return u === "USDT" || u === "USDC" ? "USD" : u;
};

/**
 * Account-currency money of a price move: move x quantity x contract size. Quote currency = account currency is direct;
 * account currency = the pair's base is divided by `refPrice`; anything else (EURGBP on a USD account) needs a rate we do not
 * have, so it is null rather than a guess. Stocks have no quote currency: they are in the account's own.
 */
function moneyValue(
  move: number,
  quantity: unknown,
  refPrice: unknown,
  spec: Spec | null | undefined,
  account: string | null | undefined,
): number | null {
  const q = num(quantity);
  if (!spec || !(spec.contractSize > 0) || q == null || q <= 0 || !Number.isFinite(move))
    return null;
  const raw = move * q * spec.contractSize;
  if (!spec.quoteCurrency) return raw;
  if (!account) return null;
  if (stable(spec.quoteCurrency) === stable(account)) return raw;
  const p = num(refPrice);
  if (spec.baseCurrency && stable(spec.baseCurrency) === stable(account) && p != null && p > 0)
    return raw / p;
  return null;
}

export interface MoneyTrade extends PricedTrade {
  quantity: unknown;
}

export function grossPnl(
  t: MoneyTrade,
  spec: Spec | null | undefined,
  account: string | null | undefined,
  at: unknown = t.exit_price,
): number | null {
  const e = num(t.entry_price),
    x = num(at);
  if (e == null || x == null) return null;
  const v = moneyValue(priceMove(t.direction, e, x), t.quantity, x, spec, account);
  return v == null ? null : +v.toFixed(2);
}

/** Money lost if the initial stop is hit (positive), or null without a valid stop or a way to value it. */
export function riskMoney(
  t: MoneyTrade,
  spec: Spec | null | undefined,
  account: string | null | undefined,
): number | null {
  const d = riskDistance(t.direction, t.entry_price, stopOf(t));
  if (d == null) return null;
  const v = moneyValue(d, t.quantity, t.entry_price, spec, account);
  return v == null ? null : +v.toFixed(2);
}
