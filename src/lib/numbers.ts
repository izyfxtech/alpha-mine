/** A form or database value as a number, or null when it is empty (null, undefined, "" or only spaces). */
export function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return Number(value);
}

/** Running totals: the sum of the first 1, 2, 3… values. `cumulative([1, 2, 3])` is `[1, 3, 6]`. */
export function cumulative(values: readonly number[], from = 0): number[] {
  const out: number[] = [];
  let total = from;
  for (const v of values) out.push((total += v));
  return out;
}
