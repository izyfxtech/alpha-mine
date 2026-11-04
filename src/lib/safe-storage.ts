/** localStorage that never throws: private windows and blocked site data make every access an error. Values just are not remembered. */
export function storageGet(key: string): string | null {
  try { return typeof localStorage === "undefined" ? null : localStorage.getItem(key); } catch { return null; }
}
export function storageSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* not remembered */ }
}
export function storageJson<T>(key: string, fallback: T): T {
  const raw = storageGet(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
