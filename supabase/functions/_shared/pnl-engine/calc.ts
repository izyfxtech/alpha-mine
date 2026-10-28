/**
 * Pure P&L formulas. No I/O, no clocks, no rates: fully deterministic and the
 * easiest part of the engine to test exhaustively.
 *
 * Definitions (for spot FX, pair BASE/QUOTE):
 *   units       = lots x contractSize                       (units of BASE)
 *   priceDelta  = close - open        (buy)   |  open - close (sell)
 *   gross(Q)    = priceDelta x units                         (in QUOTE currency)
 *   pips        = priceDelta / pipSize
 *   pipValue(Q) = pipSize x units                            (in QUOTE currency per pip)
 *   gross(A)    = gross(Q) x rate(Q -> A)                    (A = account currency)
 */
import type { Dec } from './decimal.ts';
import type { InstrumentSpec, Side } from './types.ts';

export function priceDelta(side: Side, open: Dec, close: Dec): Dec {
  return side === 'buy' ? close.minus(open) : open.minus(close);
}

export function unitsOf(spec: InstrumentSpec, lots: Dec): Dec {
  return lots.times(spec.contractSize);
}

/** Raw result in the instrument's profit currency (quote currency for FX). */
export function grossInProfitCurrency(spec: InstrumentSpec, side: Side, lots: Dec, open: Dec, close: Dec): Dec {
  return priceDelta(side, open, close).times(unitsOf(spec, lots));
}

/** Pips gained (negative = lost). null when the instrument has no meaningful pip. */
export function pipsMoved(spec: InstrumentSpec, side: Side, open: Dec, close: Dec): Dec | null {
  if (!spec.pipSize) return null;
  return priceDelta(side, open, close).div(spec.pipSize);
}

/** Money value of one pip for this position size, in the profit currency. */
export function pipValueInProfitCurrency(spec: InstrumentSpec, lots: Dec): Dec | null {
  if (!spec.pipSize) return null;
  return spec.pipSize.times(unitsOf(spec, lots));
}

/** Price move in broker points (works for every instrument kind). */
export function pointsMoved(spec: InstrumentSpec, side: Side, open: Dec, close: Dec): Dec {
  return priceDelta(side, open, close).div(spec.pointSize);
}
