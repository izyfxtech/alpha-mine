/**
 * Instrument catalogue: every symbol we know is tagged with an asset class.
 * The class only decides MONEY maths (contract size, quote currency).
 * R-multiples never read this file: R is a pure price ratio.
 *
 * Resolution order: user's own row -> catalogue -> pattern -> null (unknown).
 * Contract sizes are common MT5 broker defaults. A broker import or the user's
 * own instrument row always wins over them.
 */

export type AssetClass = "forex" | "metal" | "crypto" | "index" | "energy" | "stock" | "future";

export interface InstrumentSpec {
  symbol: string;
  assetClass: AssetClass;
  /** Units per 1.0 lot, or currency per 1.00 price move per contract (futures). */
  contractSize: number;
  /** Currency the P&L is earned in. null = user must say (e.g. a stock). */
  quoteCurrency: string | null;
  /** First currency of a pair (EUR in EURUSD). Money is turned into the account currency by dividing by price when the account is this. */
  baseCurrency?: string | null;
  /** Display only. Never used by R. */
  pipSize: number | null;
}

export type MatchSource = "user" | "catalogue" | "pattern";
export interface ResolvedInstrument {
  spec: InstrumentSpec;
  source: MatchSource;
}

const spec = (
  symbol: string,
  assetClass: AssetClass,
  contractSize: number,
  quoteCurrency: string | null,
  pipSize: number | null = null,
): InstrumentSpec => ({
  symbol,
  assetClass,
  contractSize,
  quoteCurrency,
  pipSize,
  baseCurrency: assetClass === "forex" || assetClass === "metal" ? symbol.slice(0, 3) : null,
});

// ---------- Forex ----------
const FOREX_PAIRS = // majors
  (
    "EURUSD GBPUSD USDJPY USDCHF USDCAD AUDUSD NZDUSD " +
    // minors / crosses
    "EURGBP EURJPY EURCHF EURAUD EURCAD EURNZD GBPJPY GBPCHF GBPAUD GBPCAD GBPNZD " +
    "AUDJPY AUDCHF AUDCAD AUDNZD NZDJPY NZDCHF NZDCAD CADJPY CADCHF CHFJPY " +
    // exotics
    "USDZAR USDNGN USDMXN USDTRY USDSGD USDHKD USDNOK USDSEK USDDKK USDPLN USDCZK USDHUF " +
    "USDCNH USDILS USDTHB USDINR USDBRL EURTRY EURPLN EURNOK EURSEK EURZAR EURHUF EURCZK EURMXN " +
    "GBPNOK GBPSEK GBPZAR GBPTRY SGDJPY ZARJPY NOKJPY SEKJPY MXNJPY TRYJPY"
  ).split(" ");

/** Any pair of two of these is treated as forex even if it is not listed above. */
const FOREX_CURRENCIES = new Set(
  "USD EUR GBP JPY CHF AUD CAD NZD SEK NOK DKK PLN CZK HUF TRY ZAR MXN SGD HKD CNH CNY ILS THB NGN INR BRL KRW".split(
    " ",
  ),
);

function forexSpec(pair: string): InstrumentSpec {
  const quote = pair.slice(3);
  return spec(pair, "forex", 100_000, quote, quote === "JPY" ? 0.01 : 0.0001);
}

// ---------- Metals ----------
const METALS: InstrumentSpec[] = [
  spec("XAUUSD", "metal", 100, "USD", 0.01),
  spec("XAGUSD", "metal", 5_000, "USD", 0.001),
  spec("XPTUSD", "metal", 100, "USD", 0.01),
  spec("XPDUSD", "metal", 100, "USD", 0.01),
];

// ---------- Crypto ----------
const CRYPTO_BASES = new Set(
  "BTC ETH SOL XRP LTC BNB ADA DOGE DOT AVAX LINK MATIC TRX BCH XLM UNI ATOM SHIB".split(" "),
);
const CRYPTO_QUOTES = ["USDT", "USDC", "USD", "EUR", "GBP", "BTC"];
const CRYPTO_CORE = "BTC ETH SOL XRP LTC BNB ADA DOGE DOT AVAX LINK".split(" ");

function cryptoSpec(symbol: string, quote: string): InstrumentSpec {
  return {
    ...spec(symbol, "crypto", 1, quote === "USDT" || quote === "USDC" ? "USD" : quote),
    baseCurrency: symbol.slice(0, symbol.length - quote.length),
  };
}

// ---------- Indices ----------
const INDICES: InstrumentSpec[] = [
  spec("US30", "index", 1, "USD"),
  spec("US500", "index", 1, "USD"),
  spec("NAS100", "index", 1, "USD"),
  spec("US2000", "index", 1, "USD"),
  spec("GER40", "index", 1, "EUR"),
  spec("UK100", "index", 1, "GBP"),
  spec("JP225", "index", 1, "JPY"),
  spec("FRA40", "index", 1, "EUR"),
  spec("AUS200", "index", 1, "AUD"),
  spec("HK50", "index", 1, "HKD"),
  spec("ES35", "index", 1, "EUR"),
  spec("EU50", "index", 1, "EUR"),
];

// ---------- Energies ----------
const ENERGIES: InstrumentSpec[] = [
  spec("USOIL", "energy", 1_000, "USD"),
  spec("UKOIL", "energy", 1_000, "USD"),
  spec("NATGAS", "energy", 10_000, "USD"),
];

// ---------- Futures (contract multiplier = currency per 1.00 price move) ----------
const FUTURES: InstrumentSpec[] = [
  spec("ES", "future", 50, "USD"),
  spec("MES", "future", 5, "USD"),
  spec("NQ", "future", 20, "USD"),
  spec("MNQ", "future", 2, "USD"),
  spec("YM", "future", 5, "USD"),
  spec("MYM", "future", 0.5, "USD"),
  spec("RTY", "future", 50, "USD"),
  spec("M2K", "future", 5, "USD"),
  spec("CL", "future", 1_000, "USD"),
  spec("MCL", "future", 100, "USD"),
  spec("GC", "future", 100, "USD"),
  spec("MGC", "future", 10, "USD"),
  spec("SI", "future", 5_000, "USD"),
  spec("NG", "future", 10_000, "USD"),
  spec("ZB", "future", 1_000, "USD"),
  spec("ZN", "future", 1_000, "USD"),
  spec("6E", "future", 125_000, "USD"),
  spec("6B", "future", 62_500, "USD"),
  spec("6A", "future", 100_000, "USD"),
  spec("6J", "future", 12_500_000, "USD"),
];

/** Alternative names brokers and charting sites use for the same instrument. */
const ALIASES: Record<string, string> = {
  GOLD: "XAUUSD",
  SILVER: "XAGUSD",
  PLATINUM: "XPTUSD",
  PALLADIUM: "XPDUSD",
  DJ30: "US30",
  DJIA: "US30",
  WS30: "US30",
  DOW: "US30",
  DOWJONES: "US30",
  US30CASH: "US30",
  SPX500: "US500",
  SP500: "US500",
  SPX: "US500",
  US500CASH: "US500",
  USTEC: "NAS100",
  US100: "NAS100",
  NDX100: "NAS100",
  NDX: "NAS100",
  NASDAQ: "NAS100",
  RUSSELL2000: "US2000",
  DE40: "GER40",
  DAX40: "GER40",
  DAX: "GER40",
  GER30: "GER40",
  DE30: "GER40",
  FTSE100: "UK100",
  FTSE: "UK100",
  JPN225: "JP225",
  NIKKEI225: "JP225",
  NI225: "JP225",
  NIKKEI: "JP225",
  F40: "FRA40",
  CAC40: "FRA40",
  AU200: "AUS200",
  ASX200: "AUS200",
  HSI: "HK50",
  HK50CASH: "HK50",
  IBEX35: "ES35",
  STOXX50: "EU50",
  EUSTX50: "EU50",
  WTI: "USOIL",
  XTIUSD: "USOIL",
  USOUSD: "USOIL",
  BRENT: "UKOIL",
  XBRUSD: "UKOIL",
  UKOUSD: "UKOIL",
  XNGUSD: "NATGAS",
  NGAS: "NATGAS",
};

// ---------- Build the lookup ----------
const BY_SYMBOL = new Map<string, InstrumentSpec>();
const add = (s: InstrumentSpec) => BY_SYMBOL.set(s.symbol, s);
FOREX_PAIRS.forEach((p) => add(forexSpec(p)));
[...METALS, ...INDICES, ...ENERGIES].forEach(add);
for (const base of CRYPTO_CORE) {
  for (const quote of CRYPTO_QUOTES) {
    if (base === quote) continue;
    add(cryptoSpec(base + quote, quote));
  }
}
const FUTURE_ROOTS = new Map(FUTURES.map((f) => [f.symbol, f]));
/**
 * A futures root is only recognised with a contract month (ESZ6) or as a continuous contract (ES1!, ES!). A bare "ES" or "NG" is
 * also a stock ticker, so it is left to the stock rule instead of silently getting a futures multiplier.
 */
const FUTURE_ROOT_RE = new RegExp(
  `^(${[...FUTURE_ROOTS.keys()].sort((a, b) => b.length - a.length).join("|")})(?:[FGHJKMNQUVXZ]\\d{1,2}|\\d*!)$`,
);

/** Every instrument the catalogue knows by name (futures listed by root). */
export function listInstruments(): InstrumentSpec[] {
  return [...BY_SYMBOL.values(), ...FUTURES];
}

// ---------- Resolution ----------
export function normaliseSymbol(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/^[#$^]+/, "")
    .replace(/[\s/_-]/g, "");
}

/** Names to try, most specific first: as typed, without a .suffix, without a 1-letter broker suffix, without PRO/RAW/ECN. */
function candidates(norm: string): string[] {
  const out = [norm];
  const dot = norm.indexOf(".");
  if (dot > 0) out.push(norm.slice(0, dot));
  const base = dot > 0 ? norm.slice(0, dot) : norm;
  if (/(PRO|RAW|ECN)$/.test(base)) out.push(base.replace(/(PRO|RAW|ECN)$/, ""));
  if (base.length === 7) out.push(base.slice(0, 6)); // EURUSDm -> EURUSD
  return [...new Set(out)].filter(Boolean);
}

function fromCatalogueOrPattern(
  name: string,
): { spec: InstrumentSpec; source: MatchSource } | null {
  const hit = BY_SYMBOL.get(ALIASES[name] ?? name);
  if (hit) return { spec: hit, source: "catalogue" };

  const fut = FUTURE_ROOT_RE.exec(name);
  if (fut) return { spec: FUTURE_ROOTS.get(fut[1]!)!, source: "catalogue" };

  if (/^[A-Z]{6}$/.test(name)) {
    const a = name.slice(0, 3);
    const b = name.slice(3);
    if (a !== b && FOREX_CURRENCIES.has(a) && FOREX_CURRENCIES.has(b)) {
      return { spec: forexSpec(name), source: "pattern" };
    }
  }
  for (const q of CRYPTO_QUOTES) {
    if (name.endsWith(q)) {
      const base = name.slice(0, -q.length);
      if (CRYPTO_BASES.has(base)) return { spec: cryptoSpec(name, q), source: "pattern" };
    }
  }
  return null;
}

/**
 * Resolve a raw broker/user symbol. `userSpecs` is keyed by normalised symbol.
 * Returns null when nothing matches: R still works, money P&L needs the user to pick a class.
 */
export function resolveInstrument(
  raw: string,
  userSpecs: Record<string, InstrumentSpec> = {},
): ResolvedInstrument | null {
  const norm = normaliseSymbol(raw);
  if (!norm) return null;
  const names = candidates(norm);
  for (const n of names) {
    const mine = userSpecs[n];
    if (mine) return { spec: mine, source: "user" };
  }
  for (const n of names) {
    const found = fromCatalogueOrPattern(n);
    if (found) return found;
  }
  return null;
}

/** Spec for a symbol the user has told us is a stock (or anything with contract 1). */
export function stockSpec(symbol: string, quoteCurrency: string): InstrumentSpec {
  return spec(normaliseSymbol(symbol), "stock", 1, quoteCurrency.toUpperCase());
}

// ---------- What the rest of the app asks ----------

export type QuantityUnit = "lots" | "units";
/** Forex, metals, indices, energies and futures are traded in lots / contracts; crypto and stocks in units. */
export const unitOfClass = (c: AssetClass): QuantityUnit =>
  c === "crypto" || c === "stock" ? "units" : "lots";
export const quantityLabel = (u: QuantityUnit | null) =>
  u === "lots" ? "Lots / contracts" : u === "units" ? "Shares / units" : "Quantity";
export const CLASS_LABEL: Record<AssetClass, string> = {
  forex: "Forex",
  metal: "Metals",
  crypto: "Crypto",
  index: "Indices",
  energy: "Energies",
  stock: "Stocks",
  future: "Futures",
};

export interface Spec extends InstrumentSpec {
  unit: QuantityUnit;
  /** false = the symbol is not in the catalogue and its class is a default; contractSize is then null for lot-sized guesses. */
  known: boolean;
  contractSize: number;
}
export interface SpecOptions {
  /** The journal's markets. A forex-only journal reads an unknown name (a broker CFD) as a lot contract of unknown size. */
  markets?: readonly string[];
  journalUnit?: string | null;
  /** instruments.contract_size: the trader's own size for this instrument, wins over the catalogue. */
  contractSize?: number | string | null;
}

/**
 * The class and contract of any symbol. Never throws. A symbol that is not in the catalogue is a stock, unless the journal
 * trades forex only, in which case it is a lot contract whose size is unknown (contractSize 0 = money cannot be worked out,
 * R still can).
 */
export function specFor(raw: string | null | undefined, o: SpecOptions = {}): Spec {
  const hit = resolveInstrument(raw ?? "");
  let base: Spec;
  if (hit) base = { ...hit.spec, unit: unitOfClass(hit.spec.assetClass), known: true };
  else {
    const lots =
      o.journalUnit !== "units" &&
      (((o.markets?.length ?? 0) > 0 && o.markets!.every((m) => m === "Forex")) ||
        o.journalUnit === "lots");
    base = lots
      ? {
          symbol: normaliseSymbol(raw ?? ""),
          assetClass: "index",
          contractSize: 0,
          quoteCurrency: null,
          baseCurrency: null,
          pipSize: null,
          unit: "lots",
          known: false,
        }
      : { ...stockSpec(raw ?? "", ""), quoteCurrency: null, unit: "units", known: false };
  }
  const own = o.contractSize == null || o.contractSize === "" ? NaN : Number(o.contractSize);
  return Number.isFinite(own) && own > 0 ? { ...base, contractSize: own } : base;
}

/** The markets a journal can be created for today. */
export const JOURNAL_MARKETS = ["Forex", "Stocks"] as const;

/** The class stored on a new instrument row. */
export const assetClassFor = (symbol: string, markets: readonly string[] = []): AssetClass =>
  specFor(symbol, { markets }).assetClass;
