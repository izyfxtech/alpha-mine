/** localStorage that never throws: private windows and blocked site data make every access an error. Values just are not remembered. */
export function storageGet(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered */
  }
}
export function storageJson<T>(key: string, fallback: T): T {
  const raw = storageGet(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** A list of strings, or an empty list for anything else (an older format, hand-edited data). */
export function parseStrings(value: unknown): string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : [];
}

/** An object of string values, or an empty object for anything else. */
export function parseStringMap(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;
}

/** A stored list of strings. */
export function storageStrings(key: string): string[] {
  return parseStrings(storageJson<unknown>(key, []));
}

/** A stored object of string values. */
export function storageStringMap(key: string): Record<string, string> {
  return parseStringMap(storageJson<unknown>(key, {}));
}
