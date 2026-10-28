/**
 * Mt5Report -> rows for `public.trades`. Pure: the dialog does the I/O.
 *
 * Conventions (they must agree with the `trades_compute_pnl` trigger and with `pnl-map.ts`):
 *  - gross_pnl  = MT5 profit, the broker's own number, in account currency.
 *  - commission / swap keep MT5's sign (costs negative) so the P&L engine can reconcile them.
 *  - fees       = -(commission + swap), a POSITIVE cost, because the trigger computes net = gross - fees.
 *  - pnl_manual = true so the trigger never recomputes imported P&L from prices (it cannot know the
 *                 contract size or conversion rate). The engine audits these figures instead.
 *  - external_id = MT5 position ticket, the idempotency key behind the (journal_id, external_id) unique index.
 */
import { serverWallToUtcMs, type ServerTz } from "../../../supabase/functions/_shared/pnl-engine/time.ts";
import type { Mt5Position, Mt5Report } from "./parse-report";

export interface JournalLink {
  currency: string;
  mt_login?: string | null;
  mt_platform?: string | null;
  mt_server?: string | null;
}

export type Compatibility = { ok: true; warnings: string[] } | { ok: false; error: string };

/** Refuse a report that belongs to another account or currency: importing it would corrupt the journal's numbers. */
export function checkCompatibility(report: Mt5Report, journal: JournalLink): Compatibility {
  const warnings: string[] = [];
  const a = report.account;
  if (a) {
    if (journal.mt_login && journal.mt_login !== a.login) {
      return { ok: false, error: `This report is for account ${a.login}, but this journal is linked to account ${journal.mt_login}.` };
    }
    if (a.currency && a.currency.toUpperCase() !== journal.currency.toUpperCase()) {
      return {
        ok: false,
        error: `This report is in ${a.currency}, but the journal currency is ${journal.currency.toUpperCase()}. Create a ${a.currency} journal for this account.`,
      };
    }
    if (journal.mt_server && a.server && journal.mt_server !== a.server) {
      warnings.push(`Report server "${a.server}" differs from the linked server "${journal.mt_server}".`);
    }
  }
  return { ok: true, warnings };
}

export interface TradeInsertRow {
  journal_id: string;
  instrument_id: string | null;
  direction: "long" | "short";
  entry_at: string;
  exit_at: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  stop_loss: number | null;
  take_profit: number | null;
  gross_pnl: number;
  fees: number;
  commission: number;
  swap: number;
  net_pnl: number;
  pnl_manual: true;
  source: "mt5";
  external_id: string;
  raw_symbol: string;
}

const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

export function positionToTrade(
  p: Mt5Position,
  journalId: string,
  instrumentId: string | null,
  tz: ServerTz,
): TradeInsertRow {
  const fees = round8(-(p.commission + p.swap));
  return {
    journal_id: journalId,
    instrument_id: instrumentId,
    direction: p.side === "sell" ? "short" : "long",
    entry_at: new Date(serverWallToUtcMs(p.openWallMs, tz)).toISOString(),
    exit_at: new Date(serverWallToUtcMs(p.closeWallMs, tz)).toISOString(),
    entry_price: p.openPrice,
    exit_price: p.closePrice,
    quantity: p.volume, // lots: the journal's quantity_unit is set to 'lots' on import
    stop_loss: p.stopLoss,
    take_profit: p.takeProfit,
    gross_pnl: p.profit,
    fees,
    commission: p.commission,
    swap: p.swap,
    net_pnl: round8(p.profit - fees),
    pnl_manual: true,
    source: "mt5",
    external_id: p.ticket,
    raw_symbol: p.symbol,
  };
}

export function reportToTrades(
  report: Mt5Report,
  journalId: string,
  instrumentIds: ReadonlyMap<string, string>,
  tz: ServerTz,
): TradeInsertRow[] {
  return report.positions.map((p) => positionToTrade(p, journalId, instrumentIds.get(p.symbol) ?? null, tz));
}

export interface ReportSummary {
  trades: number;
  symbols: number;
  net: number;
  firstCloseWallMs: number | null;
  lastCloseWallMs: number | null;
}

export function summarize(report: Mt5Report): ReportSummary {
  const closes = report.positions.map((p) => p.closeWallMs);
  return {
    trades: report.positions.length,
    symbols: new Set(report.positions.map((p) => p.symbol)).size,
    net: round8(report.positions.reduce((s, p) => s + p.profit + p.commission + p.swap, 0)),
    firstCloseWallMs: closes.length ? Math.min(...closes) : null,
    lastCloseWallMs: closes.length ? Math.max(...closes) : null,
  };
}

export interface CashflowInsertRow {
  journal_id: string;
  occurred_on: string;
  amount: number;
  note: string;
  external_id: string;
}

/** Deposits (positive) and withdrawals (negative) as journal cashflows, keyed by MT5 deal ticket. */
export function balanceOpsToCashflows(report: Mt5Report, journalId: string, tz: ServerTz): CashflowInsertRow[] {
  return report.balanceOps
    .filter((b) => b.amount !== 0 && b.deal)
    .map((b) => ({
      journal_id: journalId,
      occurred_on: new Date(serverWallToUtcMs(b.wallMs, tz)).toISOString().slice(0, 10),
      amount: b.amount,
      note: b.comment ? `MT5: ${b.comment}` : "MT5 balance operation",
      external_id: `mt5-deal:${b.deal}`,
    }));
}
