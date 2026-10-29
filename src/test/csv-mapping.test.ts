// @vitest-environment node
import { describe, expect, it } from "vitest";
import { detectHeaderRow, parseCsv, looksLikeFills, suggestMapping } from "@/lib/import/csv-mapping";
import { detectHeaderRow, parseCsv, looksLikeFills, suggestMapping } from "@/lib/csv-mapping";

describe("suggestMapping", () => {
  it("maps a typical fills export and recognises it as fills", () => {
    const m = suggestMapping(["Fill ID", "Symbol", "Buy/Sell", "Qty", "Fill Price", "Fill Time", "Commission"]);
    expect(m).toEqual({ instrument: "Symbol", direction: "Buy/Sell", quantity: "Qty", entry_price: "Fill Price", entry_at: "Fill Time", fees: "Commission" });
    expect(looksLikeFills(m)).toBe(true);
  });

  it("maps a one-row-per-trade export and does not call it fills", () => {
    const m = suggestMapping(["Open Time", "Close Time", "Symbol", "Type", "Volume", "Open Price", "Close Price", "Profit", "Swap", "Commission"]);
    expect(m).toMatchObject({ entry_at: "Open Time", exit_at: "Close Time", instrument: "Symbol", quantity: "Volume", entry_price: "Open Price", exit_price: "Close Price", gross_pnl: "Profit", fees: "Commission" });
    expect(looksLikeFills(m)).toBe(false);
  });

  it("never uses one header for two fields, and prefers specific names over bare 'price'", () => {
    const m = suggestMapping(["Time", "Symbol", "Side", "Size", "Price", "Exit Price"]);
    expect(m.entry_price).toBe("Price");
    expect(m.exit_price).toBe("Exit Price");
    expect(new Set(Object.values(m)).size).toBe(Object.values(m).length);
  });

  it("ignores unrecognised columns instead of guessing", () => {
    expect(suggestMapping(["Foo", "Bar"])).toEqual({});
  });
});

describe("detectHeaderRow", () => {
  it("skips a preamble above the table", () => {
    const rows = [["Account Information"], ["Name", "Jane"], [""], ["Symbol", "Date/Time", "Quantity", "Price", "Commission"], ["EURUSD", "2026-10-01", "1", "1.1", "-1"]];
    expect(detectHeaderRow(rows)).toBe(3);
  });
  it("keeps row 0 when nothing is recognisable", () => {
    expect(detectHeaderRow([["a", "b"], ["c", "d"]])).toBe(0);
  });
});

describe("parseCsv", () => {
  it("handles quoted commas, doubled quotes, CRLF, a BOM and blank lines", () => {
    const text = '\uFEFFSymbol,Note,Price\r\n"ES","said ""hi"", ok","1,234.50"\r\n\r\nNQ,x,2\n';
    expect(parseCsv(text)).toEqual([["Symbol", "Note", "Price"], ["ES", 'said "hi", ok', "1,234.50"], ["NQ", "x", "2"]]);
  });
});
