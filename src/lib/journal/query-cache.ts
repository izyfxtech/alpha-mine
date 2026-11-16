import type { QueryClient } from "@tanstack/react-query";

/**
 * Options for the heavy journal queries (trades, lookups, cash flows).
 *
 * These download every row of a journal, so they must not reload on every window focus or
 * every mount. Anything that changes the data calls `invalidateData`, which marks the query
 * stale regardless of `staleTime`. Changes made on another device show up after the stale
 * time or on reload.
 */
export const JOURNAL_DATA_OPTIONS = {
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false,
} as const;

/** Query-key prefixes, grouped by what a write changed. */
const KEYS = {
  journals: [["journals"]],
  trades: [
    ["trades"],
    ["trade_executions"],
    ["alt_strategies_for_trade"],
    ["alt_strategy_results"],
  ],
  lookups: [["lookups"]],
  cashflows: [["journal_cashflows"]],
  screenshots: [["screenshots"], ["screenshot-ids"], ["merge-shot-count"]],
  progress: [["getting-started"], ["onboarding-trade-count"]],
  mentors: [["mentorships"], ["my_students"], ["mentee_journal"], ["mentor_invites"]],
  feedback: [["feedback"]],
  notifications: [["notifications"]],
} as const;

export type DataKind = keyof typeof KEYS;

/**
 * Invalidates only the queries a write affects, instead of `qc.invalidateQueries()` with no
 * key, which re-downloads everything the app has cached.
 */
export async function invalidateData(qc: QueryClient, ...kinds: DataKind[]): Promise<void> {
  await Promise.all(
    kinds.flatMap((kind) => KEYS[kind].map((queryKey) => qc.invalidateQueries({ queryKey }))),
  );
}
