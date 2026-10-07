import { useMemo } from "react";
import { useTrades } from "@/lib/journal-context";
import { computeEdgeFinder } from "@/lib/edge-finder";

/** Edge Finder insights for the active journal (always over all trades, never the filtered subset). */
export function useEdgeInsights() {
  const { trades, journal } = useTrades({ unfiltered: true });
  const insights = useMemo(() => {
    if (!journal) return [];
    return computeEdgeFinder(trades, journal.starting_balance, journal.currency || "USD");
  }, [trades, journal]);
  return insights;
}
