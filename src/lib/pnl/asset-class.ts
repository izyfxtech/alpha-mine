import { normalizeSymbol, splitKnownPair } from "@engine/instruments";

/**
 * The two markets a journal can be created for. The class of an INSTRUMENT decides how its quantity is read:
 * forex pairs are traded in lots, stocks in units (shares). Nobody has to say so when creating a journal.
 */
export type AssetClass = "forex" | "stock";
export type QuantityUnit = "lots" | "units";

export const JOURNAL_MARKETS = ["Forex", "Stocks"] as const;

/** A symbol made of two known currency / metal / crypto codes (EURUSD, GBPJPY.a, XAUUSD) is a pair. */
export const isPairSymbol = (symbol: string) => !!splitKnownPair(normalizeSymbol(symbol));

/**
 * Class of a new instrument. A recognisable pair is forex. Anything else is a stock, unless the journal trades
 * forex only (then broker names such as "US30" or "GER40" are lot-sized CFDs, not shares).
 */
export function inferAssetClass(symbol: string, markets: readonly string[] = []): AssetClass {
  if (isPairSymbol(symbol)) return "forex";
  if (markets.length > 0 && markets.every((m) => m === "Forex")) return "forex";
  return "stock";
}

/**
 * How quantity is read for a trade: from its instrument's class, and only when that is not known from what the journal
 * says (MetaTrader imports mark their journal as lots). null = unknown, and then nothing is guessed.
 */
export function quantityUnitOf(assetClass: string | null | undefined, journalUnit: string | null | undefined): QuantityUnit | null {
  if (assetClass === "stock") return "units";
  if (assetClass === "forex") return "lots";
  return journalUnit === "units" || journalUnit === "lots" ? journalUnit : null;
}

export const quantityLabel = (unit: QuantityUnit | null) => (unit === "lots" ? "Lots" : unit === "units" ? "Shares / units" : "Quantity");
