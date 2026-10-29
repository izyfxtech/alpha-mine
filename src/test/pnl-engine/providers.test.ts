// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  FrankfurterProvider,
  MassiveMinuteProvider,
  ProviderError,
  RateResolver,
  type FetchLike,
  type HttpResponse,
} from '@engine/index.ts';

const ok = (body: unknown): HttpResponse => ({ ok: true, status: 200, json: async () => body });
const status = (s: number): HttpResponse => ({ ok: false, status: s, json: async () => ({}) });
const noSleep = async () => undefined;

describe('FrankfurterProvider (ECB daily fix)', () => {
  const row = (date: string, rate: number) => ({ date, base: 'USD', quote: 'JPY', rate });

  function stub(byDate: Record<string, number>) {
    const urls: string[] = [];
    const f: FetchLike = async (url) => {
      urls.push(url);
      const date = /date=(\d{4}-\d{2}-\d{2})/.exec(url)![1]!;
      const r = byDate[date];
      return r === undefined ? status(404) : ok(row(date, r));
    };
    return { f, urls };
  }

  it('Saturday -> uses Friday fixing, pinned to the ECB provider, v2 URL shape', async () => {
    const { f, urls } = stub({ '2026-10-23': 156.8 });
    const p = new FrankfurterProvider({ fetchImpl: f });
    const atMs = Date.UTC(2026, 9, 24, 10, 0, 0); // Saturday
    const o = (await p.get('USD', 'JPY', atMs))!;
    expect(urls[0]).toBe('https://api.frankfurter.dev/v2/rate/USD/JPY?date=2026-10-23&providers=ECB');
    expect(o.rate.toString()).toBe('156.8');
    expect(o.kind).toBe('daily-fix');
    expect(o.observedAtMs).toBe(Date.UTC(2026, 9, 23, 14, 0, 0)); // 16:00 CEST
  });

  it('before today\'s 16:00 CET fixing it must use the previous business day (no look-ahead)', async () => {
    const { f, urls } = stub({ '2026-10-23': 156.8, '2026-10-22': 156.0 });
    const p = new FrankfurterProvider({ fetchImpl: f });
    const o = (await p.get('USD', 'JPY', Date.UTC(2026, 9, 23, 10, 0, 0)))!; // Fri 10:00 UTC, fix at 14:00 UTC
    expect(urls[0]).toContain('date=2026-10-22');
    expect(o.rate.toString()).toBe('156');
  });

  it('after the fixing the same day is allowed', async () => {
    const { f } = stub({ '2026-10-23': 156.8 });
    const o = (await new FrankfurterProvider({ fetchImpl: f }).get('USD', 'JPY', Date.UTC(2026, 9, 23, 14, 0, 1)))!;
    expect(o.rate.toString()).toBe('156.8');
  });

  it('walks back over a holiday gap (404) to the last published day', async () => {
    const { f } = stub({ '2026-10-21': 155.5 }); // 22nd and 23rd missing
    const o = (await new FrankfurterProvider({ fetchImpl: f }).get('USD', 'JPY', Date.UTC(2026, 9, 23, 20, 0, 0)))!;
    expect(o.observedAtMs).toBe(Date.UTC(2026, 9, 21, 14, 0, 0));
  });

  it('returns null for an unsupported pair', async () => {
    const { f } = stub({});
    expect(await new FrankfurterProvider({ fetchImpl: f }).get('USD', 'XXX', Date.UTC(2026, 9, 23, 20, 0, 0))).toBeNull();
  });

  it('retries 429 with backoff then succeeds', async () => {
    let calls = 0;
    const f: FetchLike = async (url) => {
      calls++;
      return calls === 1 ? status(429) : ok(row(/date=(\S+?)&/.exec(url)![1]!, 156.8));
    };
    const o = await new FrankfurterProvider({ fetchImpl: f, sleep: noSleep }).get('USD', 'JPY', Date.UTC(2026, 9, 23, 20, 0, 0));
    expect(o!.rate.toString()).toBe('156.8');
    expect(calls).toBe(2);
  });

  it('throws ProviderError on persistent server errors', async () => {
    const f: FetchLike = async () => status(503);
    await expect(
      new FrankfurterProvider({ fetchImpl: f, sleep: noSleep }).get('USD', 'JPY', Date.UTC(2026, 9, 23, 20, 0, 0)),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('rejects malformed payloads instead of trusting them', async () => {
    const f: FetchLike = async () => ok({ date: '2026-10-23', rate: 'abc' });
    await expect(new FrankfurterProvider({ fetchImpl: f }).get('USD', 'JPY', Date.UTC(2026, 9, 23, 20, 0, 0))).rejects.toThrow(/unexpected response/);
  });

  it('caches per pair/date', async () => {
    const { f, urls } = stub({ '2026-10-23': 156.8 });
    const p = new FrankfurterProvider({ fetchImpl: f });
    await p.get('USD', 'JPY', Date.UTC(2026, 9, 23, 15, 0, 0));
    await p.get('USD', 'JPY', Date.UTC(2026, 9, 23, 18, 0, 0));
    expect(urls).toHaveLength(1);
  });
});

describe('MassiveMinuteProvider (1-minute bars)', () => {
  const base = Date.UTC(2026, 9, 23, 10, 5, 0);
  const bars = [
    { t: base, o: 1.1, c: 1.101, h: 1.102, l: 1.099, v: 10 },
    { t: base + 60_000, o: 1.101, c: 1.102, h: 1.103, l: 1.1, v: 12 },
  ];
  const now = () => Date.UTC(2026, 9, 26);

  function make(opts: { body?: unknown; resp?: HttpResponse } = {}) {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const f: FetchLike = async (url, init) => {
      calls.push({ url, ...(init?.headers ? { headers: init.headers } : {}) });
      return opts.resp ?? ok(opts.body ?? { status: 'OK', results: bars, resultsCount: bars.length });
    };
    return { p: new MassiveMinuteProvider({ apiKey: 'k', fetchImpl: f, now, sleep: noSleep }), calls };
  }

  it('inside a bar -> that bar\'s OPEN, observed at bar start (knowable at that instant)', async () => {
    const { p } = make();
    const o = (await p.get('EUR', 'USD', base + 30_000))!;
    expect(o.rate.toString()).toBe('1.1');
    expect(o.observedAtMs).toBe(base);
    expect(o.kind).toBe('minute');
  });

  it('just inside the next bar -> next bar\'s open', async () => {
    const { p } = make();
    expect((await p.get('EUR', 'USD', base + 60_010))!.rate.toString()).toBe('1.101');
  });

  it('after a quote gap -> last completed bar\'s CLOSE, observed at its end', async () => {
    const { p } = make();
    const o = (await p.get('EUR', 'USD', base + 150_000))!;
    expect(o.rate.toString()).toBe('1.102');
    expect(o.observedAtMs).toBe(base + 120_000);
  });

  it('never returns a bar that starts after the requested instant', async () => {
    const { p } = make();
    expect(await p.get('EUR', 'USD', base - 1)).toBeNull();
  });

  it('requests the right endpoint with bearer auth, and caches complete hours', async () => {
    const { p, calls } = make();
    await p.get('EUR', 'USD', base + 1000);
    await p.get('EUR', 'USD', base + 2000);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('https://api.massive.com/v2/aggs/ticker/C:EURUSD/range/1/minute/');
    expect(calls[0]!.url).toContain('sort=asc');
    expect(calls[0]!.headers).toEqual({ Authorization: 'Bearer k' });
  });

  it('does not cache the still-incomplete current hour', async () => {
    const calls: string[] = [];
    const f: FetchLike = async (url) => {
      calls.push(url);
      return ok({ results: bars });
    };
    const p = new MassiveMinuteProvider({ apiKey: 'k', fetchImpl: f, now: () => base + 120_000, sleep: noSleep });
    await p.get('EUR', 'USD', base + 1000);
    await p.get('EUR', 'USD', base + 2000);
    expect(calls).toHaveLength(2);
  });

  it('empty history -> null (honest gap, not a guess)', async () => {
    const { p } = make({ body: { status: 'OK', results: [], resultsCount: 0 } });
    expect(await p.get('EUR', 'USD', base)).toBeNull();
  });

  it('auth/plan failures surface as errors, and the resolver falls through', async () => {
    const { p } = make({ resp: status(403) });
    await expect(p.get('EUR', 'USD', base)).rejects.toBeInstanceOf(ProviderError);
    const seen: string[] = [];
    const r = new RateResolver({ providers: [p], onProviderError: (n) => seen.push(n) });
    expect(await r.resolve('EUR', 'USD', base)).toBeNull();
    expect(seen).toEqual(['massive-1m']);
  });

  it('requires an api key', () => {
    expect(() => new MassiveMinuteProvider({ apiKey: '' })).toThrow(/apiKey/);
  });
});
