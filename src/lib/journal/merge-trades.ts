import type { Trade } from "@/lib/pnl/metrics";

/**
 * Merging two or more trades means one of two different things:
 *   "combine"   parts of ONE position (scale-in, partial exits): size and money are added up
 *   "duplicate" the SAME trade logged twice (typed by hand and also imported): nothing is added up, one set of numbers stands
 * Either way notes, screenshots, comments, tags and rule checks from every trade are kept (the merge_trades SQL function).
 */
export type MergeMode = "combine" | "duplicate";

type Mergeable = Pick<
  Trade,
  "id" | "direction" | "entry_at" | "entry_price" | "quantity" | "external_id" | "instrument_id"
>;

/** Imported trades carry the broker's ticket; trades typed by hand do not. */
export const isImported = (t: Pick<Trade, "external_id">) => !!t.external_id;

const within = (a: number, b: number, rel: number) => Math.abs(a - b) <= Math.abs(b) * rel;

/**
 * Do these trades look like one trade logged more than once? Same direction, the same size (within 1%), the same entry price
 * (within 0.1%) and entries within a day of each other (a broker's clock and yours can be hours apart). Scale-in legs rarely
 * match all four. It only decides which option is pre-selected; the trader always chooses.
 */
export function looksLikeDuplicate(ts: Mergeable[]): boolean {
  if (ts.length < 2) return false;
  const first = ts[0]!;
  return ts.every(
    (t) =>
      t.direction === first.direction &&
      within(Number(t.quantity), Number(first.quantity), 0.01) &&
      within(Number(t.entry_price), Number(first.entry_price), 0.001) &&
      Math.abs(new Date(t.entry_at).getTime() - new Date(first.entry_at).getTime()) <= 864e5,
  );
}

/** Whose numbers win by default for a duplicate: an imported trade (the broker's figures), else the earliest. Matches the SQL default. */
export function defaultKeeper<T extends Mergeable>(ts: T[]): T | undefined {
  return [...ts].sort(
    (a, b) =>
      Number(isImported(b)) - Number(isImported(a)) ||
      a.entry_at.localeCompare(b.entry_at) ||
      a.id.localeCompare(b.id),
  )[0];
}

/** Why these trades cannot be merged in this mode, or null. A duplicate may differ in instrument (the symbol can be spelled differently by a broker); parts of one position may not. */
export function mergeBlocker(ts: Mergeable[], mode: MergeMode): string | null {
  if (ts.length < 2) return "Select at least two trades to merge.";
  if (new Set(ts.map((t) => t.direction)).size > 1)
    return "Trades in opposite directions cannot be merged.";
  if (mode === "combine" && new Set(ts.map((t) => t.instrument_id)).size > 1)
    return "Combining needs the same instrument. If these are the same trade logged twice, choose “Same trade”.";
  return null;
}
