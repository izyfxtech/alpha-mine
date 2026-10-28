import type { Dec } from '../decimal.ts';

/**
 * Where an observation sits on the accuracy ladder (best first):
 *  implied   - back-solved from the broker's own booked profit (exactly what the broker used)
 *  tick      - tick/quote-level market data
 *  minute    - 1-minute bars
 *  daily-fix - once-a-day central-bank reference rate
 *  derived   - inverted or triangulated from the above
 */
export type RateKind = 'implied' | 'tick' | 'minute' | 'daily-fix' | 'derived';
export type RateSide = 'mid' | 'bid' | 'ask' | 'unspecified';

/**
 * A rate observation: 1 unit of `base` is worth `rate` units of `quote`,
 * valid as of `observedAtMs` (UTC). Observations are immutable facts; persist
 * the one used for every conversion so historical P&L is reproducible and
 * auditable even if a vendor later revises its data.
 */
export interface RateObservation {
  base: string;
  quote: string;
  rate: Dec;
  observedAtMs: number;
  source: string;
  kind: RateKind;
  side: RateSide;
  /** For derived rates: the observations this one was built from. */
  lineage?: RateObservation[];
}

export interface RateProvider {
  readonly name: string;
  /**
   * Oldest observation (relative to the requested instant) this provider may
   * answer with. Beyond it, "no rate" is the honest answer: a 3-day-old rate
   * silently applied to a minute-resolution trade is worse than a flagged gap.
   */
  readonly maxStalenessMs: number;
  /**
   * Latest observation at or BEFORE `atMs` for 1 `base` in `quote`.
   * Must never look ahead of `atMs`. Return null if the pair is unsupported
   * or no observation exists inside the staleness window.
   */
  get(base: string, quote: string, atMs: number): Promise<RateObservation | null>;
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}
