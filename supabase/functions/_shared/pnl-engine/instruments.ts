import { CRYPTO_CODES, FIAT_CODES, METAL_CODES } from './currency.ts';
import { D, Dec, pow10, type DecimalLike } from './decimal.ts';
import type { InstrumentKind, InstrumentSpec } from './types.ts';

export class UnsupportedInstrumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedInstrumentError';
  }
}

/** Strip broker decorations: "EURUSD.a", "EURUSDm", "EURUSD#", "eurusd_i" -> upper-case alphanumerics. */
export function normalizeSymbol(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Fallback contract sizes. These are common conventions, NOT guarantees: brokers
 * differ (XAUUSD is 100 oz at most, 1 oz at some; crypto CFDs vary). The engine
 * flags any spec built from a default so the UI/reconciler can warn.
 */
const DEFAULT_CONTRACT_SIZE: Record<string, number> = {
  fx: 100_000,
  XAU: 100,
  XAG: 5_000,
  XPT: 100,
  XPD: 100,
  crypto: 1,
};

/**
 * FX pip size from broker digits.
 *  - 5-digit (EURUSD 1.08505) and 3-digit (USDJPY 150.123) quotes carry a
 *    fractional pip -> pip = 10^-(digits-1)
 *  - 4-digit and 2-digit quotes -> pip = 10^-digits
 */
export function deriveFxPipSize(digits: number): Dec {
  return digits === 3 || digits === 5 ? pow10(-(digits - 1)) : pow10(-digits);
}

const isKnownCode = (c: string) => FIAT_CODES.has(c) || METAL_CODES.has(c) || CRYPTO_CODES.has(c);

/**
 * Split a normalized symbol into two KNOWN currency codes of 3 to 5 letters. Longer quote codes are
 * tried first so BTCUSDT is BTC/USDT, not BTC/USD. Broker suffix letters after the quote are ignored.
 */
export function splitKnownPair(s: string): { base: string; quote: string } | null {
  for (const bl of [3, 4, 5]) {
    for (const ql of [5, 4, 3]) {
      const b = s.slice(0, bl);
      const q = s.slice(bl, bl + ql);
      if (b.length === bl && q.length === ql && isKnownCode(b) && isKnownCode(q)) return { base: b, quote: q };
    }
  }
  return null;
}

export interface InferOptions {
  /** SYMBOL_DIGITS from the broker. Required: it is the only reliable pip-size signal. */
  digits: number;
  /** SYMBOL_TRADE_CONTRACT_SIZE from the broker. Strongly recommended. */
  contractSize?: DecimalLike;
  base?: string;
  quote?: string;
  /** Required for index/stock CFDs where profit currency is not derivable from the name. */
  profitCurrency?: string;
  kind?: InstrumentKind;
  /** Override for exotic instruments where "pip" is non-standard. */
  pipSize?: DecimalLike | null;
}

export function inferInstrument(rawSymbol: string, o: InferOptions): InstrumentSpec {
  if (!Number.isInteger(o.digits) || o.digits < 0 || o.digits > 8) {
    throw new UnsupportedInstrumentError(`digits must be an integer 0..8, got ${o.digits}`);
  }
  const s = normalizeSymbol(rawSymbol);
  const split = splitKnownPair(s);
  // Provisional codes, used only to classify. Opaque CFD/index symbols get real values below.
  let base = (o.base ?? split?.base ?? s.slice(0, 3)).toUpperCase();
  let quote = (o.quote ?? split?.quote ?? s.slice(3, 6)).toUpperCase();

  let kind = o.kind;
  if (!kind) {
    if (FIAT_CODES.has(base) && FIAT_CODES.has(quote)) kind = 'fx';
    else if (METAL_CODES.has(base) && FIAT_CODES.has(quote)) kind = 'metal';
    else if (CRYPTO_CODES.has(base) && (FIAT_CODES.has(quote) || CRYPTO_CODES.has(quote))) kind = 'crypto';
    else if (o.profitCurrency) kind = 'cfd';
    else {
      throw new UnsupportedInstrumentError(
        `Cannot classify "${rawSymbol}". Pass profitCurrency (and kind) explicitly.`,
      );
    }
  }

  if ((kind === 'cfd' || kind === 'index') && !o.profitCurrency) {
    throw new UnsupportedInstrumentError(`${rawSymbol}: pass profitCurrency for ${kind} instruments.`);
  }
  // A CFD or index symbol (US500, GER40) is not a currency pair: never slice currency codes out of it.
  if (kind === 'cfd' || kind === 'index') {
    if (o.base === undefined) base = s;
    if (o.quote === undefined) quote = o.profitCurrency!.toUpperCase();
  }

  const profitCurrency = (o.profitCurrency ?? quote).toUpperCase();

  let contractSize: Dec;
  let source: 'broker' | 'default';
  if (o.contractSize !== undefined) {
    contractSize = D(o.contractSize);
    source = 'broker';
  } else {
    const fallback = kind === 'fx' ? DEFAULT_CONTRACT_SIZE['fx'] : DEFAULT_CONTRACT_SIZE[base] ?? DEFAULT_CONTRACT_SIZE[kind];
    if (fallback === undefined) {
      throw new UnsupportedInstrumentError(`No default contract size for ${rawSymbol}; pass contractSize.`);
    }
    contractSize = D(fallback);
    source = 'default';
  }
  if (contractSize.lte(0)) throw new UnsupportedInstrumentError('contractSize must be > 0');

  let pipSize: Dec | null;
  if (o.pipSize !== undefined) pipSize = o.pipSize === null ? null : D(o.pipSize);
  else pipSize = kind === 'fx' ? deriveFxPipSize(o.digits) : null;

  return {
    symbol: rawSymbol,
    base,
    quote,
    profitCurrency,
    kind,
    digits: o.digits,
    contractSize,
    contractSizeSource: source,
    pointSize: pow10(-o.digits),
    pipSize,
  };
}
