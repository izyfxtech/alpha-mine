import { describe, expect, it } from "vitest";
import { defaultKeeper, looksLikeDuplicate, mergeBlocker } from "@/lib/journal/merge-trades";

const t = (
  o: Partial<{
    id: string;
    direction: string;
    entry_at: string;
    entry_price: number;
    quantity: number;
    external_id: string | null;
    instrument_id: string | null;
  }> = {},
) => ({
  id: "a",
  direction: "long",
  entry_at: "2026-10-21T08:00:00Z",
  entry_price: 1.1,
  quantity: 0.1,
  external_id: null,
  instrument_id: "i1",
  ...o,
});

describe("merge: same trade or parts of one position", () => {
  it("a hand-typed trade and its import look like one trade, even with a clock offset and a rounded price", () => {
    expect(
      looksLikeDuplicate([
        t({ id: "m" }),
        t({ id: "i", external_id: "99", entry_at: "2026-10-21T10:03:00Z", entry_price: 1.10004 }),
      ]),
    ).toBe(true);
  });
  it("scale-in legs (different size, later entry price) do not", () => {
    expect(
      looksLikeDuplicate([
        t({ id: "1", quantity: 0.1 }),
        t({ id: "2", quantity: 0.3, entry_price: 1.12 }),
      ]),
    ).toBe(false);
    expect(looksLikeDuplicate([t({ id: "1" }), t({ id: "2", entry_price: 1.12 })])).toBe(false);
    expect(
      looksLikeDuplicate([t({ id: "1" }), t({ id: "2", entry_at: "2026-10-23T08:00:00Z" })]),
    ).toBe(false);
  });
  it("opposite directions are never duplicates", () => {
    expect(looksLikeDuplicate([t({ id: "1" }), t({ id: "2", direction: "short" })])).toBe(false);
  });
  it("the imported trade's numbers win by default, otherwise the earliest", () => {
    expect(
      defaultKeeper([
        t({ id: "m", entry_at: "2026-10-21T07:00:00Z" }),
        t({ id: "i", external_id: "9" }),
      ])?.id,
    ).toBe("i");
    expect(
      defaultKeeper([t({ id: "late", entry_at: "2026-10-21T09:00:00Z" }), t({ id: "early" })])?.id,
    ).toBe("early");
  });
  it("a duplicate may differ in instrument (broker spelling), parts of one position may not; direction never", () => {
    const a = t({ id: "1" }),
      b = t({ id: "2", instrument_id: "i2" });
    expect(mergeBlocker([a, b], "duplicate")).toBeNull();
    expect(mergeBlocker([a, b], "combine")).toMatch(/same instrument/);
    expect(mergeBlocker([a, t({ id: "3", direction: "short" })], "duplicate")).toMatch(/opposite/);
    expect(mergeBlocker([a], "combine")).toMatch(/at least two/);
  });
});
