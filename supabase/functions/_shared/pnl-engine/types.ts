import type { Dec } from './decimal.ts';

export type Side = 'buy' | 'sell';

export type InstrumentKind = 'fx' | 'metal' | 'crypto' | 'index' | 'cfd';

/**
 * Everything the engine needs to know about a tradable symbol. For MT4/MT5
 * accounts, populate from SymbolInfo (digits, contract size) rather than
 * relying on defaults: contract size is per-broker.
 */
export interface InstrumentSpec {
  /** Broker symbol exactly as it appears in the account, e.g. "EURUSDm". */
  symbol: string;
  base: string;
  quote: string;
  /** Currency in which the broker books raw P&L. For spot FX this is the quote currency. */
  profitCurrency: string;
  kind: InstrumentKind;
  /** Decimal places in the broker's quote (5 for EURUSD, 3 for USDJPY). */
  digits: number;
  /** Units of base per 1.0 lot (100_000 for FX). */
  contractSize: Dec;
  contractSizeSource: 'broker' | 'default';
  /** Smallest price step the broker quotes: 10^-digits. */
  pointSize: Dec;
  /** FX pip size. null for instruments where "pip" is not a meaningful unit. */
  pipSize: Dec | null;
}

/** Amounts the broker reported, in ACCOUNT currency, signed (costs negative). */
export interface BrokerReported {
  /** Gross trading result only: MT5 DEAL_PROFIT / MT4 OrderProfit(). Excludes swap/commission/fee. */
  profit?: Dec;
  swap?: Dec;
  commission?: Dec;
  fee?: Dec;
}

/** One fully closed position (or closed segment of a position). */
export interface ClosedTrade {
  id: string;
  spec: InstrumentSpec;
  side: Side;
  lots: Dec;
  openPrice: Dec;
  closePrice: Dec;
  /** UTC epoch milliseconds. Convert broker server time first (see time.ts). */
  openTimeMs: number;
  closeTimeMs: number;
  accountCurrency: string;
  broker?: BrokerReported;
  /** Initial stop loss, used for planned risk / R-multiple. */
  stopLoss?: Dec;
  takeProfit?: Dec;
}

export interface OpenPosition {
  id: string;
  spec: InstrumentSpec;
  side: Side;
  lots: Dec;
  openPrice: Dec;
  openTimeMs: number;
  accountCurrency: string;
  broker?: { swap?: Dec; commission?: Dec; fee?: Dec };
}
