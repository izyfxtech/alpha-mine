import { useCallback, useEffect, useMemo, useState } from "react";
import { useLookups, useTrades } from "@/lib/journal-context";
import { computeEdgeFinder, type EdgeCard } from "@/lib/edge-finder";

/**
 * Edge Finder cards for the active journal, always over all trades (never the filtered subset).
 * Cards the user chose to "Ignore" are remembered per journal in this browser.
 */
export function useEdgeCards() {
  const { trades, journal } = useTrades({ unfiltered: true });
  const { data: lookups } = useLookups(journal?.id);
  const storageKey = journal ? `am.edge-ignored.${journal.id}` : null;
  const [ignored, setIgnored] = useState<string[]>([]);
  useEffect(() => {
    if (!storageKey) return;
    try { setIgnored(JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[]); } catch { setIgnored([]); }
  }, [storageKey]);
  const persist = useCallback((next: string[]) => {
    setIgnored(next);
    if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* private mode: keep it in memory only */ } }
  }, [storageKey]);

  const cards = useMemo<EdgeCard[]>(() => {
    if (!journal) return [];
    const cats = new Map((lookups?.statCategories ?? []).map((c) => [c.id, c.name]));
    const names = new Map((lookups?.statOptions ?? []).map((o) => [o.id, { label: o.label, category: cats.get(o.category_id) ?? "" }]));
    return computeEdgeFinder(trades, journal.starting_balance, journal.currency || "USD", names);
  }, [trades, journal, lookups]);

  const visible = cards.filter((c) => c.ready && !ignored.includes(c.id));
  return {
    cards, visible, ignored,
    ignore: (id: string) => persist([...new Set([...ignored, id])]),
    restoreAll: () => persist([]),
  };
}

/** Number of insights shown on the Home banner. */
export const useEdgeInsights = () => useEdgeCards().visible;
