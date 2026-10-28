import { Dec } from './decimal.ts';

/** ISO 4217 minor-unit exponents that differ from the default of 2. */
const ZERO_DP = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'PYG', 'XOF', 'XAF']);
const THREE_DP = new Set(['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'IQD', 'LYD']);

export function minorUnits(ccy: string): number {
  const c = ccy.toUpperCase();
  if (ZERO_DP.has(c)) return 0;
  if (THREE_DP.has(c)) return 3;
  return 2;
}

/**
 * Round to the currency's minor unit. Use ONLY for display/aggregation
 * boundaries. Stored values keep full precision.
 */
export function roundMoney(amount: Dec, ccy: string): Dec {
  return amount.toDecimalPlaces(minorUnits(ccy), Dec.ROUND_HALF_UP);
}

export const FIAT_CODES: ReadonlySet<string> = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK',
  'PLN', 'CZK', 'HUF', 'TRY', 'ZAR', 'MXN', 'SGD', 'HKD', 'CNH', 'CNY', 'ILS',
  'THB', 'RON', 'BRL', 'INR', 'KRW', 'AED', 'SAR', 'NGN', 'KES', 'GHS',
]);

export const METAL_CODES: ReadonlySet<string> = new Set(['XAU', 'XAG', 'XPT', 'XPD']);

export const CRYPTO_CODES: ReadonlySet<string> = new Set([
  'BTC', 'ETH', 'LTC', 'XRP', 'BCH', 'ADA', 'SOL', 'DOT', 'BNB',
  'USDT', 'USDC', 'DOGE', 'AVAX', 'LINK', 'MATIC', 'TRX', 'XLM', 'XMR', 'DASH',
]);
