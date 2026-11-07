import { describe, expect, it } from "vitest";
import { filtersSchema, parseRules, parseSharedJournal } from "@/lib/validation/schemas";

describe("saved filters", () => {
  it("keeps valid fields, drops bad ones and unknown keys", () => {
    const out = filtersSchema.parse({
      instrument: ["EURUSD"],
      direction: "sideways",
      month: "3",
      legacy: true,
      lastTrades: 20,
    });
    expect(out).toEqual({ instrument: ["EURUSD"], lastTrades: 20 });
  });
  it("accepts an empty set", () => expect(filtersSchema.parse({})).toEqual({}));
});

describe("prop challenge rules", () => {
  const good = { id: "r1", kind: "profit_target", target: { value: 10, unit: "percent" } };
  it("skips malformed rules instead of failing the page", () => {
    expect(
      parseRules([good, { id: "r2", kind: "unknown" }, { id: "r3", kind: "daily_loss" }, null]),
    ).toEqual([good]);
  });
  it("treats anything that is not a list as no rules", () => {
    expect(parseRules(null)).toEqual([]);
    expect(parseRules({ a: 1 })).toEqual([]);
  });
});

describe("shared journal response", () => {
  const ok = {
    name: "J",
    currency: "USD",
    starting_balance: 1000,
    trades: [
      {
        entry_at: "2026-01-01T00:00:00Z",
        net_pnl: 5,
        direction: "long",
        instrument: null,
        setup: null,
      },
    ],
  };
  it("is null for a link that does not exist", () => expect(parseSharedJournal(null)).toBeNull());
  it("passes a well-formed response through", () => expect(parseSharedJournal(ok)).toEqual(ok));
  it("rejects a response of the wrong shape rather than showing garbage", () => {
    expect(() => parseSharedJournal({ name: "J" })).toThrow();
    expect(() => parseSharedJournal({ ...ok, trades: [{ net_pnl: "5" }] })).toThrow();
  });
});
