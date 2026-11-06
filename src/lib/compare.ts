/** Helpers for Chart Lab → Compare Charts: which groups can be picked and what to show when a pick no longer exists. */
export const COMPARE_ALL = "All";

/** Distinct values of a dimension, sorted, for the group picker. */
export function groupValues<T>(trades: T[], key: (t: T) => string): string[] {
  return [...new Set(trades.map(key))].sort((a, b) => a.localeCompare(b));
}

/** The picked value if it still has trades, otherwise the first one that does (a filter or journal switch can remove it). */
export function resolveValue(values: string[], picked: string): string {
  return values.includes(picked) ? picked : (values[0] ?? picked);
}

/** Running total of a group's results, starting from 0 so both lines leave the same origin. */
export function runningTotal(values: number[]): number[] {
  let s = 0;
  return [0, ...values.map((v) => +(s += v).toFixed(2))];
}
