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

/** A stored list of strings. Anything else under the key (an older format, hand-edited data) counts as no list. */
export function storageStrings(key: string): string[] {
  const value = storageJson<unknown>(key, []);
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : [];
}

/** A stored object of string values, for the same reason. */
export function storageStringMap(key: string): Record<string, string> {
  const value = storageJson<unknown>(key, {});
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;
}
