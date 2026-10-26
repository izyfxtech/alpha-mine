import { describe, expect, it } from "vitest";
import { computeEdgeFinder } from "@/lib/edge-finder";
import { niceTicks, tradeAxis, yScale } from "@/components/kit";
import type { Trade } from "@/lib/metrics";

type S = "positive" | "negative";
const DAY = 864e5;
const trade = (i: number, pnl: number, sentiments: S[] = [], extra: Partial<Trade> = {}): Trade => {
  const entry = new Date(Date.UTC(2025, 0, 1) + i * DAY + 10 * 3600e3);
  return {
    id: `t${i}`, journal_id: "j", instrument_id: null, setup_id: null, trading_plan_id: null, direction: "long", trade_type: "Spot",
    entry_at: entry.toISOString(), exit_at: new Date(entry.getTime() + 3600e3).toISOString(), entry_price: 100, exit_price: 100 + pnl / 10, quantity: 10,
    stop_loss: null, take_profit: null, high_price: null, low_price: null, otp_hit: null, gross_pnl: pnl, fees: 0, net_pnl: pnl, risk_amount: null,
    is_favorite: false, notes: null, created_at: entry.toISOString(), is_break_even: false, trade_no: i, pnl_manual: false,
    instrument: "EURUSD", setup: "Retest", customStats: [], tilt: 0, followedPlan: !sentiments.includes("negative"), accountSize: 10_000, retPct: pnl / 100, r: pnl / 50, holdMinutes: 60,
    comments: sentiments.map((sentiment, k) => ({ id: `c${i}${k}`, label: sentiment === "negative" ? "Revenge trade" : "Perfect entry", phase: "entry", sentiment })),
    ...extra,
  } as unknown as Trade;
};
const byId = (cards: ReturnType<typeof computeEdgeFinder>, id: string) => cards.find((c) => c.id === id)!;

describe("Edge Finder", () => {
  it("returns six cards that are not ready until there are 10 trades", () => {
    const cards = computeEdgeFinder(Array.from({ length: 9 }, (_, i) => trade(i, 10)), 10_000);
    expect(cards).toHaveLength(6);
    expect(cards.every((c) => !c.ready)).toBe(true);
  });
  it("rates a profitable journal and separates rule-following trades from mistakes", () => {
    const clean = Array.from({ length: 12 }, (_, i) => trade(i, 100, ["positive"]));
    const bad = Array.from({ length: 6 }, (_, i) => trade(20 + i, -50, ["negative"]));
    const cards = computeEdgeFinder([...clean, ...bad], 10_000);
    expect(byId(cards, "profitability").rating).toBe("good");
    const edge = byId(cards, "system-edge");
    expect(edge.ready).toBe(true);
    const metric = edge.sections.find((s) => s.id === "edge");
    expect(metric?.kind === "metric" && metric.value).toBe("12.0%");
    const table = edge.sections.find((s) => s.kind === "table");
    expect(table?.kind === "table" && table.rows[0]?.cells[0]).toBe("Entry Comments");
    // no stop loss / take profit on any trade, so Trade Management has nothing to say yet
    expect(byId(cards, "management").ready).toBe(false);
  });
  it("shows a trend once the journal is older than 30 days", () => {
    const trades = Array.from({ length: 60 }, (_, i) => trade(i, i % 3 ? 40 : -20, ["positive"]));
    const cards = computeEdgeFinder(trades, 10_000);
    expect(byId(cards, "profitability").trend).toBeDefined();
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
