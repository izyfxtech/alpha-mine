import { D } from '../decimal.ts';
import { addDaysIso, ecbFixingUtcMs, isoDateUtc, isWeekendIso } from '../time.ts';
import { DEFAULT_TIMEOUT_MS, defaultFetch, isRetryable, sleep, type FetchLike } from './http.ts';
import { ProviderError, type RateObservation, type RateProvider } from './types.ts';

/**
 * ECB euro foreign exchange reference rates via the Frankfurter API (v2).
 *
 * VERIFIED against the live API (Oct 2026):
 *   GET {base}/v2/rate/{BASE}/{QUOTE}?date=YYYY-MM-DD&providers=ECB
 *   -> {"date":"2026-10-23","base":"USD","quote":"JPY","rate":156.8}
 *
 * What these rates are: one fixing per TARGET business day (~16:00 CET).
 * Fine for: reporting, EOD valuation, backfilling when nothing better exists.
 * Not fine for: intraday-accurate conversion. The error budget is a day's FX
 * move on the quote currency (typically 0.3-0.8% for majors; can be several
 * percent for volatile quote currencies). Use it as the LAST fallback and
 * label results with kind 'daily-fix' so the UI can show an "approximate" badge.
 *
 * Only ~30 currencies are covered; unsupported pairs return null.
 */
export class FrankfurterProvider implements RateProvider {
  readonly name = 'ecb-fix';
  /** Covers a long weekend plus a TARGET holiday. */
  readonly maxStalenessMs = 6 * 24 * 3600 * 1000;

  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly provider: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly cache = new Map<string, { date: string; rate: number } | null>();

  constructor(
    o: {
      baseUrl?: string;
      fetchImpl?: FetchLike;
      /** Frankfurter blends many central banks by default; pin to ECB for a single auditable source. */
      provider?: string;
      maxRetries?: number;
      /** Per request timeout. Default 10s. */
      timeoutMs?: number;
      sleep?: (ms: number) => Promise<void>;
    } = {},
  ) {
    this.baseUrl = (o.baseUrl ?? 'https://api.frankfurter.dev').replace(/\/$/, '');
    this.fetchImpl = o.fetchImpl ?? defaultFetch;
    this.provider = o.provider ?? 'ECB';
    this.maxRetries = o.maxRetries ?? 2;
    this.timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sleepFn = o.sleep ?? sleep;
  }

  async get(base: string, quote: string, atMs: number): Promise<RateObservation | null> {
    // Latest business day whose fixing has already happened at `atMs`.
    let date = isoDateUtc(atMs);
    if (atMs < ecbFixingUtcMs(date)) date = addDaysIso(date, -1);
    while (isWeekendIso(date)) date = addDaysIso(date, -1);

    for (let attempt = 0; attempt < 8; attempt++) {
      const row = await this.fetchDate(base, quote, date);
      if (row) {
        const observedAtMs = ecbFixingUtcMs(row.date);
        if (observedAtMs <= atMs) {
          return {
            base,
            quote,
            rate: D(row.rate),
            observedAtMs,
            source: this.name,
            kind: 'daily-fix',
            side: 'mid',
          };
        }
      }
      date = addDaysIso(date, -1);
      while (isWeekendIso(date)) date = addDaysIso(date, -1);
    }
    return null;
  }

  private async fetchDate(base: string, quote: string, date: string): Promise<{ date: string; rate: number } | null> {
    const key = `${base}/${quote}/${date}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const url = `${this.baseUrl}/v2/rate/${base}/${quote}?date=${date}&providers=${this.provider}`;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (err) {
        if (attempt >= this.maxRetries) throw new ProviderError(this.name, `network error for ${url}`, err);
        await this.sleepFn(250 * 2 ** attempt);
        continue;
      }
      if (res.ok) {
        const body = (await res.json()) as { date?: unknown; rate?: unknown };
        if (typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) && typeof body.rate === 'number' && body.rate > 0) {
          const row = { date: body.date, rate: body.rate };
          this.cache.set(key, row);
          return row;
        }
        throw new ProviderError(this.name, `unexpected response shape from ${url}`);
      }
      if (res.status === 404 || res.status === 422) {
        // Unknown pair or no data for this date: cache the negative so we do not hammer the API.
        this.cache.set(key, null);
        return null;
      }
      if (isRetryable(res.status) && attempt < this.maxRetries) {
        await this.sleepFn(250 * 2 ** attempt);
        continue;
      }
      throw new ProviderError(this.name, `HTTP ${res.status} for ${url}`);
    }
  }
}
