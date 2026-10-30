import { describe, expect, it } from "vitest";
import { computeInsights } from "@/lib/pnl/insights";
import type { Trade } from "@/lib/pnl/metrics";

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 10)).toISOString();
const win = (i: number, entry: string): Trade => ({ id: `t${i}`, instrument: "EURUSD", direction: "long", entry_at: entry, exit_at: entry, exit_price: 1.1, net_pnl: 10, tilt: 0, comments: [], take_profit: null, setup: "S" } as unknown as Trade);

describe("computeInsights", () => {
  // Five wins in a row on 1–5 Oct 2026, plus five more on 20–24 Oct.
  const old = [1, 2, 3, 4, 5].map((d, i) => win(i, day(d)));
  const gap = { ...win(9, day(10)), net_pnl: -10 } as Trade; // a loss ends the first streak
  const recent = [20, 21, 22, 23, 24].map((d, i) => win(10 + i, day(d)));
  const NOW = Date.UTC(2026, 9, 25);

  it("only reports recent events, so an imported history does not flood the bell", () => {
    const all = computeInsights([...old, gap, ...recent], NOW);
    expect(all.filter((i) => i.title === "5 Wins in a Row!").map((i) => i.tradeId)).toEqual(["t14"]);
  });
  it("still counts old trades towards streaks and can be widened", () => {
    expect(computeInsights(old, NOW, 365).some((i) => i.title === "5 Wins in a Row!")).toBe(true);
    expect(computeInsights(old, NOW).length).toBe(0);
  });
});
