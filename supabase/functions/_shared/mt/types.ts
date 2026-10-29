/**
 * Shared MetaTrader report types. Pure data: no DOM, no network, no Supabase, so the same code runs in the
 * browser (file import) and in a Deno Edge Function (a future sync endpoint).
 */
export type MtPlatform = "mt4" | "mt5";

export interface MtAccount {
  login: string;
  currency: string;
  server: string | null;
  /** "real" | "demo" | "contest" when the header says so (MT5 only). */
  mode: string | null;
  /** "hedge" | "netting" | "exchange" when the header says so (MT5 only). */
  type: string | null;
  name: string | null;
}

export interface MtPosition {
  /** Position ticket (MT5) or order ticket (MT4). Stable and unique per account: the import idempotency key. */
  ticket: string;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  openWallMs: number;
  closeWallMs: number;
  openPrice: number;
  closePrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  /** Signed account-currency amounts, exactly as booked (costs are negative). MT4 taxes are folded into commission. */
  commission: number;
  swap: number;
  profit: number;
}

export interface MtBalanceOp {
  wallMs: number;
  deal: string;
  /** Positive = deposit, negative = withdrawal. */
  amount: number;
  comment: string;
}

export interface MtReport {
  platform: MtPlatform;
  account: MtAccount | null;
  positions: MtPosition[];
  balanceOps: MtBalanceOp[];
  /** Price decimals seen per symbol (trailing zeros count): the terminal prints prices at the symbol's digits. */
  digitsBySymbol: Record<string, number>;
  /** Positions that are still open in the report. They are never imported. */
  openCount: number;
  skipped: { row: number; reason: string }[];
  warnings: string[];
}

/** Machine-readable reason a file could not be read, so the UI can say exactly what to do. */
export type MtErrorCode =
  | "empty"
  | "not-a-report"
  | "unsupported-language"
  | "mt5-no-positions"
  | "mt4-no-closed-transactions";

export class MtParseError extends Error {
  readonly code: MtErrorCode;
  constructor(message: string, code: MtErrorCode = "not-a-report") {
    super(message);
    this.name = "MtParseError";
    this.code = code;
  }
}
