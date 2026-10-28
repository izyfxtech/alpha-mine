import { D, type RateKind, type RateObservation, type RateProvider } from '../../../supabase/functions/_shared/pnl-engine/index.ts';

/** Deterministic provider for tests: fixed pair table, controllable freshness. */
export class StaticProvider implements RateProvider {
  constructor(
    public readonly name: string,
    private readonly table: Record<string, string>,
    private readonly opts: { lagMs?: number; maxStalenessMs?: number; kind?: RateKind } = {},
  ) {}

  get maxStalenessMs(): number {
    return this.opts.maxStalenessMs ?? 5 * 60_000;
  }

  async get(base: string, quote: string, atMs: number): Promise<RateObservation | null> {
    const r = this.table[`${base}${quote}`];
    if (r === undefined) return null;
    return {
      base,
      quote,
      rate: D(r),
      observedAtMs: atMs - (this.opts.lagMs ?? 0),
      source: this.name,
      kind: this.opts.kind ?? 'minute',
      side: 'mid',
    };
  }
}

export class ThrowingProvider implements RateProvider {
  readonly name = 'boom';
  readonly maxStalenessMs = 1000;
  async get(): Promise<RateObservation | null> {
    throw new Error('provider down');
  }
}

export const T0 = Date.UTC(2026, 9, 23, 10, 0, 0); // Fri 23 Oct 2026 10:00 UTC
export const HOUR = 3_600_000;
