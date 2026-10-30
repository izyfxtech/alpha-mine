import type { Trade } from "@/lib/pnl/metrics";
import { complianceOf, COMPLIANCE_LABEL } from "@/lib/pnl/compliance";

/** Lower-cased text a trade can be found by. */
export function searchText(t: Trade, ruleNames?: ReadonlyMap<string, string>): string {
  return [
    t.instrument, t.raw_symbol, t.setup, t.direction, t.trade_type, t.notes, t.id.slice(0, 8), t.external_id, t.source,
    t.trade_no != null ? `#${t.trade_no}` : "", t.entry_at.slice(0, 10), t.exit_at?.slice(0, 10),
    ...t.comments.map((c) => c.label),
    COMPLIANCE_LABEL[complianceOf(t.ruleChecks)],
    ...t.ruleChecks.filter((c) => c.status !== "followed").map((c) => ruleNames?.get(c.rule_id) ?? ""),
  ].filter(Boolean).join("\n").toLowerCase();
}

/** Every space-separated word must appear somewhere in the trade ("eurusd breakout 2026-10"). Empty query matches all. */
export function matchesQuery(t: Trade, query: string | undefined, ruleNames?: ReadonlyMap<string, string>): boolean {
  const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = searchText(t, ruleNames);
  return words.every((w) => hay.includes(w));
}
