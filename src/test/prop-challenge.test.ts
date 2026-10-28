// @vitest-environment node
import { describe, expect, it } from "vitest";
import { dayKey, evaluateChallenge, type Challenge, type ChallengeTrade, type Rule } from "@/lib/prop-challenge";

const D = (day: number, h = 12) => Date.UTC(2026, 9, day, h);
const t = (day: number, net: number, h = 12): ChallengeTrade => ({ exitMs: D(day, h), net });
const pct = (value: number) => ({ value, unit: "percent" as const });
const base = (rules: Rule[]): Challenge => ({ startBalance: 100_000, rules });
const status = (p: ReturnType<typeof evaluateChallenge>, id: string) => p.rules.find((r) => r.id === id)!.status;

describe("evaluateChallenge", () => {
  it("passes on the first trade after which every rule is met, and stops there", () => {
    const c = base([
      { id: "t", kind: "profit_target", target: pct(10) },
      { id: "d", kind: "min_trading_days", days: 3 },
      { id: "dd", kind: "max_drawdown", limit: pct(10), mode: "static" },
    ]);
    const p = evaluateChallenge(c, [t(1, 6000), t(2, 5000), t(3, 1000), t(4, -50_000)]);
    expect(p.status).toBe("passed");
    expect(p.endedAtMs).toBe(D(3)); // day 3 satisfies target and 3 trading days; the later loss is irrelevant
    expect(p.profit).toBe(12_000);
  });

  it("does not pass on profit alone while minimum days are outstanding", () => {
    const c = base([{ id: "t", kind: "profit_target", target: pct(10) }, { id: "d", kind: "min_trading_days", days: 4 }]);
    const p = evaluateChallenge(c, [t(1, 12_000)]);
    expect(p.status).toBe("active");
    expect(status(p, "t")).toBe("met");
    expect(status(p, "d")).toBe("pending");
  });

  it("fails on a static drawdown breach, treating exactly the floor as a breach", () => {
    const c = base([{ id: "t", kind: "profit_target", target: pct(10) }, { id: "dd", kind: "max_drawdown", limit: pct(10), mode: "static" }]);
    const p = evaluateChallenge(c, [t(1, -4000), t(2, -6000), t(3, 20_000)]);
    expect(p.status).toBe("failed");
    expect(p.endedAtMs).toBe(D(2));
    expect(p.floor).toBe(90_000);
  });

  it("fails on a daily loss breach even when the account is above its drawdown floor", () => {
    const c = base([{ id: "dl", kind: "daily_loss", limit: pct(5) }, { id: "t", kind: "profit_target", target: pct(10) }]);
    const p = evaluateChallenge(c, [t(1, -3000, 9), t(1, -2500, 15)]);
    expect(p.status).toBe("failed");
    expect(p.endedAtMs).toBe(D(1, 15));
  });

  it("EOD trailing ratchets only at day close; intraday trailing ratchets on every trade", () => {
    const rules = (mode: "eod_trailing" | "intraday_trailing"): Rule[] => [{ id: "dd", kind: "max_drawdown", limit: { value: 5000, unit: "absolute" }, mode }];
    // +8000 then -6000 on the same day: balance 102000. Intraday floor = 108000-5000 = 103000 -> breached. EOD floor still 95000.
    const trades = [t(1, 8000, 10), t(1, -6000, 14)];
    expect(evaluateChallenge(base(rules("intraday_trailing")), trades).status).toBe("failed");
    const eod = evaluateChallenge(base(rules("eod_trailing")), trades);
    expect(eod.status).toBe("active");
    expect(eod.floor).toBe(95_000);
    // Next day the EOD peak (102000) applies: floor 97000, so -5100 breaches.
    expect(evaluateChallenge(base(rules("eod_trailing")), [...trades, t(2, -5100)]).status).toBe("failed");
  });

  it("lockAtStart stops a trailing floor rising above the starting balance", () => {
    const c = base([{ id: "dd", kind: "max_drawdown", limit: { value: 5000, unit: "absolute" }, mode: "eod_trailing", lockAtStart: true }]);
    const p = evaluateChallenge(c, [t(1, 20_000), t(2, 1000)]);
    expect(p.floor).toBe(100_000);
  });

  it("consistency compares the best day with total profit", () => {
    const c = base([{ id: "c", kind: "consistency", maxBestDayPercent: 50 }]);
    expect(status(evaluateChallenge(c, [t(1, 3000), t(2, 1000)]), "c")).toBe("pending"); // 75%
    expect(status(evaluateChallenge(c, [t(1, 2000), t(2, 2000), t(3, 1000)]), "c")).toBe("met"); // 40%
    expect(status(evaluateChallenge(c, [t(1, -500)]), "c")).toBe("pending");
  });

  it("counts profitable days against a daily minimum", () => {
    const c = base([{ id: "p", kind: "min_profitable_days", days: 2, minDailyProfit: 200 }]);
    const p = evaluateChallenge(c, [t(1, 250), t(2, 150), t(3, 300)]);
    expect(p.rules[0]!.detail).toBe("2 / 2 days");
    expect(status(p, "p")).toBe("met");
  });

  it("ignores trades before the challenge start and sorts out-of-order input", () => {
    const c: Challenge = { ...base([{ id: "t", kind: "profit_target", target: { value: 500, unit: "absolute" } }]), startMs: D(5) };
    const p = evaluateChallenge(c, [t(9, 300), t(2, 99_999), t(6, 300)]);
    expect(p.profit).toBe(600);
    expect(p.status).toBe("passed");
    expect(p.endedAtMs).toBe(D(9));
  });

  it("cuts days in the configured time zone", () => {
    // 23:30 UTC on the 1st is already the 2nd in GMT+2 (Europe/Athens, summer GMT+3).
    expect(dayKey(Date.UTC(2026, 9, 1, 23, 30), "UTC")).toBe("2026-10-01");
    expect(dayKey(Date.UTC(2026, 9, 1, 23, 30), "Europe/Athens")).toBe("2026-10-02");
  });

  it("without a profit target a challenge never auto-passes", () => {
    const p = evaluateChallenge(base([{ id: "d", kind: "min_trading_days", days: 1 }]), [t(1, 100)]);
    expect(p.status).toBe("active");
  });

  it("reports a fresh challenge sensibly", () => {
    const p = evaluateChallenge(base([{ id: "t", kind: "profit_target", target: pct(10) }, { id: "dd", kind: "max_drawdown", limit: pct(10), mode: "static" }]), []);
    expect(p).toMatchObject({ status: "active", balance: 100_000, profit: 0, floor: 90_000, tradingDays: 0, bestDay: null });
  });
});
