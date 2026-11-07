/** Append to the list under `key`, creating it once. (`[...(m.get(k) ?? []), x]` copies the list on every insert: quadratic.) */
export function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** Calendar names sort in calendar order (Monday first), anything else naturally (Week 3 before Week 12). */
export function compareKeys(a: string, b: string): number {
  for (const list of [WEEKDAYS, MONTH_NAMES]) {
    const i = list.indexOf(a.toLowerCase()),
      j = list.indexOf(b.toLowerCase());
    if (i >= 0 && j >= 0) return i - j;
  }
  return a.localeCompare(b, undefined, { numeric: true });
}
