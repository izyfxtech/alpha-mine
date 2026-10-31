/**
 * One time policy for the whole app (AM-M03, AM-Y02, AM-Y03, AM-M01, AM-X03): trades are stored as UTC instants, and
 * EVERYTHING a person sees or groups by (days, weeks, months, hours, tables, forms) uses the browser's own time
 * zone, with the offset in force on that date, so DST is right. Mixing the two is what made one trade appear on one
 * day in the calendar and on another weekday in a chart.
 *
 * Broker-side time (Prop Challenge firm zone, MetaTrader server time) is handled where it is parsed and is not
 * affected: those convert to a real instant first.
 */
const pad = (n: number) => String(n).padStart(2, "0");

/** yyyy-mm-dd of the instant in the local zone. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** yyyy-mm of the instant in the local zone. */
export const localMonth = (iso: string) => localDay(iso).slice(0, 7);
/** yyyy-mm-dd hh:mm in the local zone, for tables and lists. Empty for null. */
export function localDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${localDay(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Today's date (yyyy-mm-dd) in the local zone. */
export const localToday = () => localDay(new Date().toISOString());
/** Monday (yyyy-mm-dd, local) of the week the instant falls in. */
export function localWeekStart(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** An ISO instant as the value of a datetime-local input: local zone AT THAT DATE (DST-correct), seconds kept. */
export function toInputValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${localDay(iso)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
/** The stored instant if the field was not edited (a note change never moves a broker time), else the typed one. */
export function fromInputValue(typed: string, original?: string | null): string {
  return original && typed === toInputValue(original) ? original : new Date(typed).toISOString();
}
