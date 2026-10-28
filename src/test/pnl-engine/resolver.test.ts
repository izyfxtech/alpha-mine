// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ImpliedRateProvider, RateResolver, D } from '../../../supabase/functions/_shared/pnl-engine/index.ts';
import { HOUR, StaticProvider, T0, ThrowingProvider } from './helpers.ts';

describe('RateResolver', () => {
  it('identity: same currency is exactly 1', async () => {
    const r = new RateResolver({ providers: [] });
    const o = await r.resolve('USD', 'USD', T0);
    expect(o!.rate.toString()).toBe('1');
    expect(o!.source).toBe('identity');
  });

  it('direct pair', async () => {
    const r = new RateResolver({ providers: [new StaticProvider('p', { GBPUSD: '1.30' })] });
    expect((await r.resolve('GBP', 'USD', T0))!.rate.toString()).toBe('1.3');
  });

  it('inverse pair is 1/rate and flagged derived with lineage', async () => {
    const r = new RateResolver({ providers: [new StaticProvider('p', { EURUSD: '1.25' })] });
    const o = (await r.resolve('USD', 'EUR', T0))!;
    expect(o.rate.toString()).toBe('0.8');
    expect(o.kind).toBe('derived');
    expect(o.lineage).toHaveLength(1);
  });

  it('triangulates through a pivot when no direct or inverse pair exists', async () => {
    const r = new RateResolver({ providers: [new StaticProvider('p', { EURUSD: '1.10', EURZAR: '20' })] });
    const o = (await r.resolve('USD', 'ZAR', T0))!; // USD->EUR (inverse) x EUR->ZAR
    expect(o.rate.toFixed(6)).toBe('18.181818');
    expect(o.kind).toBe('derived');
    expect(o.lineage).toHaveLength(2);
  });

  it('skips a pivot equal to an endpoint (no USD->USD->X loop)', async () => {
    const r = new RateResolver({ providers: [new StaticProvider('p', { EURZAR: '20' })], pivots: ['USD'] });
    expect(await r.resolve('USD', 'ZAR', T0)).toBeNull();
  });

  it('returns null rather than a stale rate', async () => {
    const p = new StaticProvider('p', { GBPUSD: '1.30' }, { lagMs: HOUR, maxStalenessMs: 60_000 });
    expect(await new RateResolver({ providers: [p] }).resolve('GBP', 'USD', T0)).toBeNull();
  });

  it('rejects look-ahead observations', async () => {
    const p = new StaticProvider('p', { GBPUSD: '1.30' }, { lagMs: -5000 });
    expect(await new RateResolver({ providers: [p] }).resolve('GBP', 'USD', T0)).toBeNull();
  });

  it('a chain is as stale as its stalest link', async () => {
    const r = new RateResolver({ providers: [new StaticProvider('p', { EURUSD: '1.10', EURZAR: '20' }, { lagMs: 1000 })] });
    const o = (await r.resolve('USD', 'ZAR', T0))!;
    expect(o.observedAtMs).toBe(T0 - 1000);
  });

  it('falls through to the next provider when one throws, and reports it', async () => {
    const errs: string[] = [];
    const r = new RateResolver({
      providers: [new ThrowingProvider(), new StaticProvider('backup', { GBPUSD: '1.30' })],
      onProviderError: (name) => errs.push(name),
    });
    const o = await r.resolve('GBP', 'USD', T0);
    expect(o!.source).toBe('backup');
    expect(errs).toEqual(['boom']);
  });

  it('honours provider priority: first able provider wins', async () => {
    const r = new RateResolver({
      providers: [new StaticProvider('best', { GBPUSD: '1.31' }), new StaticProvider('worse', { GBPUSD: '1.30' })],
    });
    expect((await r.resolve('GBP', 'USD', T0))!.source).toBe('best');
  });

  it('inversion swaps bid/ask', async () => {
    const bidProvider = {
      name: 'b',
      maxStalenessMs: 1000,
      get: async (base: string, quote: string, at: number) =>
        base === 'EUR' && quote === 'USD'
          ? { base, quote, rate: D('1.25'), observedAtMs: at, source: 'b', kind: 'tick' as const, side: 'bid' as const }
          : null,
    };
    const o = (await new RateResolver({ providers: [bidProvider] }).resolve('USD', 'EUR', T0))!;
    expect(o.side).toBe('ask');
  });
});

describe('ImpliedRateProvider', () => {
  const obs = (at: number, rate: string) => ({
    base: 'JPY',
    quote: 'USD',
    rate: D(rate),
    observedAtMs: at,
    source: 'x',
    kind: 'implied' as const,
    side: 'unspecified' as const,
  });

  it('returns the latest observation at or before the instant, even if recorded out of order', async () => {
    const p = new ImpliedRateProvider({ scope: 'a' });
    p.record(obs(T0 + 2000, '0.0066'));
    p.record(obs(T0 + 1000, '0.0065'));
    p.record(obs(T0 + 3000, '0.0067'));
    expect((await p.get('JPY', 'USD', T0 + 2500))!.rate.toString()).toBe('0.0066');
    expect((await p.get('JPY', 'USD', T0 + 500))).toBeNull();
    expect((await p.get('JPY', 'USD', T0 + 9999))!.rate.toString()).toBe('0.0067');
  });

  it('is empty for unseen pairs', async () => {
    expect(await new ImpliedRateProvider({ scope: 'a' }).get('EUR', 'USD', T0)).toBeNull();
  });
});
