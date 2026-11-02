import { describe, expect, it } from "vitest";
import { plannedRisk } from "@/lib/pnl/risk";
import { inferAssetClass, quantityUnitOf } from "@/lib/pnl/asset-class";
import { enrichTrade, type TradeRow } from "@/lib/pnl/metrics";

const base = { entry_price: 1.1, quantity: 1, direction: "long", stop_loss: 1.095 };

describe("plannedRisk", () => {
  it("uses the stored risk first", () => {
    expect(plannedRisk({ ...base, risk_amount: 123 }, { symbol: "EURUSD", unit: "lots", accountCurrency: "USD" })).toBe(123);
  });
  it("stocks: distance x shares", () => {
    expect(plannedRisk({ ...base, entry_price: 50, stop_loss: 48, quantity: 10 }, { unit: "units", accountCurrency: "USD" })).toBe(20);
  });
  it("forex quoted in the account currency: distance x lots x 100,000", () => {
    expect(plannedRisk(base, { symbol: "EURUSD", unit: "lots", accountCurrency: "USD" })).toBeCloseTo(500, 6);
  });
  it("forex with the account currency as base converts at the entry price", () => {
    const r = plannedRisk({ entry_price: 150, stop_loss: 149, quantity: 1, direction: "long" }, { symbol: "USDJPY", unit: "lots", accountCurrency: "USD" });
    expect(r).toBeCloseTo(100000 / 150, 6);
  });
  it("shorts risk the other way", () => {
    expect(plannedRisk({ entry_price: 1.1, stop_loss: 1.105, quantity: 0.5, direction: "short" }, { symbol: "EURUSD", unit: "lots", accountCurrency: "USD" })).toBeCloseTo(250, 6);
  });
  it("is blank, not guessed, for a cross needing a third currency, an unknown unit, or a stop beyond break-even", () => {
    expect(plannedRisk(base, { symbol: "EURGBP", unit: "lots", accountCurrency: "USD" })).toBeNull();
    expect(plannedRisk(base, { symbol: "EURUSD", unit: null, accountCurrency: "USD" })).toBeNull();
    expect(plannedRisk({ ...base, stop_loss: 1.11 }, { symbol: "EURUSD", unit: "lots", accountCurrency: "USD" })).toBeNull();
    expect(plannedRisk({ ...base, stop_loss: null }, { symbol: "EURUSD", unit: "lots", accountCurrency: "USD" })).toBeNull();
  });
});

describe("asset class", () => {
  it("pairs are forex, other symbols are stocks, forex-only journals keep CFD names as forex", () => {
    expect(inferAssetClass("EURUSD")).toBe("forex");
    expect(inferAssetClass("XAUUSD.a")).toBe("forex");
    expect(inferAssetClass("AAPL")).toBe("stock");
    expect(inferAssetClass("US30", ["Forex"])).toBe("forex");
    expect(inferAssetClass("US30", ["Forex", "Stocks"])).toBe("stock");
  });
  it("quantity unit follows the instrument, then the journal", () => {
    expect(quantityUnitOf("stock", "lots")).toBe("units");
    expect(quantityUnitOf("forex", "units")).toBe("lots");
    expect(quantityUnitOf(null, "lots")).toBe("lots");
    expect(quantityUnitOf(null, null)).toBeNull();
  });
});

describe("enrichTrade R is consistent", () => {
  const row = (o: Partial<TradeRow>): TradeRow => ({
    id: "t", journal_id: "j", instrument_id: "i", setup_id: null, trading_plan_id: null, direction: "long", trade_type: "Spot",
    entry_at: "2026-01-01T10:00:00Z", exit_at: "2026-01-01T12:00:00Z", entry_price: 1.1, exit_price: 1.11, quantity: 1, stop_loss: 1.095, take_profit: null,
    high_price: null, low_price: null, otp_hit: null, gross_pnl: 1000, fees: 0, net_pnl: 1000, risk_amount: null, is_favorite: false, notes: null,
    created_at: "", is_break_even: false, trade_no: 1, ...o,
  });
  it("a typed-P&L forex trade with a stop has R even though risk_amount is empty", () => {
    const ctx = () => ({ unit: "lots" as const, accountCurrency: "USD" });
    const t = enrichTrade(row({}), new Map([["i", "EURUSD"]]), new Map(), [], ctx);
    expect(t.r).toBeCloseTo(2, 6); // 1000 / 500
  });
  it("without context it still only trusts the stored risk", () => {
    expect(enrichTrade(row({}), new Map([["i", "EURUSD"]]), new Map(), []).r).toBeNull();
    expect(enrichTrade(row({ risk_amount: 250 }), new Map(), new Map(), []).r).toBe(4);
  });
});
