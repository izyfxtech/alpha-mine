import { describe, expect, it } from "vitest";
import { groupValues, resolveValue, runningTotal } from "@/lib/compare";

describe("compare charts helpers", () => {
  it("lists distinct values sorted", () =>
    expect(groupValues(["b", "a", "b"], (x) => x)).toEqual(["a", "b"]));
  it("keeps a pick that still exists and falls back when it vanished", () => {
    expect(resolveValue(["Long", "Short"], "Short")).toBe("Short");
    expect(resolveValue(["Long"], "Short")).toBe("Long");
    expect(resolveValue([], "Short")).toBe("Short");
  });
  it("running total starts at 0 and accumulates", () =>
    expect(runningTotal([10, -4, 2.5])).toEqual([0, 10, 6, 8.5]));
});

import { followedPlanPct, type Trade } from "@/lib/pnl/metrics";
describe("followedPlanPct", () => {
  const t = (comments: { sentiment: string }[]) =>
    ({
      comments,
      followedPlan: !comments.some((c) => c.sentiment === "negative"),
    }) as unknown as Trade;
  it("judges only commented trades", () => {
    expect(
      followedPlanPct([
        t([]),
        t([]),
        t([{ sentiment: "positive" }]),
        t([{ sentiment: "negative" }]),
      ]),
    ).toBe(50);
  });
  it("is 0 when nothing is commented", () => expect(followedPlanPct([t([]), t([])])).toBe(0));
});
