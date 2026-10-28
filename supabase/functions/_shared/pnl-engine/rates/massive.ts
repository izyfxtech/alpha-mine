import { D } from '../decimal.ts';
import { DEFAULT_TIMEOUT_MS, defaultFetch, isRetryable, sleep, type FetchLike } from './http.ts';
import { ProviderError, type RateObservation, type RateProvider } from './types.ts';

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

interface Bar {
  t: number;
  o: number;
  c: number;
}

/**
 * 1-minute FX bars from Massive (formerly Polygon.io).
 *
 * VERIFIED from Massive's API reference:
 *   GET https://api.massive.com/v2/aggs/ticker/C:EURUSD/range/1/minute/{from}/{to}
 *   from/to accept YYYY-MM-DD or millisecond timestamps; limit max 50000.
 *   results[]: { o, h, l, c, v, t (bar START, unix ms), n?, vw? }
 *   Bars are built from quoted bid/ask (not trades). A minute with no quotes has no bar.
 *   Plans: Currencies Basic = free, EOD only, 2y history. Starter = all history (to Sep 2009).
 *   Minute history therefore needs a paid plan; confirm current terms before relying on it.
 *
 * NOT confirmed by the docs: whether bar prices are bid, ask or mid. Side is
 * therefore labelled 'unspecified'. If side matters to you, validate against a
 * broker feed once and record the finding.
 *
 * No look-ahead rule. For an instant `at` inside bar B (start t, t <= at < t+60s)
 * we use B.open: the price at the start of the minute, which was knowable at
 * `at`. If `at` is past a completed bar with no bar after it (a quote gap), we
 * use that bar's close, observed at t+60s.
 *
 * Bars are fetched and cached by whole UTC hour, which amortises API calls
 * across trades. The current (incomplete) hour is never cached.
 */
export class MassiveMinuteProvider implements RateProvider {
  readonly name = 'massive-1m';
  readonly maxStalenessMs: number;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly auth: 'header' | 'query';
  private readonly nowFn: () => number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly hourCache = new Map<string, Bar[]>();

  constructor(o: {
    apiKey: string;
    baseUrl?: string;
    fetchImpl?: FetchLike;
    /** 'header' sends Authorization: Bearer; 'query' sends ?apiKey=. Docs show query; Bearer is also accepted by the Polygon-compatible API. */
    auth?: 'header' | 'query';
    maxStalenessMs?: number;
    now?: () => number;
    maxRetries?: number;
    /** Per request timeout. Default 10s. */
    timeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
  }) {
    if (!o.apiKey) throw new Error('MassiveMinuteProvider: apiKey required');
    this.apiKey = o.apiKey;
    this.baseUrl = (o.baseUrl ?? 'https://api.massive.com').replace(/\/$/, '');
    this.fetchImpl = o.fetchImpl ?? defaultFetch;
    this.auth = o.auth ?? 'header';
    this.maxStalenessMs = o.maxStalenessMs ?? 15 * MINUTE_MS;
    this.nowFn = o.now ?? Date.now;
    this.maxRetries = o.maxRetries ?? 2;
    this.timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sleepFn = o.sleep ?? sleep;
  }

  async get(base: string, quote: string, atMs: number): Promise<RateObservation | null> {
    const ticker = `C:${base}${quote}`;
    const lastHour = Math.floor(atMs / HOUR_MS) * HOUR_MS;
    const hoursBack = Math.ceil(this.maxStalenessMs / HOUR_MS) + 1;

    for (let k = 0; k <= hoursBack; k++) {
      const bars = await this.hourBars(ticker, lastHour - k * HOUR_MS);
      // bars are ascending; find the last bar starting at or before atMs
      let pick: Bar | undefined;
      for (let i = bars.length - 1; i >= 0; i--) {
        if (bars[i]!.t <= atMs) {
          pick = bars[i];
          break;
        }
      }
      if (!pick) continue;
      const inside = atMs - pick.t < MINUTE_MS;
      const observedAtMs = inside ? pick.t : pick.t + MINUTE_MS;
      if (atMs - observedAtMs > this.maxStalenessMs) return null;
      return {
        base,
        quote,
        rate: D(inside ? pick.o : pick.c),
        observedAtMs,
        source: this.name,
        kind: 'minute',
        side: 'unspecified',
      };
    }
    return null;
  }

  private async hourBars(ticker: string, hourStart: number): Promise<Bar[]> {
    const key = `${ticker}@${hourStart}`;
    const cached = this.hourCache.get(key);
    if (cached) return cached;

    const url =
      `${this.baseUrl}/v2/aggs/ticker/${ticker}/range/1/minute/${hourStart}/${hourStart + HOUR_MS - 1}` +
      `?adjusted=true&sort=asc&limit=50000` +
      (this.auth === 'query' ? `&apiKey=${encodeURIComponent(this.apiKey)}` : '');
    const headers: Record<string, string> = this.auth === 'header' ? { Authorization: `Bearer ${this.apiKey}` } : {};

    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (err) {
        if (attempt >= this.maxRetries) throw new ProviderError(this.name, `network error for ${ticker}`, err);
        await this.sleepFn(500 * 2 ** attempt);
        continue;
      }
      if (res.ok) {
        const body = (await res.json()) as { results?: Array<{ t?: number; o?: number; c?: number }> };
        const bars: Bar[] = (body.results ?? [])
          .filter((r): r is Bar => typeof r.t === 'number' && typeof r.o === 'number' && typeof r.c === 'number')
          .sort((a, b) => a.t - b.t);
        if (hourStart + HOUR_MS <= this.nowFn()) this.hourCache.set(key, bars); // only complete hours
        return bars;
      }
      if (res.status === 404) return [];
      if (isRetryable(res.status) && attempt < this.maxRetries) {
        await this.sleepFn(500 * 2 ** attempt);
        continue;
      }
      // 401/403 = key/plan problem: surface loudly, do not paper over with an empty answer.
      throw new ProviderError(this.name, `HTTP ${res.status} for ${ticker}`);
    }
  }
}
