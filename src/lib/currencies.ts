/** Currencies offered when creating or editing a journal. Any ISO 4217 code a broker reports can be typed too (see isCurrencyCode). */
export const CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD", "NGN", "ZAR", "INR", "KES", "GHS", "EGP", "MAD", "TZS", "UGX",
  "BRL", "MXN", "ARS", "CLP", "COP", "SGD", "HKD", "CNY", "KRW", "THB", "MYR", "IDR", "PHP", "VND", "PKR", "BDT",
  "AED", "SAR", "QAR", "ILS", "TRY", "PLN", "CZK", "HUF", "RON", "SEK", "NOK", "DKK", "RUB", "UAH",
];

/** Whether Intl can format this code as a currency. A made-up or four-letter code (USDT) throws RangeError there. */
export function isCurrencyCode(code: unknown): code is string {
  if (typeof code !== "string" || !/^[A-Za-z]{3}$/.test(code)) return false;
  try { new Intl.NumberFormat("en-US", { style: "currency", currency: code }); return true; } catch { return false; }
}

/** A code that is safe to hand to Intl: the journal's own when valid, else USD. Never throws, so one bad legacy row cannot blank the app. */
export const safeCurrency = (code: unknown): string => (isCurrencyCode(code) ? code.toUpperCase() : "USD");
