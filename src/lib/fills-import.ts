/**
 * Rows that are individual FILLS (a CSV of executions) -> closed trades with their legs.
 * Pure: the dialog does the I/O. Open positions are reported, never imported, so a later file that closes them
 * cannot create duplicates.
 */
import { D, buildPositions, type Fill, type Position } from "../../supabase/functions/_shared/pnl-engine/index.ts";

export interface RawFill {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  timeMs: number;
  /** Cost of this fill as a positive number (a commission), 0 when none. */
  cost: number;
}

export interface FillTradeRow {
  symbol: string;
  direction: "long" | "short";
  entry_at: string;
  exit_at: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  fees: number;
  external_id: string;
  legs: {
    kind: "entry" | "exit";
    side: "buy" | "sell";
    quantity: number;
    price: number;
    executed_at: string;
    commission: number;
    swap: number;
    fee: number;
  }[];
}

export interface FillsResult {
  trades: FillTradeRow[];
  /** Lots left open per symbol: not imported. */
  open: { symbol: string; side: "buy" | "sell"; lots: number }[];
  errors: string[];
}

const iso = (ms: number) => new Date(ms).toISOString();

function toRow(symbol: string, p: Position): FillTradeRow {
  const cost = p.commission.plus(p.swap).plus(p.fee); // signed, costs negative
  const toLeg = (kind: "entry" | "exit") => (l: Position["entries"][number]) => ({
    kind, side: l.side, quantity: l.lots.toNumber(), price: l.price.toNumber(), executed_at: iso(l.timeMs),
    commission: l.commission.toNumber(), swap: l.swap.toNumber(), fee: l.fee.toNumber(),
  });
  return {
    symbol,
    direction: p.side === "buy" ? "long" : "short",
    entry_at: iso(p.openTimeMs),
    exit_at: iso(p.closeTimeMs!),
    entry_price: p.avgEntry.toNumber(),
    exit_price: p.avgExit!.toNumber(),
    quantity: p.lots.toNumber(),
    fees: cost.neg().toNumber(),
    // Deterministic, so importing the same file twice adds nothing.
    external_id: `fills:${symbol}:${p.openTimeMs}:${p.closeTimeMs}:${p.side}:${p.lots.toString()}`,
    legs: [...p.entries.map(toLeg("entry")), ...p.exits.map(toLeg("exit"))],
  };
}

export function fillsToTrades(fills: RawFill[]): FillsResult {
  const bySymbol = new Map<string, Fill[]>();
  const errors: string[] = [];
  fills.forEach((r, i) => {
    if (!(r.quantity > 0) || !(r.price > 0) || !Number.isFinite(r.timeMs)) {
      errors.push(`Fill ${i + 1} (${r.symbol || "no symbol"}) has an unreadable size, price or time and was skipped.`);
      return;
    }
    const list = bySymbol.get(r.symbol) ?? [];
    list.push({ id: String(i + 1), side: r.side, lots: D(r.quantity), price: D(r.price), timeMs: r.timeMs, commission: r.cost ? D(r.cost).neg() : undefined });
    bySymbol.set(r.symbol, list);
  });
  const trades: FillTradeRow[] = [];
  const open: FillsResult["open"] = [];
  for (const [symbol, list] of bySymbol) {
    const res = buildPositions(list);
    res.closed.forEach((p) => trades.push(toRow(symbol, p)));
    if (res.open) open.push({ symbol, side: res.open.side, lots: res.open.remaining.toNumber() });
  }
  trades.sort((a, b) => a.exit_at.localeCompare(b.exit_at));
  return { trades, open, errors };
}
