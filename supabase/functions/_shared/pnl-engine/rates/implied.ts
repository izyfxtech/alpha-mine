import { D, Dec, type DecimalLike } from '../decimal.ts';
import type { InstrumentSpec, Side } from '../types.ts';
import type { RateObservation, RateProvider } from './types.ts';

export interface ImpliedRateInput {
  spec: InstrumentSpec;
  side: Side;
  lots: DecimalLike;
  openPrice: DecimalLike;
  closePrice: DecimalLike;
  /** Broker's GROSS profit for the trade in account currency (MT5 DEAL_PROFIT; MT4 OrderProfit()). Excludes swap/commission. */
  brokerProfit: DecimalLike;
  accountCurrency: string;
  closeTimeMs: number;
  source: string;
  /** Below this absolute profit the broker's 2-dp rounding makes the back-solved rate too noisy. Default 5 account units (<= ~0.1% error). */
  minAbsProfit?: DecimalLike;
}

/**
 * Back-solve the exact conversion rate the broker applied:
 *
 *   brokerProfit(account) = priceDelta * units * rate(profitCcy -> account)
 *   =>  rate = brokerProfit / (priceDelta * units)
 *
 * This is the most accurate rate source available because it IS the broker's
 * number, at the broker's timestamp, with the broker's spread baked in, and it
 * costs nothing. Returns null when the trade teaches us nothing (profit already
 * in account currency, zero move, or too small to back-solve cleanly).
 */
export function deriveImpliedRate(i: ImpliedRateInput): RateObservation | null {
  if (i.spec.profitCurrency === i.accountCurrency.toUpperCase()) return null;
  const open = D(i.openPrice);
  const close = D(i.closePrice);
  const delta = i.side === 'buy' ? close.minus(open) : open.minus(close);
  const gross = delta.times(D(i.lots)).times(i.spec.contractSize);
  const profit = D(i.brokerProfit);
  const floor = D(i.minAbsProfit ?? 5);
  if (gross.isZero() || profit.abs().lt(floor)) return null;
  const rate = profit.div(gross);
  if (!rate.isFinite() || rate.lte(0)) return null; // sign mismatch = bad data, learn nothing
  return {
    base: i.spec.profitCurrency,
    quote: i.accountCurrency.toUpperCase(),
    rate,
    observedAtMs: i.closeTimeMs,
    source: i.source,
    kind: 'implied',
    side: 'unspecified',
  };
}

/**
 * Rates learned from the broker's own booked trades, scoped to ONE broker
 * account (different brokers apply different conversion quotes).
 *
 * In production, back this with a table (see the plan's SQL) and a
 * binary-search/index lookup; the in-memory version here is the reference.
 */
export class ImpliedRateProvider implements RateProvider {
  readonly name: string;
  readonly maxStalenessMs: number;
  private readonly series = new Map<string, RateObservation[]>();

  constructor(opts: { scope: string; maxStalenessMs?: number }) {
    this.name = `implied:${opts.scope}`;
    // 30 min default: conversion rates drift ~0.1-0.3% in that window on majors.
    this.maxStalenessMs = opts.maxStalenessMs ?? 30 * 60_000;
  }

  record(obs: RateObservation): void {
    const key = `${obs.base}/${obs.quote}`;
    const arr = this.series.get(key) ?? [];
    // keep sorted by time; insertion is O(n) but trades arrive roughly in order
    let idx = arr.length;
    while (idx > 0 && arr[idx - 1]!.observedAtMs > obs.observedAtMs) idx--;
    arr.splice(idx, 0, obs);
    this.series.set(key, arr);
  }

  async get(base: string, quote: string, atMs: number): Promise<RateObservation | null> {
    const arr = this.series.get(`${base}/${quote}`);
    if (!arr || arr.length === 0) return null;
    let lo = 0;
    let hi = arr.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid]!.observedAtMs <= atMs) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return best >= 0 ? arr[best]! : null;
  }

  /** Test/diagnostic helper. */
  size(): number {
    let n = 0;
    for (const a of this.series.values()) n += a.length;
    return n;
  }
}

export { Dec };
