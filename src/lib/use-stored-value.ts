import { useCallback, useMemo, useSyncExternalStore } from "react";
import { storageGet, storageSet } from "@/lib/safe-storage";

/**
 * Values kept in localStorage, read through useSyncExternalStore: the server and first client render see `null`, then the stored
 * value arrives without an effect, and changes made anywhere in this tab (or in another tab) re-render every reader.
 * When storage is blocked the value is kept in memory for the rest of the visit.
 */

const listeners = new Set<() => void>();
const memory = new Map<string, string | null>();

const notify = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => {
    memory.clear(); // another tab wrote: its value is the truth now
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const read = (key: string) => (memory.has(key) ? memory.get(key)! : storageGet(key));

function write(key: string, value: string) {
  memory.set(key, value);
  storageSet(key, value);
  notify();
}

function parseJson(raw: string | null): unknown {
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** The raw string under `key` (or null), and a setter. Pass `null` as the key to read nothing, for values that are not known yet. */
export function useStoredString(key: string | null) {
  const value = useSyncExternalStore(
    subscribe,
    () => (key ? read(key) : null),
    () => null,
  );
  const set = useCallback(
    (next: string) => {
      if (key) write(key, next);
    },
    [key],
  );
  return [value, set] as const;
}

/**
 * A JSON value under `key`. `parse` receives whatever was stored (or `undefined` when nothing usable is) and returns the value
 * to use, so an old format or hand-edited data falls back to a default instead of breaking the page. `parse` must be a
 * stable function (defined outside the component), since the result is recomputed only when the stored text changes.
 */
export function useStoredJson<T>(key: string | null, parse: (stored: unknown) => T) {
  const [raw] = useStoredString(key);
  const value = useMemo(() => parse(parseJson(raw)), [raw, parse]);
  /** Saves a value, or the result of a function of the latest saved one (safe to call from long-lived handlers such as a drag). */
  const set = useCallback(
    (next: T | ((current: T) => T)) => {
      if (!key) return;
      const resolved =
        typeof next === "function"
          ? (next as (current: T) => T)(parse(parseJson(read(key))))
          : next;
      write(key, JSON.stringify(resolved));
    },
    [key, parse],
  );
  return [value, set] as const;
}

const noSubscribe = () => () => {};

/** False on the server and during hydration, true afterwards, without an effect. */
export function useHydrated() {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}
