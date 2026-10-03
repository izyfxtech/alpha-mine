import { describe, expect, it } from "vitest";
import { defaultJournalTableLayout, equityColorOffset, moveJournalColumn, normalizeJournalTableLayout, suggestedColumnWidth } from "@/lib/journal-table-layout";

describe("journal table layout", () => {
  const keys = ["entry", "instrument", "pnl"];

  it("restores the default order, hidden columns, and widths", () => {
    expect(defaultJournalTableLayout(keys)).toEqual({ order: keys, hidden: ["id", "gross_pnl", "r", "risk_amount", "notes"], widths: {} });
  });

  it("moves a column before its drop target", () => {
    expect(moveJournalColumn(keys, "pnl", "entry")).toEqual(["pnl", "entry", "instrument"]);
  });

  it("keeps saved layout valid when columns change", () => {
    expect(normalizeJournalTableLayout({ order: ["pnl", "gone"], hidden: ["gone"], widths: { pnl: 123, gone: 90 } }, keys))
      .toEqual({ order: ["pnl", "entry", "instrument"], hidden: [], widths: { pnl: 123 } });
  });

  it("bounds automatic widths", () => {
    expect(suggestedColumnWidth("P&L", [1], 76, 240)).toBe(76);
    expect(suggestedColumnWidth("Notes", ["x".repeat(100)], 76, 240)).toBe(240);
  });
});

describe("equity baseline color", () => {
  it("places the color break at the initial equity", () => {
    expect(equityColorOffset(28_000, 36_000, 30_000)).toBe(0.75);
  });
});