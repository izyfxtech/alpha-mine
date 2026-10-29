// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  D,
  FrankfurterProvider,
  ImpliedRateProvider,
  MassiveMinuteProvider,
  PnlEngine,
  ProviderError,
  RateResolver,
  UnsupportedInstrumentError,
  inferInstrument,
  type ClosedTrade,
  type FetchLike,
} from '@engine/index.ts';
import { StaticProvider } from './helpers.ts';

const T0 = Date.UTC(2026, 9, 22, 12, 0, 0);
const T1 = Date.UTC(2026, 9, 22, 13, 0, 0);
const usdjpy = inferInstrument('USDJPY', { digits: 3, contractSize: 100000 });
const eurusd = inferInstrument('EURUSD', { digits: 5, contractSize: 100000 });

const jpy = (over: Partial<ClosedTrade> = {}): ClosedTrade => ({
  id: 't', spec: usdjpy, side: 'buy', lots: D(1), openPrice: D('150.000'), closePrice: D('150.500'),
  openTimeMs: T0, closeTimeMs: T1, accountCurrency: 'USD', ...over,
});
const resolver = (table: Record<string, string>) => new RateResolver({ providers: [new StaticProvider('ext', table)] });

describe('fix 1: circular validation is refused', () => {
  it('throws when implied is set without validationRates', () => {
    const implied = new ImpliedRateProvider({ scope: 's' });
    expect(() => new PnlEngine({ rates: resolver({}), implied })).toThrow(/validationRates/);
  });
  it('accepts implied together with validationRates', () => {
    const implied = new ImpliedRateProvider({ scope: 's' });
    expect(() => new PnlEngine({ rates: resolver({}), implied, validationRates: resolver({}) })).not.toThrow();
  });
});

describe('fix 2: provider requests are time limited', () => {
  const hangingFetch: FetchLike = (_url, init) =>
    new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));

  it('passes an AbortSignal on every request', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const f: FetchLike = async (_u, init) => { seen.push(init?.signal); return { ok: true, status: 200, json: async () => ({ date: '2026-10-22', rate: 150.5 }) }; };
    await new FrankfurterProvider({ fetchImpl: f }).get('USD', 'JPY', T1);
    expect(seen[0]).toBeInstanceOf(AbortSignal);
  });
  it('Frankfurter gives up on a hung socket instead of waiting forever', async () => {
    const p = new FrankfurterProvider({ fetchImpl: hangingFetch, timeoutMs: 20, maxRetries: 0 });
    await expect(p.get('USD', 'JPY', T1)).rejects.toBeInstanceOf(ProviderError);
  });
  it('Massive gives up on a hung socket instead of waiting forever', async () => {
    const p = new MassiveMinuteProvider({ apiKey: 'k', fetchImpl: hangingFetch, timeoutMs: 20, maxRetries: 0 });
    await expect(p.get('USD', 'JPY', T1)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('fix 3: the entry-time rate behind R is returned', () => {
  it('exposes openConversion alongside plannedRisk', async () => {
    const eng = new PnlEngine({ rates: resolver({ USDJPY: '150.0' }) });
    const r = await eng.computeClosed(jpy({ stopLoss: D('149.500') }));
    expect(r.plannedRisk).not.toBeNull();
    expect(r.openConversion?.base).toBe('JPY');
    expect(r.openConversion?.rate.toFixed(8)).toBe(D(1).div(150).toFixed(8));
  });
  it('is null without a stop loss', async () => {
    const r = await new PnlEngine({ rates: resolver({ USDJPY: '150.0' }) }).computeClosed(jpy());
    expect(r.openConversion).toBeNull();
  });
});

describe('fix 4: implied rates are learned only from trades we can trust', () => {
  const build = (rates: RateResolver) => {
    const implied = new ImpliedRateProvider({ scope: 's' });
    return { implied, eng: new PnlEngine({ rates, implied, validationRates: rates }) };
  };
  it('learns from an OK trade', async () => {
    const { implied, eng } = build(resolver({ USDJPY: '150.5' }));
    expect((await eng.computeClosed(jpy({ broker: { profit: D('332.00') } }))).reconciliation!.status).toBe('OK');
    expect(implied.size()).toBe(1);
  });
  it('does NOT learn from a WARN trade that has an independent figure', async () => {
    const { implied, eng } = build(resolver({ USDJPY: '150.5' }));
    expect((await eng.computeClosed(jpy({ broker: { profit: D('335.00') } }))).reconciliation!.status).toBe('WARN');
    expect(implied.size()).toBe(0);
  });
  it('still learns when no independent rate exists to check against', async () => {
    const { implied, eng } = build(new RateResolver({ providers: [] }));
    const r = await eng.computeClosed(jpy({ broker: { profit: D('332.00') } }));
    expect(r.reconciliation!.status).toBe('WARN');
    expect(implied.size()).toBe(1);
  });
});

describe('fix 5: instruments that are not currency pairs', () => {
  it('keeps US500 whole instead of slicing "US5" / "00"', () => {
    const s = inferInstrument('US500', { digits: 1, profitCurrency: 'USD', contractSize: 1 });
    expect([s.kind, s.base, s.quote, s.profitCurrency]).toEqual(['cfd', 'US500', 'USD', 'USD']);
  });
  it('requires a profit currency for an explicit index', () => {
    expect(() => inferInstrument('GER40', { digits: 1, kind: 'index', contractSize: 1 })).toThrow(UnsupportedInstrumentError);
  });
  it('parses four letter crypto codes', () => {
    const d = inferInstrument('DOGEUSD', { digits: 5 });
    expect([d.kind, d.base, d.quote]).toEqual(['crypto', 'DOGE', 'USD']);
    const b = inferInstrument('BTCUSDT', { digits: 2 });
    expect([b.base, b.quote, b.profitCurrency]).toEqual(['BTC', 'USDT', 'USDT']);
  });
  it('still handles broker suffixes and ordinary pairs', () => {
    expect(inferInstrument('EURUSDm', { digits: 5 }).quote).toBe('USD');
    expect(inferInstrument('XAUUSD.a', { digits: 2 }).kind).toBe('metal');
    expect(inferInstrument('USDCAD', { digits: 5 }).base).toBe('USD');
  });
});

describe('fix 6: one bad row does not abort a batch', () => {
  it('returns an error entry for the bad trade and results for the rest, in order', async () => {
    const eng = new PnlEngine({ rates: resolver({ USDJPY: '150.5' }) });
    const out = await eng.computeMany([jpy({ id: 'a' }), jpy({ id: 'bad', lots: D(0) }), jpy({ id: 'c', spec: eurusd, openPrice: D('1.085'), closePrice: D('1.09') })]);
    expect(out.map((o) => o.tradeId)).toEqual(['a', 'bad', 'c']);
    expect('result' in out[0]!).toBe(true);
    expect(out[1]).toMatchObject({ error: expect.stringMatching(/lots must be > 0/) });
    expect('result' in out[2]!).toBe(true);
  });
});
