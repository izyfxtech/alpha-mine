import { D, Dec, pow10 } from './decimal.ts';
import { minorUnits } from './currency.ts';
import type { RateObservation } from './rates/types.ts';

export type ReconStatus = 'OK' | 'WARN' | 'MISMATCH';

export interface Tolerance {
  /** Flat allowance in account currency (covers the broker's own rounding). */
  absolute: Dec;
  /** Fraction of |imported| (covers conversion-rate differences between sources). */
  relative: Dec;
}

export interface Reconciliation {
  status: ReconStatus;
  imported: Dec;
  computed: Dec | null;
  diff: Dec | null;
  allowed: Dec;
  /** Ordered, human-readable hypotheses for a failed match. Surface these in the UI. */
  diagnosis: string[];
  /** Rate source the independent calculation relied on. */
  rateSource: string | null;
}

/**
 * Relative tolerance by rate quality. The broker converted at its own quote at
 * its own instant; our independent calculation can only approximate that, and
 * how closely depends on the source:
 *   identity  - no conversion involved: only broker rounding differs
 *   tick/minute/implied - sub-0.5% on majors
 *   daily-fix - a whole day's move in the quote currency
 * A chain (inversion/triangulation) is as loose as its loosest leg.
 */
export function relativeToleranceFor(obs: RateObservation | null): Dec {
  if (!obs) return D('0.003');
  if (obs.source === 'identity') return D('0.0001');
  if (obs.lineage && obs.lineage.length > 0) {
    return obs.lineage.map(relativeToleranceFor).reduce((a, b) => (a.gt(b) ? a : b));
  }
  switch (obs.kind) {
    case 'daily-fix':
      return D('0.015');
    case 'tick':
      return D('0.002');
    case 'minute':
    case 'implied':
    case 'derived':
      return D('0.003');
  }
}

/** Absolute floor: five minor units of the account currency (0.05 USD, 5 JPY, 0.005 BHD). */
export function absoluteToleranceFor(accountCurrency: string): Dec {
  return D(5).times(pow10(-minorUnits(accountCurrency)));
}

export function reconcile(imported: Dec, computed: Dec | null, tol: Tolerance, rateSource: string | null = null): Reconciliation {
  const allowed = tol.absolute.plus(tol.relative.times(imported.abs()));
  if (computed === null) {
    return {
      status: 'WARN',
      imported,
      computed: null,
      diff: null,
      allowed,
      diagnosis: ['No independent rate available: broker figure stored unverified.'],
      rateSource,
    };
  }
  const diff = imported.minus(computed);
  const absDiff = diff.abs();
  let status: ReconStatus;
  if (absDiff.lte(allowed)) status = 'OK';
  else if (absDiff.lte(allowed.times(3))) status = 'WARN';
  else status = 'MISMATCH';
  return {
    status,
    imported,
    computed,
    diff,
    allowed,
    diagnosis: status === 'OK' ? [] : diagnose(imported, computed),
    rateSource,
  };
}

/** Heuristics that turn "numbers differ" into "here is probably why". */
export function diagnose(imported: Dec, computed: Dec): string[] {
  const out: string[] = [];
  if (imported.isZero()) {
    out.push('Broker profit is zero: this may be an opening deal, a balance operation, or a zero-move trade.');
    return out;
  }
  if (computed.isZero()) {
    out.push('Computed result is zero but broker booked a result: check open/close prices and symbol mapping.');
    return out;
  }
  const ratio = imported.div(computed);
  if (ratio.isNegative()) {
    out.push('Opposite signs: trade side (buy/sell) is probably reversed.');
  }
  const abs = ratio.abs();
  const log = Math.log10(abs.toNumber());
  const nearest = Math.round(log);
  if (nearest !== 0 && Math.abs(log - nearest) < 0.01) {
    out.push(
      `Ratio is ~10^${nearest}: contract size, lot unit (0.01 vs 1.0) or pip/digit scaling is off by a power of ten.`,
    );
  } else if (abs.gt('0.85') && abs.lt('1.15')) {
    out.push('Within ~15% but outside tolerance: conversion rate differs (stale source, wrong timestamp/timezone, or broker markup).');
  } else if (abs.gt('0.4') && abs.lt('2.5')) {
    out.push('Off by a factor between 0.4x and 2.5x: check lots, partial-close allocation, and whether the broker row is a full or partial close.');
  }
  if (out.length === 0) out.push('Unexplained: verify symbol mapping, contract size, lot units and timestamps.');
  return out;
}

export { Dec };
