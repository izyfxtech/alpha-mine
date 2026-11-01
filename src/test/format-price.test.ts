import { describe, expect, it } from "vitest";
import { fmtPrice } from "@/lib/pnl/format-price";

describe("fmtPrice: forex prices are never cut to 3 decimals", () => {
  it.each([
    [1.085, "1.08500"], [1.0912, "1.09120"], [1.08, "1.08000"], [1.09512, "1.09512"],
    [150.123, "150.123"], [150.12, "150.120"], [149.5, "149.500"],
    [2650.4, "2,650.40"], [65000.5, "65,000.50"], [0.00001234, "0.00001234"], [0.7, "0.70000"],
    ["1.0850", "1.08500"], [1.123456789, "1.12345679"],
  ])("%s -> %s", (v, out) => expect(fmtPrice(v as number)).toBe(out));
  it("keeps every decimal the number carries, up to 8", () => {
    expect(fmtPrice(1.0850123)).toBe("1.0850123");
    expect(fmtPrice(12345.6789)).toBe("12,345.6789");
  });
  it("uses the instrument's own digits when known, without ever cutting a carried decimal", () => {
    expect(fmtPrice(1.085, 5)).toBe("1.08500");
    expect(fmtPrice(150.1, 3)).toBe("150.100");
    expect(fmtPrice(1.08512, 3)).toBe("1.08512");
  });
  it("is empty for missing values", () => {
    expect(fmtPrice(null)).toBe(""); expect(fmtPrice(undefined)).toBe(""); expect(fmtPrice("")).toBe(""); expect(fmtPrice(NaN)).toBe("");
  });
});
