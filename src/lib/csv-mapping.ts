/**
 * Local replacement for the "analyse" step of a broker import: find the header row and suggest which column feeds
 * which AlphaMine field, from common header names. Broker-agnostic on purpose: it never assumes a broker's exact
 * export format, and every suggestion stays editable in the dialog.
 */
export const FIELDS = ["entry_at", "exit_at", "instrument", "setup", "direction", "entry_price", "exit_price", "quantity", "stop_loss", "take_profit", "gross_pnl", "fees", "net_pnl"] as const;
export type Field = (typeof FIELDS)[number];

/** Normalised header names per field, best match first. */
const ALIASES: Record<Field, string[]> = {
  entry_at: ["entryat", "entrytime", "entrydate", "opentime", "opendate", "opened", "filltime", "executiontime", "exectime", "datetime", "timestamp", "time", "tradedate", "date"],
  exit_at: ["exitat", "exittime", "exitdate", "closetime", "closedate", "closed", "closedat"],
  instrument: ["instrument", "symbol", "contract", "ticker", "product", "market", "pair", "asset"],
  setup: ["setup", "strategy"],
  direction: ["direction", "side", "buysell", "bs", "action", "longshort", "orderside"],
  entry_price: ["entryprice", "openprice", "avgentryprice", "fillprice", "avgfillprice", "executionprice", "tradeprice", "tprice", "avgprice", "price"],
  exit_price: ["exitprice", "closeprice", "avgexitprice", "sellprice"],
  quantity: ["quantity", "qty", "filledqty", "filledquantity", "size", "volume", "lots", "contracts", "shares", "filled"],
  stop_loss: ["stoploss", "sl", "stop"],
  take_profit: ["takeprofit", "tp", "target"],
  gross_pnl: ["grosspnl", "grossprofit", "grosspl", "realizedpnl", "realizedpl", "profitloss", "pnl", "pl", "profit"],
  fees: ["fees", "fee", "commissions", "commission", "commissionfee", "commfee", "ibcommission", "comm"],
  net_pnl: ["netpnl", "netprofit", "netpl"],
};

export const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const KNOWN = new Set(Object.values(ALIASES).flat());

/**
 * Brokers often put account info above the table (IBKR statements, MT exports). Pick the row in the first
 * `scan` rows with the most recognisable column names; fall back to the first row.
 */
export function detectHeaderRow(rows: string[][], scan = 30): number {
  let best = 0;
  let bestScore = 1; // need at least two recognised names to move off row 0
  rows.slice(0, scan).forEach((r, i) => {
    const score = new Set(r.map(normalizeHeader).filter((h) => KNOWN.has(h))).size;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

/** field -> header text. A header feeds at most one field, and a field takes its best-ranked alias present. */
export function suggestMapping(header: string[]): Partial<Record<Field, string>> {
  const byNorm = new Map<string, string>();
  header.forEach((h) => { const n = normalizeHeader(h); if (n && !byNorm.has(n)) byNorm.set(n, h); });
  const used = new Set<string>();
  const out: Partial<Record<Field, string>> = {};
  // Claim the more specific fields first so "price" cannot be taken from a file that also has "exit price" etc.
  const order: Field[] = ["exit_at", "exit_price", "net_pnl", "gross_pnl", "stop_loss", "take_profit", "fees", "setup", "instrument", "direction", "quantity", "entry_price", "entry_at"];
  for (const f of order) {
    const hit = ALIASES[f].find((a) => byNorm.has(a) && !used.has(a));
    if (hit) { out[f] = byNorm.get(hit)!; used.add(hit); }
  }
  return out;
}

/** A file with fills in it has a time, side, size and price per row but no exit columns and no P&L. */
export function looksLikeFills(m: Partial<Record<Field, string>>): boolean {
  return !!(m.entry_at && m.direction && m.quantity && m.entry_price && m.instrument) && !m.exit_price && !m.exit_at && !m.gross_pnl && !m.net_pnl;
}

/** RFC 4180 style parser: quoted fields may hold commas, doubled quotes and line breaks. Strips a BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell.trim()); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
