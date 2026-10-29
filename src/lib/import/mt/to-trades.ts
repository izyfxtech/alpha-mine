/**
 * MtReport -> rows for `public.trades`. Pure: the dialog / RPC does the I/O.
 *
 * Conventions (they must agree with the `trades_compute_pnl` trigger, `pnl-map.ts` and `import_mt_report`):
 *  - gross_pnl  = the terminal's profit, the broker's own number, in account currency.
 *  - commission / swap keep the terminal's sign (costs negative) so the P&L engine can reconcile them.
 *  - fees       = -(commission + swap), a POSITIVE cost, because the trigger computes net = gross - fees.
 *  - pnl_manual = true so the trigger never recomputes imported P&L from prices (it cannot know the
 *                 contract size or conversion rate). The engine audits these figures instead.
 *  - external_id = the position (MT5) or order (MT4) ticket, the idempotency key behind the
 *                 (journal_id, external_id) unique index.
 */
import {
  serverWallToUtcMs,
  type ServerTz,
} from "@engine/time.ts";
import type {
  MtPlatform,
  MtPosition,
  MtReport,
} from "@shared/mt/index.ts";

export interface JournalLink {
  currency: string;
  mt_login?: string | null;
  mt_platform?: string | null;
  mt_server?: string | null;
}

export type Compatibility = { ok: true; warnings: string[] } | { ok: false; error: string };

const PLATFORM_NAME: Record<MtPlatform, string> = { mt4: "MetaTrader 4", mt5: "MetaTrader 5" };

/** Refuse a report that belongs to another account, platform or currency: importing it would corrupt the journal's numbers. */
export function checkCompatibility(report: MtReport, journal: JournalLink): Compatibility {
  const warnings: string[] = [];
  const a = report.account;
  if (journal.mt_platform && journal.mt_platform !== report.platform) {
    return {
      ok: false,
      error: `This is a ${PLATFORM_NAME[report.platform]} report, but this journal is linked to a ${PLATFORM_NAME[journal.mt_platform as MtPlatform] ?? journal.mt_platform} account.`,
    };
  }
  if (a) {
    if (journal.mt_login && journal.mt_login !== a.login) {
      return {
        ok: false,
        error: `This report is for account ${a.login}, but this journal is linked to account ${journal.mt_login}.`,
      };
    }
    if (a.currency && a.currency.toUpperCase() !== journal.currency.toUpperCase()) {
      return {
        ok: false,
        error: `This report is in ${a.currency}, but the journal currency is ${journal.currency.toUpperCase()}. Create a ${a.currency} journal for this account.`,
      };
    }
    if (journal.mt_server && a.server && journal.mt_server !== a.server) {
      warnings.push(
        `Report server "${a.server}" differs from the linked server "${journal.mt_server}".`,
      );
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
  source: MtPlatform;
  external_id: string;
  raw_symbol: string;
}

const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

export function positionToTrade(
  p: MtPosition,
  journalId: string,
  instrumentId: string | null,
  tz: ServerTz,
  platform: MtPlatform = "mt5",
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
    source: platform,
    external_id: p.ticket,
    raw_symbol: p.symbol,
  };
}

export function reportToTrades(
  report: MtReport,
  journalId: string,
  instrumentIds: ReadonlyMap<string, string>,
  tz: ServerTz,
): TradeInsertRow[] {
  return report.positions.map((p) =>
    positionToTrade(p, journalId, instrumentIds.get(p.symbol) ?? null, tz, report.platform),
  );
}

export interface ReportSummary {
  trades: number;
  symbols: number;
  net: number;
  firstCloseWallMs: number | null;
  lastCloseWallMs: number | null;
}

export function summarize(report: MtReport): ReportSummary {
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

/** Deposits (positive) and withdrawals (negative) as journal cashflows, keyed by the terminal's deal/ticket number. */
export function balanceOpsToCashflows(
  report: MtReport,
  journalId: string,
  tz: ServerTz,
): CashflowInsertRow[] {
  const label = report.platform.toUpperCase();
  return report.balanceOps
    .filter((b) => b.amount !== 0 && b.deal)
    .map((b) => ({
      journal_id: journalId,
      occurred_on: new Date(serverWallToUtcMs(b.wallMs, tz)).toISOString().slice(0, 10),
      amount: b.amount,
      note: b.comment ? `${label}: ${b.comment}` : `${label} balance operation`,
      external_id: `${report.platform}-deal:${b.deal}`,
    }));
}

// ----------------------------------------------------------------------------------------------- RPC payload

export interface PositionPayload {
  external_id: string;
  raw_symbol: string;
  direction: "long" | "short";
  entry_at: string;
  exit_at: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  stop_loss: number | null;
  take_profit: number | null;
  gross_pnl: number;
  commission: number;
  swap: number;
}

export interface ImportPayload {
  platform: MtPlatform;
  account: { login: string; server: string | null; currency: string } | null;
  instruments: { symbol: string; digits: number | null }[];
  positions: PositionPayload[];
  cashflows: { external_id: string; occurred_on: string; amount: number; note: string }[];
}

/**
 * The argument of `import_mt_report`. Only broker facts travel: the database derives fees and net itself, so the
 * client cannot send numbers that disagree with each other.
 */
export function toImportPayload(
  report: MtReport,
  tz: ServerTz,
  opts: { withCashflows?: boolean } = {},
): ImportPayload {
  const positions = report.positions.map((p): PositionPayload => {
    const t = positionToTrade(p, "", null, tz, report.platform);
    return {
      external_id: t.external_id,
      raw_symbol: t.raw_symbol,
      direction: t.direction,
      entry_at: t.entry_at,
      exit_at: t.exit_at,
      entry_price: t.entry_price,
      exit_price: t.exit_price,
      quantity: t.quantity,
      stop_loss: t.stop_loss,
      take_profit: t.take_profit,
      gross_pnl: t.gross_pnl,
      commission: t.commission,
      swap: t.swap,
    };
  });
  const cashflows = opts.withCashflows
    ? balanceOpsToCashflows(report, "", tz).map(({ external_id, occurred_on, amount, note }) => ({
        external_id,
        occurred_on,
        amount,
        note,
      }))
    : [];
  const a = report.account;
  return {
    platform: report.platform,
    account: a ? { login: a.login, server: a.server, currency: a.currency } : null,
    instruments: Object.entries(report.digitsBySymbol).map(([symbol, digits]) => ({
      symbol,
      digits,
    })),
    positions,
    cashflows,
  };
}
