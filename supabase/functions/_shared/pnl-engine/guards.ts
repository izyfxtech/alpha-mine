import type { ClosedTrade } from './types.ts';

/**
 * Cheap sanity checks that catch the most common bad-import symptoms before
 * they become wrong numbers on a dashboard. These add warnings; they never
 * silently "fix" data.
 */
export function calcSignOk(t: ClosedTrade, warnings: string[]): void {
  const digitsFactor = 10 ** Math.min(t.spec.digits, 8);
  const openScaled = t.openPrice.times(digitsFactor);
  if (!openScaled.eq(openScaled.toDecimalPlaces(0)) && t.spec.digits > 0) {
    // A price with more decimals than the broker's digits is a sign of a symbol/digits mapping error.
    warnings.push(`Open price has more decimals than the symbol's ${t.spec.digits} digits: check symbol mapping.`);
  }
  if (t.broker?.profit) {
    const moved = t.side === 'buy' ? t.closePrice.minus(t.openPrice) : t.openPrice.minus(t.closePrice);
    if (!moved.isZero() && moved.isPositive() !== t.broker.profit.isPositive() && !t.broker.profit.isZero()) {
      warnings.push('Broker profit sign contradicts price move: side or prices may be wrong.');
    }
  }
}
