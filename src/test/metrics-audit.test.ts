import { describe, expect, it } from "vitest";
import { computeStats, enrichTrade, equityCurve, fmtMoney, fmtNum, fmtPct, periodBase, riskOf, sortinoOf, sqnOf, type Cashflow, type Trade, type TradeRow } from "@/lib/pnl/metrics";

const row = (over: Partial<TradeRow> = {}): TradeRow => ({
  id: "t", journal_id: "j", instrument_id: null, setup_id: null, trading_plan_id: null, direction: "long", trade_type: "Spot",
  entry_at: "2026-10-20T08:00:00Z", exit_at: "2026-10-20T09:00:00Z", entry_price: 1.085, exit_price: 1.0912, quantity: 0.1,
  stop_loss: 1.08, take_profit: null, high_price: null, low_price: null, otp_hit: null, gross_pnl: 62, fees: 0.7, net_pnl: 61.3,
  risk_amount: null, is_favorite: false, notes: null, created_at: "2026-10-20T09:00:00Z", is_break_even: false, trade_no: 1, pnl_manual: true,
  source: "mt5", external_id: "1", raw_symbol: "EURUSD", commission: -0.7, swap: 0, ...over,
} as unknown as TradeRow);

const trade = (id: string, at: string, net: number): Trade => ({ ...enrichTrade(row({ id, entry_at: at, net_pnl: net, risk_amount: null }), new Map(), new Map(), []) });

describe("R multiple (AM-H01)", () => {
  it("is null, not lots-as-units nonsense, when risk_amount is unknown", () => {
    expect(riskOf(row({ risk_amount: null }))).toBeNull();
    expect(enrichTrade(row({ risk_amount: null }), new Map(), new Map(), []).r).toBeNull();
  });
  it("is net P&L over the stored risk when it is known: 61.30 / 50 = 1.226", () => {
    expect(enrichTrade(row({ risk_amount: 50 }), new Map(), new Map(), []).r).toBeCloseTo(1.226, 6);
  });
});

describe("balance, ROI and drawdown include cashflows (AM-H06)", () => {
  const flows: Cashflow[] = [{ occurred_on: "2026-10-01", amount: 5000 }];
  it("start 10,000 + 5,000 deposit + 61.30 trade = 15,061.30 in every consumer", () => {
    const t = [trade("a", "2026-10-20T08:00:00Z", 61.3)];
    expect(computeStats(t, 10000, flows).balance).toBeCloseTo(15061.3, 6);
    expect(equityCurve(t, 10000, flows).at(-1)!.equity).toBeCloseTo(15061.3, 6);
  });
  it("a 90,000 deposit does not turn a 1,000 win then loss into a 9.09% drawdown (it is 0.99%)", () => {
    const t = [trade("a", "2026-10-20T08:00:00Z", 1000), trade("b", "2026-10-21T08:00:00Z", -1000)];
    expect(computeStats(t, 10000, [{ occurred_on: "2026-10-01", amount: 90000 }]).maxDD).toBeCloseTo(0.99, 2);
  });
  it("a withdrawal is not a drawdown", () => {
    const t = [trade("a", "2026-10-20T08:00:00Z", 100), trade("b", "2026-10-22T08:00:00Z", 100)];
    expect(computeStats(t, 10000, [{ occurred_on: "2026-10-21", amount: -5000 }]).maxDD).toBe(0);
  });
});

describe("ratios (AM-M10)", () => {
  it("Sortino uses downside deviation over all trades: P&L 100, -50, -150, 200 gives 0.316", () => {
    expect(sortinoOf([100, -50, -150, 200])).toBeCloseTo(0.3162, 3);
  });
  it("SQN needs two R values and caps n at 100", () => {
    expect(sqnOf([1])).toBe(0);
    expect(sqnOf([1, 2, 3])).toBeCloseTo((2 / 1) * Math.sqrt(3), 6);
  });
});

describe("formatting (AM-L05)", () => {
  it("NaN is not shown as infinity", () => {
    expect(fmtMoney(NaN)).toBe("–");
    expect(fmtPct(NaN)).toBe("–");
    expect(fmtNum(NaN)).toBe("–");
    expect(fmtNum(Infinity)).toBe("∞");
  });
});

describe("period reports use the balance at the start of their own period (AM-X02)", () => {
  const all = [trade("a", "2025-06-10T08:00:00Z", 500), trade("b", "2026-03-10T08:00:00Z", 300)];
  const flows: Cashflow[] = [{ occurred_on: "2026-01-15", amount: 10000 }];
  it("a 2026 deposit does not enter 2025's return base", () => {
    const p = periodBase(all, 10000, flows, "2025-01-01", "2025-12-31");
    expect(p.base).toBe(10000);
    expect(p.flows).toHaveLength(0);
    expect(computeStats([all[0]!], p.base, p.flows).roi).toBeCloseTo(5, 6); // 500 / 10,000
  });
  it("2026 starts from start + 2025 P&L, with its own deposit applied inside the year", () => {
    const p = periodBase(all, 10000, flows, "2026-01-01", "2026-12-31");
    expect(p.base).toBe(10500);
    expect(p.flows).toHaveLength(1);
    expect(computeStats([all[1]!], p.base, p.flows).roi).toBeCloseTo((300 / 20500) * 100, 6);
  });
});
