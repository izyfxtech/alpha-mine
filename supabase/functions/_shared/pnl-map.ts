/**
 * Pure mapping from AlphaMine rows to engine inputs. No I/O, so it is unit tested in Vitest and
 * reused unchanged by the Edge Function.
 */
import { D, type ClosedTrade, inferInstrument, UnsupportedInstrumentError } from './pnl-engine/index.ts';

export interface TradeRow {
  id: string;
  direction: 'long' | 'short';
  entry_at: string | null;
  exit_at: string | null;
  entry_price: number | string | null;
  exit_price: number | string | null;
  quantity: number | string | null;
  stop_loss: number | string | null;
  take_profit: number | string | null;
  gross_pnl: number | string | null;
  net_pnl: number | string | null;
  fees: number | string | null;
  commission: number | string | null;
  swap: number | string | null;
  risk_amount: number | string | null;
  source: string | null;
  raw_symbol: string | null;
  is_break_even: boolean | null;
  pnl_manual: boolean | null;
  instrument_id: string | null;
}
export interface InstrumentRow {
  id: string;
  symbol: string;
  contract_size: number | string | null;
  digits: number | null;
  profit_currency: string | null;
  kind: 'fx' | 'metal' | 'crypto' | 'index' | 'cfd' | null;
}
export interface JournalRow { id: string; currency: string; quantity_unit: 'lots' | 'units' | null }

export type Mapped = { trade: ClosedTrade; notes: string[] } | { skip: string };

const has = (v: unknown): v is number | string => v !== null && v !== undefined && v !== '';
const decimals = (v: number | string | null) => (has(v) ? (String(v).split('.')[1] ?? '').length : 0);

/** Highest price precision seen per instrument, used only when `instruments.digits` is empty. */
export function guessDigits(rows: TradeRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.instrument_id) continue;
    const d = Math.max(decimals(r.entry_price), decimals(r.exit_price));
    out.set(r.instrument_id, Math.min(8, Math.max(out.get(r.instrument_id) ?? 0, d)));
  }
  return out;
}

export function mapTrade(row: TradeRow, ins: InstrumentRow | undefined, journal: JournalRow, digitsGuess: Map<string, number>): Mapped {
  if (row.pnl_manual && (row.source ?? 'manual') === 'manual') return { skip: 'P&L entered by hand is never overwritten' };
  if (row.is_break_even) return { skip: 'marked break even' };
  if (!has(row.entry_price) || !has(row.exit_price) || !row.entry_at || !row.exit_at) return { skip: 'trade is not closed or has no prices' };
  if (!has(row.quantity) || Number(row.quantity) <= 0) return { skip: 'no quantity' };
  if (!journal.quantity_unit) return { skip: 'journal quantity unit (lots or units) is not set' };
  const symbol = row.raw_symbol ?? ins?.symbol;
  if (!symbol) return { skip: 'no instrument symbol' };

  const notes: string[] = [];
  const own = Math.max(decimals(row.entry_price), decimals(row.exit_price));
  const digits = Math.min(8, Math.max(2, ins?.digits ?? (ins ? digitsGuess.get(ins.id) : undefined) ?? own));
  if (ins?.digits == null) notes.push(`price digits inferred as ${digits}`);

  let spec;
  try {
    spec = inferInstrument(symbol, {
      digits,
      contractSize: has(ins?.contract_size) ? Number(ins!.contract_size) : undefined,
      profitCurrency: ins?.profit_currency ?? undefined,
      kind: ins?.kind ?? undefined,
    });
  } catch (e) {
    // Any instrument problem (unsupported symbol, bad digits) skips this one trade, never the batch.
    return { skip: e instanceof UnsupportedInstrumentError ? e.message : `instrument could not be resolved: ${(e as Error).message}` };
  }
  if (spec.contractSizeSource === 'default') notes.push(`contract size defaulted to ${spec.contractSize.toString()}`);

  const qty = D(row.quantity);
  const lots = journal.quantity_unit === 'lots' ? qty : qty.div(spec.contractSize);

  // Costs. MetaTrader style columns win; otherwise AlphaMine `fees` (a positive cost) is used.
  const broker: NonNullable<ClosedTrade['broker']> = {};
  const imported = (row.source ?? 'manual') !== 'manual';
  if (imported && has(row.gross_pnl)) broker.profit = D(row.gross_pnl);
  if (has(row.commission)) broker.commission = D(row.commission);
  if (has(row.swap)) broker.swap = D(row.swap);
  if (!has(row.commission) && !has(row.swap) && has(row.fees) && Number(row.fees) !== 0) broker.fee = D(row.fees).neg();

  return {
    notes,
    trade: {
      id: row.id,
      spec,
      side: row.direction === 'short' ? 'sell' : 'buy',
      lots,
      openPrice: D(row.entry_price),
      closePrice: D(row.exit_price),
      openTimeMs: Date.parse(row.entry_at),
      closeTimeMs: Date.parse(row.exit_at),
      accountCurrency: journal.currency.toUpperCase(),
      broker: Object.keys(broker).length ? broker : undefined,
      stopLoss: has(row.stop_loss) ? D(row.stop_loss) : undefined,
      takeProfit: has(row.take_profit) ? D(row.take_profit) : undefined,
    },
  };
}

export interface AuditRow { trade_id: string; status: string; planned_risk: number | string | null; applied?: boolean | null }

/**
 * Which audited trades may receive a planned risk. Only computed rows with a positive risk qualify, and only once.
 * Gross, net and fees are never part of this: for broker-sourced trades those are the broker's own numbers.
 */
export function pickRiskApplications(rows: AuditRow[]): { trade_id: string; risk_amount: number }[] {
  const out: { trade_id: string; risk_amount: number }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.status !== 'computed' || r.applied || seen.has(r.trade_id) || !has(r.planned_risk)) continue;
    const risk = Number(r.planned_risk);
    if (!Number.isFinite(risk) || risk <= 0) continue;
    seen.add(r.trade_id);
    out.push({ trade_id: r.trade_id, risk_amount: risk });
  }
  return out;
}
