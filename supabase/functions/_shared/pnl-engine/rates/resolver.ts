import { ONE } from '../decimal.ts';
import type { RateObservation, RateProvider } from './types.ts';

export interface ResolverOptions {
  /** Priority order: most accurate first. The first provider able to price the pair wins. */
  providers: RateProvider[];
  /**
   * Intermediate currencies for triangulation, tried in order. USD first
   * (deepest liquidity), then EUR. A currency equal to either endpoint is skipped.
   */
  pivots?: string[];
  /** Called when a provider throws (network, auth, quota). The resolver then falls through to the next provider. */
  onProviderError?: (provider: string, err: unknown) => void;
}

const sameInstant = (a: number, b: number) => a === b;

/**
 * Answers: "what is 1 FROM worth in TO at instant t?"
 *
 * Order of attempts, per provider (providers are NOT mixed within one answer,
 * so both legs of a triangulation share a timestamp basis):
 *   1. identity                  (FROM === TO)
 *   2. direct pair   FROM/TO
 *   3. inverse pair  TO/FROM  -> 1/rate
 *   4. triangulation FROM -> pivot -> TO, each leg direct or inverse
 */
export class RateResolver {
  private readonly providers: RateProvider[];
  private readonly pivots: string[];
  private readonly onErr: (provider: string, err: unknown) => void;

  constructor(opts: ResolverOptions) {
    this.providers = opts.providers;
    this.pivots = (opts.pivots ?? ['USD', 'EUR']).map((c) => c.toUpperCase());
    this.onErr = opts.onProviderError ?? (() => undefined);
  }

  async resolve(from: string, to: string, atMs: number): Promise<RateObservation | null> {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) {
      return { base: f, quote: t, rate: ONE, observedAtMs: atMs, source: 'identity', kind: 'derived', side: 'mid' };
    }
    for (const p of this.providers) {
      try {
        const hit = await this.viaProvider(p, f, t, atMs);
        if (hit) return hit;
      } catch (err) {
        this.onErr(p.name, err);
      }
    }
    return null;
  }

  private async viaProvider(p: RateProvider, f: string, t: string, atMs: number): Promise<RateObservation | null> {
    const direct = await this.directOrInverse(p, f, t, atMs);
    if (direct) return direct;

    for (const pivot of this.pivots) {
      if (pivot === f || pivot === t) continue;
      const leg1 = await this.directOrInverse(p, f, pivot, atMs);
      if (!leg1) continue;
      const leg2 = await this.directOrInverse(p, pivot, t, atMs);
      if (!leg2) continue;
      return {
        base: f,
        quote: t,
        rate: leg1.rate.times(leg2.rate),
        // A chain is only as fresh as its stalest link.
        observedAtMs: Math.min(leg1.observedAtMs, leg2.observedAtMs),
        source: p.name,
        kind: 'derived',
        side: leg1.side === leg2.side ? leg1.side : 'unspecified',
        lineage: [leg1, leg2],
      };
    }
    return null;
  }

  private async directOrInverse(p: RateProvider, f: string, t: string, atMs: number): Promise<RateObservation | null> {
    const d = await this.fetchChecked(p, f, t, atMs);
    if (d) return d;
    const i = await this.fetchChecked(p, t, f, atMs);
    if (!i) return null;
    return {
      base: f,
      quote: t,
      rate: ONE.div(i.rate),
      observedAtMs: i.observedAtMs,
      source: i.source,
      kind: 'derived',
      // Inverting swaps bid<->ask.
      side: i.side === 'bid' ? 'ask' : i.side === 'ask' ? 'bid' : i.side,
      lineage: [i],
    };
  }

  /** Enforce the provider contract: positive rate, no look-ahead, inside staleness window. */
  private async fetchChecked(p: RateProvider, b: string, q: string, atMs: number): Promise<RateObservation | null> {
    const o = await p.get(b, q, atMs);
    if (!o) return null;
    if (!o.rate.isFinite() || o.rate.lte(0)) return null;
    if (o.observedAtMs > atMs && !sameInstant(o.observedAtMs, atMs)) return null; // look-ahead
    if (atMs - o.observedAtMs > p.maxStalenessMs) return null;
    return o;
  }
}
