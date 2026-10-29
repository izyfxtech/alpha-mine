/**
 * MetaTrader 5 "Trade History Report" parser (HTML or Excel export, English terminal).
 *
 * The report has up to three tables: Positions, Orders and Deals. Positions is the one we use: one row per
 * closed position with open/close time and price, SL/TP, commission, swap and profit. That is correct for hedging
 * AND netting accounts, because MT5 itself rolls the deals up into positions. Deals is only read for balance
 * operations (deposits/withdrawals), which are reported but never turned into trades.
 *
 * Design rules:
 *  - Pure and synchronous: no network, no Supabase. `parseMt5Report` takes the file bytes.
 *  - Rows are read by ANCHORS (datetime cells, trailing numeric cells), not by header index. MT5's HTML has
 *    colspans and spacer cells, and Excel exports add empty columns, so header positions drift between builds.
 *  - Never guess. A row that does not look like a closed position is counted in `skipped` with a reason.
 *  - Times are returned as SERVER wall-clock encoded as UTC ms ("wall ms"). Convert with `serverWallToUtcMs`.
 */
import * as XLSX from "xlsx";

export interface Mt5Account {
  login: string;
  currency: string;
  server: string | null;
  /** "real" | "demo" | "contest" when the header says so. */
  mode: string | null;
  /** "Hedge" | "Netting" | "Exchange" when the header says so. */
  type: string | null;
  name: string | null;
}

export interface Mt5Position {
  /** MT5 position ticket. Stable and unique per account: the import idempotency key. */
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
  /** Signed account-currency amounts, exactly as booked (costs are negative). */
  commission: number;
  swap: number;
  profit: number;
}

export interface Mt5BalanceOp {
  wallMs: number;
  deal: string;
  /** Positive = deposit, negative = withdrawal. */
  amount: number;
  comment: string;
}

export interface Mt5Report {
  account: Mt5Account | null;
  positions: Mt5Position[];
  balanceOps: Mt5BalanceOp[];
  /** Price decimals seen per symbol (trailing zeros count): MT5 prints prices at the symbol's digits. */
  digitsBySymbol: Record<string, number>;
  skipped: { row: number; reason: string }[];
  warnings: string[];
}

export class Mt5ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Mt5ParseError";
  }
}

// ---------------------------------------------------------------------------------------------- cell helpers

const WS = /[\s  ]+/g;
const clean = (v: unknown): string => (v == null ? "" : String(v).replace(WS, " ").trim());

const DATETIME = /^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/** "2026.10.23 14:05:09" -> wall ms (server clock encoded as UTC). null when not a datetime. */
export function parseWallTime(s: string): number | null {
  const m = DATETIME.exec(clean(s));
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const ms = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +(se ?? 0));
  // Date.UTC silently rolls 2026.13.45 over: round-trip to reject it.
  const back = new Date(ms);
  if (back.getUTCMonth() !== +mo! - 1 || back.getUTCDate() !== +d!) return null;
  return ms;
}

const NUMBER = /^[+-]?\d+(?:\.\d+)?$/;

/**
 * MT5 prints "1 234.56" (space or NBSP thousands separator, dot decimal). Commas are treated as thousands
 * separators. Returns null for blanks and anything else so callers decide what is acceptable.
 */
export function parseNumber(s: unknown): number | null {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const t = clean(s).replace(/ /g, "").replace(/,/g, "");
  if (!NUMBER.test(t)) return null;
  return Number(t);
}

const decimalsOf = (s: unknown): number => {
  const t = clean(s).replace(/ /g, "").replace(/,/g, "");
  return NUMBER.test(t) ? (t.split(".")[1] ?? "").length : 0;
};

// ----------------------------------------------------------------------------------------- bytes -> rows

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  // BOM-less UTF-16LE (MT5 sometimes omits it): ASCII text has a NUL every second byte.
  if (bytes.length > 4 && bytes[1] === 0 && bytes[3] === 0) return new TextDecoder("utf-16le").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

function htmlToRows(html: string): string[][] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows: string[][] = [];
  doc.querySelectorAll("tr").forEach((tr) => {
    // A cell's own text only: nested tables would otherwise duplicate their content into the parent row.
    const cells = Array.from(tr.children)
      .filter((c) => c.tagName === "TD" || c.tagName === "TH")
      .map((c) => clean(c.textContent));
    if (cells.some(Boolean)) rows.push(cells);
  });
  return rows;
}

function xlsxToRows(bytes: Uint8Array): string[][] {
  const wb = XLSX.read(bytes, { type: "array", cellDates: false });
  const rows: string[][] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    // raw:false gives the formatted text, so "0.10" and "1.08500" keep the digits MT5 printed.
    for (const r of XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false })) {
      const cells = r.map(clean);
      if (cells.some(Boolean)) rows.push(cells);
    }
  }
  return rows;
}

export function isXlsx(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK": xlsx is a zip container
}

// --------------------------------------------------------------------------------------------- the parser

const ACCOUNT = /Account:?\s*(\d+)\s*(?:\(([^)]*)\))?/i;
const SECTIONS = ["positions", "orders", "deals"] as const;
type Section = (typeof SECTIONS)[number];

function parseAccount(rows: string[][]): Mt5Account | null {
  let login: string | null = null;
  let details: string[] = [];
  let name: string | null = null;
  for (const r of rows.slice(0, 40)) {
    const line = r.filter(Boolean).join(" ");
    const a = ACCOUNT.exec(line);
    if (a && !login) {
      login = a[1]!;
      details = (a[2] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    }
    const n = /^Name:?\s*(.+)$/i.exec(line);
    if (n && !name) name = n[1]!.trim();
  }
  if (!login) return null;
  // "(USD, MetaQuotes-Demo, demo, Hedge)": currency first, server second, then mode and type in either order.
  const currency = (details.find((d) => /^[A-Z]{3,5}$/.test(d)) ?? "").toUpperCase();
  const rest = details.filter((d) => d.toUpperCase() !== currency);
  const mode = rest.find((d) => /^(real|demo|contest)$/i.test(d))?.toLowerCase() ?? null;
  const type = rest.find((d) => /^(hedge|hedging|netting|exchange)$/i.test(d))?.toLowerCase() ?? null;
  const server = rest.find((d) => d !== mode && d.toLowerCase() !== type) ?? null;
  return { login, currency, server, mode, type, name };
}

function sectionOf(row: string[]): Section | null {
  const cells = row.filter(Boolean);
  if (cells.length !== 1) return null;
  const t = cells[0]!.toLowerCase();
  return (SECTIONS as readonly string[]).includes(t) ? (t as Section) : null;
}

/** Trim leading/trailing empty cells (spacer columns) but keep the empties in the middle, they are meaningful. */
function trimCells(cells: string[]): string[] {
  let a = 0;
  let b = cells.length;
  while (a < b && !cells[a]) a++;
  while (b > a && !cells[b - 1]) b--;
  return cells.slice(a, b);
}

type PositionRow = { ok: true; pos: Mt5Position; digits: number } | { ok: false; reason: string; ignore?: boolean };

/**
 * Positions row layout once spacer columns are trimmed:
 *   openTime, ticket, symbol, type, volume, openPrice, [S/L], [T/P], closeTime, closePrice, commission, swap, profit
 * Everything is read relative to the two datetimes and the last three numbers, so S/L and T/P cells may be
 * empty, merged away or absent without shifting any other column.
 */
function parsePositionRow(raw: string[]): PositionRow {
  const c = trimCells(raw);
  const open = parseWallTime(c[0] ?? "");
  if (open === null) return { ok: false, reason: "not a position row", ignore: true };
  if (c.length < 11) return { ok: false, reason: `expected at least 11 columns, found ${c.length}` };

  const n = c.length;
  const closeIdx = n - 5;
  const close = parseWallTime(c[closeIdx] ?? "");
  if (close === null) return { ok: false, reason: "close time is missing or unreadable (position still open?)" };

  const ticket = c[1]!;
  const symbol = c[2]!;
  const type = c[3]!.toLowerCase();
  if (!/^\d+$/.test(ticket)) return { ok: false, reason: `unreadable position ticket "${ticket}"` };
  if (!symbol) return { ok: false, reason: "missing symbol" };
  if (type !== "buy" && type !== "sell") return { ok: false, reason: `unsupported type "${c[3]}"` };

  // "0.10" or, for partially closed legs, "0.10 / 0.30": the first figure is the closed volume.
  const volume = parseNumber((c[4] ?? "").split("/")[0]);
  const openPrice = parseNumber(c[5]);
  const closePrice = parseNumber(c[n - 4]);
  const commission = parseNumber(c[n - 3]);
  const swap = parseNumber(c[n - 2]);
  const profit = parseNumber(c[n - 1]);
  if (volume === null || volume <= 0) return { ok: false, reason: `unreadable volume "${c[4]}"` };
  if (openPrice === null || closePrice === null) return { ok: false, reason: "unreadable open/close price" };
  if (commission === null || swap === null || profit === null) return { ok: false, reason: "unreadable commission/swap/profit" };
  if (close < open) return { ok: false, reason: "close time precedes open time" };

  // Between openPrice (index 5) and closeTime: S/L and T/P. Two cells = both columns present.
  const mid = c.slice(6, closeIdx);
  const sl = mid.length >= 2 ? parseNumber(mid[0]) : null;
  const tp = mid.length >= 2 ? parseNumber(mid[1]) : null;

  const digits = Math.max(decimalsOf(c[5]), decimalsOf(c[n - 4]), decimalsOf(mid[0]), decimalsOf(mid[1]));
  return {
    ok: true,
    digits,
    pos: {
      ticket,
      symbol,
      side: type,
      volume,
      openWallMs: open,
      closeWallMs: close,
      openPrice,
      closePrice,
      stopLoss: sl !== null && sl > 0 ? sl : null,
      takeProfit: tp !== null && tp > 0 ? tp : null,
      commission,
      swap,
      profit,
    },
  };
}

/**
 * Deals rows hold deposits/withdrawals as type "balance". Merged cells shift the columns, so anchor on the
 * word "balance": after it come profit (the signed amount), the running balance, then an optional comment.
 */
function parseBalanceRow(raw: string[]): Mt5BalanceOp | null {
  const c = trimCells(raw);
  const t = parseWallTime(c[0] ?? "");
  const at = c.findIndex((x, i) => i >= 2 && /^balance$/i.test(x));
  if (t === null || at < 0) return null;
  const tail = c.slice(at + 1);
  const nums = tail.filter((x) => parseNumber(x) !== null);
  if (nums.length < 2) return null;
  const amount = parseNumber(nums[nums.length - 2])!;
  const lastNum = tail.lastIndexOf(nums[nums.length - 1]!);
  return { wallMs: t, deal: c[1] ?? "", amount, comment: tail.slice(lastNum + 1).filter(Boolean).join(" ") };
}

/** Parse already-extracted table rows. Exposed for tests and for callers that bring their own extraction. */
export function parseMt5Rows(rows: string[][]): Mt5Report {
  const report: Mt5Report = {
    account: parseAccount(rows),
    positions: [],
    balanceOps: [],
    digitsBySymbol: {},
    skipped: [],
    warnings: [],
  };

  let section: Section | null = null;
  let sawPositionsHeader = false;
  const seen = new Set<string>();

  rows.forEach((row, idx) => {
    const s = sectionOf(row);
    if (s) {
      section = s;
      if (s === "positions") sawPositionsHeader = true;
      return;
    }
    if (section === "positions") {
      const r = parsePositionRow(row);
      if (r.ok) {
        if (seen.has(r.pos.ticket)) {
          report.skipped.push({ row: idx + 1, reason: `duplicate ticket ${r.pos.ticket}` });
          return;
        }
        seen.add(r.pos.ticket);
        report.positions.push(r.pos);
        const prev = report.digitsBySymbol[r.pos.symbol] ?? 0;
        report.digitsBySymbol[r.pos.symbol] = Math.min(8, Math.max(prev, r.digits));
      } else if (!r.ignore) {
        report.skipped.push({ row: idx + 1, reason: r.reason });
      }
    } else if (section === "deals") {
      const b = parseBalanceRow(row);
      if (b) report.balanceOps.push(b);
    }
  });

  if (!sawPositionsHeader) {
    throw new Mt5ParseError(
      'No "Positions" section found. Export the report from MetaTrader 5 (History tab → right click → Report → HTML or Excel) with the "Positions" view, and make sure the terminal language is English.',
    );
  }
  if (!report.account) report.warnings.push("The report has no account header, so it cannot be matched to a linked account.");
  else if (!report.account.currency) report.warnings.push("The account currency could not be read from the report header.");
  if (report.account?.type && /netting|exchange/.test(report.account.type)) {
    report.warnings.push("Netting account: each row is a position as MT5 rolled it up, which is what is imported.");
  }
  if (report.positions.length === 0 && report.skipped.length === 0) report.warnings.push("The Positions section is empty.");
  return report;
}

/** Entry point: raw bytes of the uploaded .html/.htm/.xlsx file. */
export function parseMt5Report(bytes: Uint8Array): Mt5Report {
  if (bytes.length === 0) throw new Mt5ParseError("The file is empty.");
  const rows = isXlsx(bytes) ? xlsxToRows(bytes) : htmlToRows(decodeText(bytes));
  if (rows.length === 0) throw new Mt5ParseError("No table rows found: this does not look like a MetaTrader 5 report.");
  return parseMt5Rows(rows);
}
