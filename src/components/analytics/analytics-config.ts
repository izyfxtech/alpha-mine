import { useMemo } from "react";
import { useLookups } from "@/lib/journal/journal-context";
import { localMonth } from "@/lib/time/local-time";
import { isLoss, isWin, type Trade } from "@/lib/pnl/metrics";

export type Crit = { key: string; label: string; get: (t: Trade) => string[] };
const comments = (phase: string) => (t: Trade) => {
  const c = t.comments.filter((x) => x.phase === phase).map((x) => x.label);
  return c.length ? c : ["No comment"];
};
export const CRITERIA: Crit[] = [
  { key: "setup", label: "Trade Setups", get: (t) => [t.setup] },
  {
    key: "outcome",
    label: "Outcome",
    get: (t) => [isWin(t) ? "Winner" : isLoss(t) ? "Loser" : "Break even"],
  },
  { key: "direction", label: "Direction", get: (t) => [t.direction === "long" ? "Long" : "Short"] },
  { key: "entry", label: "Entry Comment", get: comments("entry") },
  { key: "management", label: "Management Comment", get: comments("management") },
  { key: "exit", label: "Exit Comment", get: comments("exit") },
  { key: "instrument", label: "Trade Instruments", get: (t) => [t.instrument] },
  {
    key: "weekday",
    label: "Weekday",
    get: (t) => [new Date(t.entry_at).toLocaleDateString("en-US", { weekday: "long" })],
  },
  { key: "month", label: "Month", get: (t) => [localMonth(t.entry_at)] },
  { key: "type", label: "Trade Type", get: (t) => [t.trade_type || "—"] },
];

export const COLS: { k: string; l: string }[] = [
  { k: "n", l: "Amount" },
  { k: "qty", l: "Avg. Qty." },
  { k: "wr", l: "Winrate (%)" },
  { k: "avgPnl", l: "Avg. P&L ($)" },
  { k: "sum", l: "Sum. Gain ($)" },
  { k: "pf", l: "Profit Factor" },
  { k: "avgR", l: "Avg. R-Multiple" },
  { k: "sumR", l: "Sum. R-Multiple" },
  { k: "planR", l: "Avg. Planned R" },
  { k: "mw", l: "Max. Cons. Winners" },
  { k: "ml", l: "Max. Cons. Losers" },
  { k: "dd", l: "Avg. Drawdown (%)" },
  { k: "up", l: "Avg. Updraw (%)" },
  { k: "mae", l: "Avg. MAE" },
  { k: "mfe", l: "Avg. MFE" },
  { k: "fees", l: "Fees ($)" },
  { k: "ret", l: "Return (%)" },
  { k: "avgRet", l: "Avg. Return (%)" },
];
export const DEFAULT_VISIBLE = COLS.map((c) => c.k);

/** Built-in criteria plus one per custom statistic category, in the order set up in Settings. */
export function useCriteria(journalId?: string): Crit[] {
  const { data: lookups } = useLookups(journalId);
  return useMemo(() => {
    const optById = new Map((lookups?.statOptions ?? []).map((o) => [o.id, o]));
    const custom = (lookups?.statCategories ?? []).map((c): Crit => ({
      key: `cs:${c.id}`,
      label: c.name,
      get: (t) => {
        const v = t.customStats
          .map((id) => optById.get(id))
          .filter((o) => o?.category_id === c.id)
          .map((o) => o!.label);
        return v.length ? v : ["Not set"];
      },
    }));
    return [...CRITERIA, ...custom];
  }, [lookups]);
}

/** Height of every row of the grouped table. */
export const ANALYTICS_ROW_CLASS = "h-[30px] text-xs";
