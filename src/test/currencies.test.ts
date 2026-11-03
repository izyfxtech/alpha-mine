import { describe, expect, it } from "vitest";
import { CURRENCIES, isCurrencyCode, safeCurrency } from "@/lib/currencies";
import { fmtMoney } from "@/lib/pnl/metrics";

describe("currencies", () => {
  it("offers the currencies brokers report, including KES, GHS, BRL, MXN, SGD, AED", () => {
    for (const c of ["KES", "GHS", "BRL", "MXN", "SGD", "AED"]) expect(CURRENCIES).toContain(c);
    expect(CURRENCIES.every(isCurrencyCode)).toBe(true);
  });
  it("never throws on a bad code, so one legacy journal cannot blank the app", () => {
    expect(safeCurrency("USDT")).toBe("USD");
    expect(safeCurrency("")).toBe("USD");
    expect(safeCurrency(null)).toBe("USD");
    expect(safeCurrency("kes")).toBe("KES");
    expect(() => fmtMoney(1234.5, "USDT")).not.toThrow();
  });
});
