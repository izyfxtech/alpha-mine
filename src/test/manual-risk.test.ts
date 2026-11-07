// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PnlEngine, RateResolver } from "@engine/index.ts";
import {
  guessDigits,
  mapTrade,
  type InstrumentRow,
  type JournalRow,
  type TradeRow,
} from "@shared/pnl-map.ts";
import { StaticProvider } from "./pnl-engine/helpers.ts";

/** The audit's own example, entered BY HAND in a lots journal: the P&L is typed (pnl_manual), no risk stored yet. */
const manual: TradeRow = {
  id: "t1",
  direction: "long",
  entry_at: "2026-10-20T08:15:00Z",
  exit_at: "2026-10-20T12:40:00Z",
  entry_price: "1.08500",
  exit_price: "1.09120",
  quantity: 0.1,
  stop_loss: "1.08000",
  take_profit: null,
  gross_pnl: 62,
  net_pnl: 61.3,
  fees: 0.7,
  commission: null,
  swap: null,
  risk_amount: null,
  source: "manual",
  raw_symbol: null,
  is_break_even: false,
  pnl_manual: true,
  instrument_id: "i1",
};
const ins: InstrumentRow = {
  id: "i1",
  symbol: "EURUSD",
  contract_size: null,
  digits: null,
  profit_currency: null,
  kind: null,
};
const lots: JournalRow = { id: "j", currency: "USD", quantity_unit: "lots" };

describe("a hand-entered forex trade gets its R (the regression after the audit bundle)", () => {
  it("is mapped by the engine even though its P&L was typed", () => {
    const m = mapTrade(manual, ins, lots, guessDigits([manual]));
    expect("trade" in m).toBe(true);
  });
  it("the engine plans 50 USD of risk for 0.10 lot with a 50-pip stop, which is 1.226R on a 61.30 net", async () => {
    const m = mapTrade(manual, ins, lots, guessDigits([manual]));
    if (!("trade" in m)) throw new Error(m.skip);
    const r = await new PnlEngine({
      rates: new RateResolver({ providers: [new StaticProvider("ext", {})] }),
      validationRates: new RateResolver({ providers: [new StaticProvider("ext", {})] }),
    } as never).computeClosed(m.trade);
    expect(Number(r.plannedRisk?.toString())).toBeCloseTo(50, 6);
  });
});
