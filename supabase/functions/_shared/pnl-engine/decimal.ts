/**
 * All money, price and rate arithmetic in the engine goes through this Decimal
 * clone. Never use JS `number` for P&L math: 0.1 + 0.2 !== 0.3, and the error
 * compounds across thousands of trades.
 *
 * Precision 40 significant digits is far beyond any broker's resolution, so
 * intermediates are effectively exact. We only round at the *presentation*
 * boundary (see roundMoney in currency.ts), never between steps.
 */
import { Decimal } from 'decimal.js';

export const Dec = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});
export type Dec = InstanceType<typeof Dec>;
export type DecimalLike = string | number | bigint | Dec;

/** Parse any numeric input into a Dec. Rejects NaN/Infinity loudly. */
export function D(v: DecimalLike): Dec {
  if (typeof v === 'bigint') return new Dec(v.toString());
  if (typeof v === 'number' && !Number.isFinite(v)) {
    throw new RangeError(`D(): non-finite number ${String(v)}`);
  }
  return new Dec(v);
}

export const ZERO = new Dec(0);
export const ONE = new Dec(1);

export function pow10(exp: number): Dec {
  return new Dec(10).pow(exp);
}
