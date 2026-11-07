import { describe, expect, it } from "vitest";
import { grossPnl, rMultiple, rewardRisk, riskMoney } from "@/lib/pnl/calc";
import { assetClassFor, resolveInstrument, specFor } from "@/lib/pnl/instrument-catalogue";
import { enrichTrade, type TradeRow } from "@/lib/pnl/metrics";

const long = { direction: "long", entry_price: 1.085, stop_loss: 1.08, exit_price: 1.0912 };

describe("R is a ratio of prices", () => {
  it("is the same for any instrument and scale", () => {
    expect(rMultiple(long)).toBeCloseTo(1.24, 6);
    expect(
      rMultiple({ direction: "long", entry_price: 2350, stop_loss: 2335, exit_price: 2380 }),
    ).toBe(2);
    expect(
      rMultiple({ direction: "short", entry_price: 100, stop_loss: 105, exit_price: 90 }),
    ).toBe(2);
    expect(rMultiple({ direction: "long", entry_price: 100, stop_loss: 95, exit_price: 95 })).toBe(
      -1,
    );
  });
  it("is blank, never guessed, without a usable stop or exit", () => {
    expect(rMultiple({ ...long, stop_loss: null })).toBeNull();
    expect(rMultiple({ ...long, exit_price: null })).toBeNull();
    expect(rMultiple({ ...long, stop_loss: 1.09 })).toBeNull();
  });
  it("break-even is 0R and the target gives the planned RR", () => {
    expect(rMultiple({ ...long, is_break_even: true })).toBe(0);
    expect(rewardRisk({ ...long, take_profit: 1.095 })).toBeCloseTo(2, 6);
    expect(rewardRisk({ ...long, take_profit: 1.07 })).toBeNull();
  });
});

describe("money from the asset class", () => {
  const eu = specFor("EURUSD");
  it("forex lots on a USD account", () => {
    expect(grossPnl({ ...long, quantity: 0.1 }, eu, "USD")).toBe(62);
    expect(riskMoney({ ...long, quantity: 0.1 }, eu, "USD")).toBe(50);
  });
  it("base-currency account divides by price; a third currency is null", () => {
    const t = { direction: "long", entry_price: 150, stop_loss: 149, exit_price: 151, quantity: 1 };
    expect(riskMoney(t, specFor("USDJPY"), "USD")).toBeCloseTo(100000 / 150, 2);
    expect(riskMoney({ ...long, quantity: 1 }, specFor("EURGBP"), "USD")).toBeNull();
  });
  it("stocks are price move x shares", () => {
    expect(
      riskMoney(
        { direction: "long", entry_price: 50, stop_loss: 48, quantity: 10 },
        specFor("AAPL"),
        "USD",
      ),
    ).toBe(20);
  });
});

describe("catalogue", () => {
  it("classes and units", () => {
    expect(specFor("XAUUSD.a")).toMatchObject({
      assetClass: "metal",
      unit: "lots",
      contractSize: 100,
    });
    expect(specFor("BTCUSDT")).toMatchObject({ assetClass: "crypto", unit: "units" });
    expect(specFor("GOLD").symbol).toBe("XAUUSD");
    expect(specFor("AAPL")).toMatchObject({ assetClass: "stock", unit: "units", known: false });
    expect(specFor("NG").assetClass).toBe("stock"); // bare futures roots are stock tickers
    expect(resolveInstrument("NGZ6")?.spec.assetClass).toBe("future");
    expect(assetClassFor("EURUSD")).toBe("forex");
  });
  it("forex-only journals read unknown broker names as lot contracts of unknown size", () => {
    const s = specFor("XYZ100", { markets: ["Forex"] });
    expect(s.unit).toBe("lots");
    expect(grossPnl({ ...long, quantity: 1 }, s, "USD")).toBeNull();
  });
});

describe("enrichTrade", () => {
  const row = (o: Partial<TradeRow>): TradeRow => ({
    id: "t",
    journal_id: "j",
    instrument_id: "i",
    setup_id: null,
    trading_plan_id: null,
    direction: "long",
    trade_type: "Spot",
    entry_at: "2026-01-01T10:00:00Z",
    exit_at: "2026-01-01T12:00:00Z",
    entry_price: 1.1,
    exit_price: 1.11,
    quantity: 1,
    stop_loss: 1.095,
    take_profit: null,
    high_price: null,
    low_price: null,
    otp_hit: null,
    gross_pnl: 1000,
    fees: 0,
    net_pnl: 1000,
    risk_amount: null,
    is_favorite: false,
    notes: null,
    created_at: "",
    is_break_even: false,
    trade_no: 1,
    ...o,
  });
  it("every trade with a stop and exit has R, with or without money context", () => {
    const im = new Map([["i", "EURGBP"]]);
    expect(enrichTrade(row({}), im, new Map(), []).r).toBeCloseTo(2, 6);
    const t = enrichTrade(row({}), im, new Map(), [], () => ({
      spec: specFor("EURGBP"),
      account: "USD",
    }));
    expect(t.r).toBeCloseTo(2, 6);
    expect(t.risk_amount).toBeNull(); // a cross needs a rate: money blank, R fine
  });
});

describe("blank R reasons", () => {
  it("says why", async () => {
    const { rBlankReason } = await import("@/lib/pnl/calc");
    expect(rBlankReason({ ...long, stop_loss: null })).toBe("No stop loss");
    expect(rBlankReason({ ...long, stop_loss: 0 })).toBe("No stop loss");
    expect(rBlankReason({ ...long, stop_loss: 1.09 })).toMatch(/moved to or past entry/);
    expect(rBlankReason(long)).toBeNull();
  });
});

describe("initial stop", () => {
  const trailed = {
    direction: "short",
    entry_price: 0.56652,
    stop_loss: 0.56644,
    initial_stop: 0.56882,
    exit_price: 0.56192,
  };
  it("R uses the stop the trade was opened with, not the trailed one", () => {
    expect(rMultiple(trailed)).toBeCloseTo((0.56652 - 0.56192) / (0.56882 - 0.56652), 6); // 2R
    expect(rMultiple({ ...trailed, initial_stop: null })).toBeNull(); // trailed into profit, nothing recorded
  });
});
