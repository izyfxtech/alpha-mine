/**
 * MetaTrader 4 account-history statement rows -> MtReport (English terminal).
 *
 * Source: Account History tab -> right click -> "Save as Report" / "Save as Detailed Report" (an .htm file).
 * The statement has a header ("Account: 1234567  Name: ...  Currency: USD"), then sections titled
 * "Closed Transactions:", "Open Trades:" and "Working Orders:". Only Closed Transactions is read.
 *
 * Closed Transactions columns (spacer cells trimmed):
 *   Ticket, Open Time, Type, Size, Item, Price, S/L, T/P, Close Time, Price, Commission, [Taxes], Swap, Profit
 * Taxes is present on some builds only, so the tail is read from the END: 3 numbers after the close price means
 * commission, swap, profit; 4 means commission, taxes, swap, profit. Taxes are a cost like commission, so they are
 * folded into `commission` and net profit stays exact.
 *
 * Rows that are not trades (balance, credit, cancelled pending orders, totals) are recognised and never imported as
 * trades. Deposits/withdrawals (type "balance") are returned as `balanceOps`.
 *
 * Same rules as the MT5 parser: pure, anchored on datetimes, never guess, server wall-clock times.
 */
import { decimalsOf, parseNumber, parseWallTime, sectionTitle, trimCells } from "./cells.ts";
import type { MtAccount, MtBalanceOp, MtPosition, MtReport } from "./types.ts";

const SECTION_NAMES = new Set([
  "closed transactions",
  "open trades",
  "working orders",
  "summary",
  "details",
]);
type Section = "closed" | "open" | "orders" | "other";

function sectionOf(row: string[]): Section | null {
  const t = sectionTitle(row);
  if (!t || !SECTION_NAMES.has(t)) return null;
  if (t === "closed transactions") return "closed";
  if (t === "open trades") return "open";
  if (t === "working orders") return "orders";
  return "other";
}

/** Header cells arrive either as one "Account: 123" cell or as "Account:" followed by the value cell. */
function labelled(rows: string[][], label: string, value: RegExp): string | null {
  const own = new RegExp(`^${label}:?\\s*(.+)$`, "i");
  const bare = new RegExp(`^${label}:?$`, "i");
  for (const r of rows.slice(0, 30)) {
    for (let i = 0; i < r.length; i++) {
      const cell = r[i] ?? "";
      const inline = own.exec(cell);
      const candidate = inline ? inline[1]! : bare.test(cell) ? (r[i + 1] ?? "") : null;
      if (candidate === null) continue;
      const m = value.exec(candidate.trim());
      if (m) return m[1]!;
    }
  }
  return null;
}

function parseAccount(rows: string[][]): MtAccount | null {
  const login = labelled(rows, "Account", /^(\d+)/);
  if (!login) return null;
  const currency = (labelled(rows, "Currency", /^([A-Za-z]{3,5})\b/) ?? "").toUpperCase();
  const name = labelled(rows, "Name", /^(.+)$/);
  return { login, currency, server: null, mode: null, type: null, name };
}

type Row =
  | { kind: "trade"; pos: MtPosition; digits: number }
  | { kind: "balance"; op: MtBalanceOp }
  | { kind: "open" }
  | { kind: "skip"; reason: string }
  | { kind: "ignore" };

/** Heuristic for broker symbols: MT4 statements print the item in lower case ("eurusd"); the journal uses "EURUSD". */
const symbolOf = (s: string) => (s === s.toLowerCase() ? s.toUpperCase() : s);

function parseClosedRow(raw: string[]): Row {
  const c = trimCells(raw);
  if (!/^\d+$/.test(c[0] ?? "")) return { kind: "ignore" }; // totals, headers, blank spacers
  const open = parseWallTime(c[1] ?? "");
  if (open === null) return { kind: "ignore" };

  const type = (c[2] ?? "").toLowerCase();
  if (type === "balance") {
    const tail = c.slice(3);
    const nums = tail.filter((x) => parseNumber(x) !== null);
    if (nums.length === 0) return { kind: "skip", reason: "balance row without an amount" };
    const amount = parseNumber(nums[nums.length - 1])!;
    const comment = tail.filter((x) => x && parseNumber(x) === null).join(" ");
    return { kind: "balance", op: { wallMs: open, deal: c[0]!, amount, comment } };
  }
  // credit, charge, correction, bonus and cancelled pending orders ("buy limit"...) are not trades.
  if (type !== "buy" && type !== "sell") return { kind: "ignore" };

  let closeIdx = -1;
  for (let i = 3; i < c.length; i++) {
    if (parseWallTime(c[i]!) !== null) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx < 0) return { kind: "skip", reason: "close time is missing or unreadable" };
  const close = parseWallTime(c[closeIdx]!)!;
  if (c.length < 12)
    return { kind: "skip", reason: `expected at least 12 columns, found ${c.length}` };

  const volume = parseNumber(c[3]);
  const symbol = c[4] ?? "";
  const openPrice = parseNumber(c[5]);
  const tail = c.slice(closeIdx + 1);
  const closePrice = parseNumber(tail[0]);
  const money = tail.slice(1).map(parseNumber);
  if (!symbol) return { kind: "skip", reason: "missing symbol" };
  if (volume === null || volume <= 0) return { kind: "skip", reason: `unreadable size "${c[3]}"` };
  if (openPrice === null || closePrice === null)
    return { kind: "skip", reason: "unreadable open/close price" };
  if (money.length !== 3 && money.length !== 4)
    return { kind: "skip", reason: `unexpected column count after close price (${money.length})` };
  if (money.some((x) => x === null))
    return { kind: "skip", reason: "unreadable commission/swap/profit" };
  if (close < open) return { kind: "skip", reason: "close time precedes open time" };

  const nums = money as number[];
  const commission = nums.length === 4 ? nums[0]! + nums[1]! : nums[0]!;
  const swap = nums[nums.length - 2]!;
  const profit = nums[nums.length - 1]!;

  const mid = c.slice(6, closeIdx);
  const sl = mid.length >= 2 ? parseNumber(mid[0]) : null;
  const tp = mid.length >= 2 ? parseNumber(mid[1]) : null;
  const digits = Math.max(
    decimalsOf(c[5]),
    decimalsOf(tail[0]),
    decimalsOf(mid[0]),
    decimalsOf(mid[1]),
  );

  return {
    kind: "trade",
    digits,
    pos: {
      ticket: c[0]!,
      symbol: symbolOf(symbol),
      side: type,
      volume,
      openWallMs: open,
      closeWallMs: close,
      openPrice,
      closePrice,
      stopLoss: sl !== null && sl > 0 ? sl : null,
      takeProfit: tp !== null && tp > 0 ? tp : null,
      commission: Math.round(commission * 1e8) / 1e8,
      swap,
      profit,
    },
  };
}

/** An "Open Trades" row: a ticket, an open time and buy/sell. Counted so the UI can say how many were left out. */
function isOpenTrade(raw: string[]): boolean {
  const c = trimCells(raw);
  if (!/^\d+$/.test(c[0] ?? "") || parseWallTime(c[1] ?? "") === null) return false;
  const type = (c[2] ?? "").toLowerCase();
  return type === "buy" || type === "sell";
}

/** Parse already-extracted MT4 statement rows. The caller has checked that a "Closed Transactions" section exists. */
export function parseMt4Rows(rows: string[][]): MtReport {
  const report: MtReport = {
    platform: "mt4",
    account: parseAccount(rows),
    positions: [],
    balanceOps: [],
    digitsBySymbol: {},
    openCount: 0,
    skipped: [],
    warnings: [],
  };

  let section: Section | null = null;
  const seen = new Set<string>();

  rows.forEach((row, idx) => {
    const s = sectionOf(row);
    if (s) {
      section = s;
      return;
    }
    if (section === "closed") {
      const r = parseClosedRow(row);
      if (r.kind === "trade") {
        if (seen.has(r.pos.ticket)) {
          report.skipped.push({ row: idx + 1, reason: `duplicate ticket ${r.pos.ticket}` });
          return;
        }
        seen.add(r.pos.ticket);
        report.positions.push(r.pos);
        const prev = report.digitsBySymbol[r.pos.symbol] ?? 0;
        report.digitsBySymbol[r.pos.symbol] = Math.min(8, Math.max(prev, r.digits));
      } else if (r.kind === "balance") {
        report.balanceOps.push(r.op);
      } else if (r.kind === "skip") {
        report.skipped.push({ row: idx + 1, reason: r.reason });
      }
    } else if (section === "open" && isOpenTrade(row)) {
      report.openCount++;
    }
  });

  if (!report.account)
    report.warnings.push(
      "The statement has no account header, so it cannot be matched to a linked account.",
    );
  else if (!report.account.currency)
    report.warnings.push("The account currency could not be read from the statement header.");
  if (report.openCount > 0) {
    report.warnings.push(
      `${report.openCount} open trade${report.openCount === 1 ? " is" : "s are"} in the statement and not imported: only closed trades are.`,
    );
  }
  if (report.positions.length === 0 && report.skipped.length === 0)
    report.warnings.push("The Closed Transactions section is empty.");
  return report;
}
