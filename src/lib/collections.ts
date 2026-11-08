/** A copy of `set` with `value` removed if it was there, or added if it was not. Never changes the original. */
export function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}
