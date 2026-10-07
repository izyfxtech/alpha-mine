import { describe, expect, it } from "vitest";
import { computeEdgeFinder } from "@/lib/edge-finder";
import { niceTicks, tradeAxis, yScale } from "@/components/kit";
import type { Trade } from "@/lib/metrics";

const trade = (i: number, pnl: number, sentiments: ("positive" | "negative")[] = []): Trade =>
  ({ id: `t${i}`, trade_no: i, net_pnl: pnl, entry_at: new Date(Date.UTC(2025, 0, 1 + i, 10)).toISOString(), setup: "Retest", instrument: "EURUSD",
    comments: sentiments.map((sentiment, k) => ({ id: `c${i}${k}`, label: sentiment === "negative" ? "Revenge trade" : "Perfect entry", phase: "entry", sentiment })) }) as unknown as Trade;

describe("Edge Finder", () => {
  it("needs at least 10 trades", () => {
    expect(computeEdgeFinder(Array.from({ length: 9 }, (_, i) => trade(i, 10)), 10_000)).toEqual([]);
  });
  it("reports the edge of rule-following trades and the cost of mistakes", () => {
    const clean = Array.from({ length: 8 }, (_, i) => trade(i, 100, ["positive"]));
    const bad = Array.from({ length: 6 }, (_, i) => trade(20 + i, -50, ["negative"]));
    const out = computeEdgeFinder([...clean, ...bad], 10_000);
    expect(out.find((x) => x.id === "system-edge")?.kind).toBe("strength");
    expect(out.find((x) => x.id === "edge-leak")?.kind).toBe("weakness");
    expect(out.find((x) => x.id === "mistake-entry")?.kind).toBe("weakness");
  });
});

describe("chart scales", () => {
  it("uses round tick marks that include zero", () => {
    const { ticks } = niceTicks(-3, 12.34, 5);
    expect(ticks).toContain(0);
    expect(ticks.every((t) => Number.isInteger(t * 2))).toBe(true);
  });
  it("places a value like 12.34 between marks instead of using it as a mark", () => {
    const s = yScale([3, 12.34]);
    expect(s.ticks).not.toContain(12.34);
    expect(s.domain[1]).toBeGreaterThanOrEqual(12.34);
  });
  it("per-trade x axes start at 0 and step in round numbers", () => {
    const x = tradeAxis(157);
    expect(x.ticks[0]).toBe(0);
    expect(x.ticks[1]! - x.ticks[0]!).toBe(10);
  });
});
