import { describe, expect, it } from "vitest";
import { complianceOf, complianceReport, type RuleStatus } from "@/lib/pnl/compliance";
import { matchesQuery } from "@/lib/journal/search";
import { openRow, openTotals } from "@/lib/pnl/open-trades";
import { isOpen, type Trade } from "@/lib/pnl/metrics";

const tr = (i: number, net: number, checks: [string, RuleStatus][] = [], extra: Partial<Trade> = {}) => ({
  id: `trade-${i}`, trade_no: i, instrument: "EURUSD", setup: "Retest", direction: "long", trade_type: "Spot", source: "manual", external_id: null, notes: null,
  entry_at: "2026-10-05T10:00:00Z", exit_at: "2026-10-05T12:00:00Z", entry_price: 100, exit_price: 101, quantity: 10, stop_loss: 99, take_profit: 103, risk_amount: null,
  net_pnl: net, gross_pnl: net, is_break_even: false, r: net / 10, comments: [],
  ruleChecks: checks.map(([rule_id, status]) => ({ rule_id, status })), ...extra,
}) as unknown as Trade;

describe("compliance", () => {
  it("derives the trade status from its checks", () => {
    expect(complianceOf([])).toBe("unrated");
    expect(complianceOf([{ rule_id: "a", status: "followed" }, { rule_id: "b", status: "partial" }])).toBe("partial");
    expect(complianceOf([{ rule_id: "a", status: "followed" }, { rule_id: "b", status: "violated" }])).toBe("violated");
  });
  it("withholds the cost estimate until there are enough trades of each kind", () => {
    const few = [tr(1, 10, [["a", "followed"]]), tr(2, -10, [["a", "violated"]])];
    expect(complianceReport(few, [{ id: "a", name: "A" }]).cost.gap).toBeNull();
    const many = [...Array(5)].map((_, i) => tr(i, 20, [["a", "followed"]])).concat([...Array(3)].map((_, i) => tr(10 + i, -10, [["a", "violated"]])));
    const rep = complianceReport(many, [{ id: "a", name: "A" }]);
    expect(rep.cost.enough).toBe(true);
    expect(rep.cost.gap).toBeCloseTo(3 * (20 - -10));
    expect(rep.cost.violatedNet).toBe(-30);
    expect(rep.rules[0]!.violated).toBe(3);
    expect(rep.adherencePct).toBeCloseTo((5 / 8) * 100);
  });
});

describe("search", () => {
  it("needs every word to match, including rule names of broken rules", () => {
    const t = tr(7, -5, [["r1", "violated"]], { notes: "chased the breakout" });
    const names = new Map([["r1", "No revenge trade"]]);
    expect(matchesQuery(t, "chased breakout")).toBe(true);
    expect(matchesQuery(t, "revenge", names)).toBe(true);
    expect(matchesQuery(t, "chased gbpusd")).toBe(false);
    expect(matchesQuery(t, "  ")).toBe(true);
  });
});

describe("open trades", () => {
  it("is open without an exit price or date", () => {
    expect(isOpen({ exit_at: null, exit_price: null })).toBe(true);
    expect(isOpen({ exit_at: "2026-10-05T12:00:00Z", exit_price: 1 })).toBe(false);
  });
  it("computes risk, targets and what-if results for longs and shorts", () => {
    const long = openRow(tr(1, 0), 102, Date.parse("2026-10-07T10:00:00Z"));
    expect(long.risk).toBe(10);
    expect(long.atTarget).toBe(30);
    expect(long.atStop).toBe(-10);
    expect(long.plannedRR).toBe(3);
    expect(long.unrealized).toBe(20);
    expect(long.unrealizedR).toBe(2);
    expect(long.ageDays).toBeCloseTo(2 - 0, 0);
    const short = openRow(tr(2, 0, [], { direction: "short", stop_loss: 101, take_profit: 97 } as Partial<Trade>), 99);
    expect(short.unrealized).toBe(10);
    expect(short.atTarget).toBe(30);
    expect(short.atStop).toBe(-10);
  });
  it("totals risk and leaves unrealized empty until a price is given", () => {
    const rows = [openRow(tr(1, 0), null), openRow(tr(2, 0, [], { stop_loss: null, risk_amount: null } as Partial<Trade>), null)];
    const tot = openTotals(rows);
    expect(tot.risk).toBe(10);
    expect(tot.unpriced).toBe(1);
    expect(tot.unrealized).toBeNull();
  });
});
