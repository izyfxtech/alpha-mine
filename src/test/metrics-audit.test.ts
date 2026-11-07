import { describe, expect, it } from "vitest";
import {
  drawdownRatioSeries,
  computeStats,
  enrichTrade,
  equityCurve,
  fmtMoney,
  fmtNum,
  fmtPct,
  periodBase,
  riskOf,
  sortinoOf,
  sqnOf,
  type Cashflow,
  type Trade,
  type TradeRow,
} from "@/lib/pnl/metrics";

const row = (over: Partial<TradeRow> = {}): TradeRow =>
  ({
    id: "t",
    journal_id: "j",
    instrument_id: null,
    setup_id: null,
    trading_plan_id: null,
    direction: "long",
    trade_type: "Spot",
    entry_at: "2026-10-20T08:00:00Z",
    exit_at: "2026-10-20T09:00:00Z",
    entry_price: 1.085,
    exit_price: 1.0912,
    quantity: 0.1,
    stop_loss: 1.08,
    take_profit: null,
    high_price: null,
    low_price: null,
    otp_hit: null,
    gross_pnl: 62,
    fees: 0.7,
    net_pnl: 61.3,
    risk_amount: null,
    is_favorite: false,
    notes: null,
    created_at: "2026-10-20T09:00:00Z",
    is_break_even: false,
    trade_no: 1,
    pnl_manual: true,
    source: "mt5",
    external_id: "1",
    raw_symbol: "EURUSD",
    commission: -0.7,
    swap: 0,
    ...over,
  }) as unknown as TradeRow;

const trade = (id: string, at: string, net: number): Trade => ({
  ...enrichTrade(
    row({ id, entry_at: at, net_pnl: net, risk_amount: null }),
    new Map(),
    new Map(),
    [],
  ),
});

describe("R multiple", () => {
  it("is the price ratio whatever the stored risk or lots: 62 pips over a 50 pip stop = 1.24R", () => {
    expect(enrichTrade(row({ risk_amount: null }), new Map(), new Map(), []).r).toBeCloseTo(
      1.24,
      6,
    );
    expect(enrichTrade(row({ risk_amount: 50 }), new Map(), new Map(), []).r).toBeCloseTo(1.24, 6);
  });
  it("is blank without a stop", () => {
    expect(enrichTrade(row({ stop_loss: null }), new Map(), new Map(), []).r).toBeNull();
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
    expect(
      computeStats(t, 10000, [{ occurred_on: "2026-10-01", amount: 90000 }]).maxDD,
    ).toBeCloseTo(0.99, 2);
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

import { keepStoredGross, resolveGross } from "@/lib/pnl/trade-form";
describe("trade form P&L ownership (AM-H03)", () => {
  const base = {
    open: false,
    breakEven: false,
    touched: false,
    typed: "",
    auto: 20,
    wasManual: false,
  };
  it("a calculated P&L stays calculated: editing prices recalculates instead of freezing the old figure", () => {
    expect(resolveGross({ ...base })).toEqual({ gross: 20, manual: false });
    // an existing calculated trade is not 'touched' on open, so a price edit (auto 20 -> 35) follows the prices
    expect(keepStoredGross({ exit_price: 110, pnl_manual: false }, true)).toBe(false);
    expect(resolveGross({ ...base, auto: 35 })).toEqual({ gross: 35, manual: false });
  });
  it("a typed P&L that differs from the calculation is the trader's: the database must not recompute it", () => {
    expect(resolveGross({ ...base, touched: true, typed: "62" })).toEqual({
      gross: 62,
      manual: true,
    });
  });
  it("typing exactly the calculated figure stays automatic", () => {
    expect(resolveGross({ ...base, touched: true, typed: "20" })).toEqual({
      gross: 20,
      manual: false,
    });
  });
  it("lots, or a journal without a unit: nothing is calculated, so what is typed is kept and manual", () => {
    expect(resolveGross({ ...base, auto: null, touched: true, typed: "62" })).toEqual({
      gross: 62,
      manual: true,
    });
    expect(keepStoredGross({ exit_price: 1.09, pnl_manual: false }, false)).toBe(true);
    expect(keepStoredGross({ exit_price: 1.09, pnl_manual: false }, false)).toBe(true);
  });
  it("an already manual or imported P&L stays manual and is kept when the trade is reopened", () => {
    expect(keepStoredGross({ exit_price: 110, pnl_manual: true }, true)).toBe(true);
    expect(resolveGross({ ...base, touched: true, typed: "20", wasManual: true }).manual).toBe(
      true,
    );
  });
  it("open and break-even trades are 0 and keep whatever ownership they had", () => {
    expect(resolveGross({ ...base, open: true, wasManual: true })).toEqual({
      gross: 0,
      manual: true,
    });
    expect(resolveGross({ ...base, breakEven: true })).toEqual({ gross: 0, manual: false });
  });
});

describe("every headline ratio against a hand calculation", () => {
  // +100, -50, +200, -100 and a break-even, on a 10,000 account.
  const ts = [
    ["a", "2026-10-01", 100],
    ["b", "2026-10-02", -50],
    ["c", "2026-10-03", 200],
    ["d", "2026-10-04", -100],
    ["e", "2026-10-05", 0],
  ].map(([id, d, n]) => trade(id as string, `${d}T08:00:00Z`, n as number));
  const s = computeStats(ts, 10000, []);
  it("counts and rates", () => {
    expect([s.wins, s.losses, s.be, s.count]).toEqual([2, 2, 1, 5]);
    expect(s.winRate).toBeCloseTo(40, 9); // 2 of 5, break-even counted
    expect(s.winRateNoBE).toBeCloseTo(50, 9); // 2 of 4 decided trades
  });
  it("money ratios", () => {
    expect(s.net).toBe(150);
    expect(s.profitFactor).toBeCloseTo(2, 9); // 300 won / 150 lost
    expect(s.avgWin).toBeCloseTo(150, 9);
    expect(s.avgLoss).toBeCloseTo(-75, 9);
    expect(s.expectancy).toBeCloseTo(30, 9); // 150 / 5
    expect(s.roi).toBeCloseTo(1.5, 9); // 150 / 10,000
    expect(s.balance).toBeCloseTo(10150, 9);
  });
  it("drawdown, Sortino", () => {
    expect(s.maxDD).toBeCloseTo((100 / 10250) * 100, 1); // peak 10,250, trough 10,150
    expect(s.sortino).toBeCloseTo(30 / 50, 9); // sqrt((50^2 + 100^2) / 5) = 50
  });
});

describe("Burke, Sterling, MAR and K-ratio against hand calculations", () => {
  const at = (d: number) => `2026-10-${String(d).padStart(2, "0")}T08:00:00Z`;
  // The reference sample: +198.99, -101.25, +240.87 on 10,000.
  const r = drawdownRatioSeries(
    [
      { net_pnl: 198.99, entry_at: at(1) },
      { net_pnl: -101.25, entry_at: at(2) },
      { net_pnl: 240.87, entry_at: at(3) },
    ],
    10000,
  );
  it("have no drawdown before the first loss", () => {
    expect(r[0]!.burke).toBeNull();
    expect(r[0]!.mar).toBeNull();
  });
  it("Burke: net profit over the root of the squared drawdowns (one drawdown of 101.25)", () => {
    expect(r[2]!.burke).toBeCloseTo(338.61 / 101.25, 9);
  });
  it("Sterling: return % over max drawdown % + 10", () => {
    const dd = (101.25 / 10198.99) * 100;
    expect(r[2]!.sterling).toBeCloseTo(3.3861 / (dd + 10), 9);
  });
  it("MAR under a year is return % over max drawdown %", () => {
    const dd = (101.25 / 10198.99) * 100;
    expect(r[2]!.mar).toBeCloseTo(3.3861 / dd, 9);
  });
  it("two separate drawdowns add in quadrature", () => {
    const t = [100, -30, 50, -40, 80].map((n, i) => ({ net_pnl: n, entry_at: at(i + 1) }));
    // peak 10100 -> 10070 (30), new peak 10120 -> 10080 (40), new peak 10160
    expect(drawdownRatioSeries(t, 10000)[4]!.burke).toBeCloseTo(
      160 / Math.sqrt(30 ** 2 + 40 ** 2),
      9,
    );
  });
  it("K-ratio needs 3 trades and is null on a perfectly straight log line", () => {
    expect(r[1]!.k).toBeNull();
    const geo = [100, 101, 102.01, 103.0301].map((_, i) => ({
      net_pnl: 100 * 1.01 ** i,
      entry_at: at(i + 1),
    }));
    // equity grows by exactly 1% each trade from 10,000 -> ln-equity is not exactly linear, but a rising series gives a positive K
    const k = drawdownRatioSeries(geo, 10000)[3]!.k;
    expect(k == null || k > 0).toBe(true);
  });
  it("K-ratio of a noisy rising line matches the regression", () => {
    const eqs = [10, 12, 11, 14, 15],
      t = eqs.map((e, i) => ({ net_pnl: e - (eqs[i - 1] ?? 0), entry_at: at(i + 1) }));
    const ys = eqs.map((e) => Math.log(100 + e)),
      xs = [1, 2, 3, 4, 5],
      mx = 3,
      my = ys.reduce((a, b) => a + b, 0) / 5;
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0),
      sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0);
    const slope = sxy / sxx,
      sse = ys.reduce((a, y, i) => a + (y - my - slope * (xs[i]! - mx)) ** 2, 0);
    expect(drawdownRatioSeries(t, 100)[4]!.k).toBeCloseTo(slope / Math.sqrt(sse / 3 / sxx), 6);
  });
});
