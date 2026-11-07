/** A form or database value as a number, or null when it is empty (null, undefined, "" or only spaces). */
export function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return Number(value);
}
